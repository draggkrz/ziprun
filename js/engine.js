// Silnik treningu: odlicza segmenty, wysyła komendy do bieżni i pilnuje,
// żeby zmiany prędkości były zapowiedziane i stopniowe.

import { resolvePlan, fmtTime } from './plans.js';

const TICK_MS = 250;

/** Polski syntezator czyta "13.5" jako liczby oddzielone kropką - potrzebny przecinek. */
const spoken = (n) => n.toFixed(1).replace('.', ',');

const RAMP_LEAD_S = 6;      // ile sekund przed segmentem zaczynamy rozpędzać pas
const ANNOUNCE_LEAD_S = 10; // ile sekund przed segmentem leci zapowiedź

export const STATE = {
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished',
  ABORTED: 'aborted',
};

export class WorkoutEngine {
  constructor(treadmill, speech) {
    this.tm = treadmill;
    this.speech = speech;
    this.state = STATE.IDLE;
    this.plan = null;
    this.segIndex = 0;
    this.segElapsed = 0;
    this.totalElapsed = 0;
    this.speedOffset = 0;      // ręczna korekta użytkownika, km/h
    this.inclineOffset = 0;
    this.autoControl = true;
    this._timer = null;
    this._lastTs = 0;
    this._announced = -1;
    this._ramped = -1;
    this._lastMachineDist = null;
    this.distanceM = 0;
    this.ramping = null;       // trwajaca zmiana predkosci przed odcinkiem
    this._lastSampleBucket = -1;
    this.samples = [];         // do wykresu i historii
    this._cb = { tick: [], segment: [], state: [], msg: [], ended: [] };

    this.tm.on('status', (s) => {
      // Kluczyk bezpieczeństwa wyjęty albo użytkownik zatrzymał pas z konsoli.
      if (s.opcode === 0x03) this.abort('Wyjęty kluczyk bezpieczeństwa — trening przerwany.');
      if (s.opcode === 0x02 && this.state === STATE.RUNNING) {
        this.pause('Bieżnia została zatrzymana z konsoli.');
      }
    });
  }

  on(evt, cb) { this._cb[evt].push(cb); return this; }
  _emit(evt, p) { for (const cb of this._cb[evt]) cb(p); }
  _msg(text) { this._emit('msg', text); }
  _setState(s) { this.state = s; this._emit('state', s); }

  load(plan, profile) {
    this.plan = resolvePlan(plan, profile);
    this.profile = profile;
    this.segIndex = 0;
    this.segElapsed = 0;
    this.totalElapsed = 0;
    this.speedOffset = 0;
    this.inclineOffset = 0;
    this._announced = -1;
    this._ramped = -1;
    this._lastMachineDist = null;
    this.distanceM = 0;
    this.ramping = null;
    this._lastSampleBucket = -1;
    this.samples = [];
    this.autoControl = !plan.manual && this.tm.caps.speed;
    this._setState(STATE.IDLE);
    return this.plan;
  }

  get segment() { return this.plan?.segments[this.segIndex] ?? null; }
  get nextSegment() { return this.plan?.segments[this.segIndex + 1] ?? null; }
  get segRemaining() { return Math.max(0, (this.segment?.duration ?? 0) - this.segElapsed); }
  get totalRemaining() { return Math.max(0, this.plan.totalSeconds - this.totalElapsed); }

  targetSpeedFor(seg) {
    if (!seg) return 0;
    const v = seg.speed + (seg.kind === 'work' ? this.speedOffset : this.speedOffset * 0.5);
    return Math.max(0, Math.min(this.profile.maxSpeedCap, Math.round(v * 10) / 10));
  }

  targetInclineFor(seg) {
    if (!seg) return 0;
    return Math.max(0, Math.min(this.profile.maxInclineCap, (seg.incline ?? 0) + this.inclineOffset));
  }

  /** Start z odliczaniem — pas nie rusza natychmiast po dotknięciu ekranu. */
  async start(countdown = 5) {
    if (!this.plan) throw new Error('Nie wybrano planu.');
    this._setState(STATE.COUNTDOWN);
    for (let i = countdown; i > 0; i--) {
      if (this.state !== STATE.COUNTDOWN) return; // anulowano
      this._emit('tick', { countdown: i });
      this.speech?.say(i === countdown ? 'Start za ' + i : String(i), { priority: true });
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (this.state !== STATE.COUNTDOWN) return;

    this._setState(STATE.RUNNING);
    this.speech?.say('Zaczynamy. ' + this.segment.label + ', ' + spoken(this.targetSpeedFor(this.segment)) + ' kilometrów na godzinę.');
    this._emit('tick', this._tickPayload());

    if (this.autoControl) {
      try {
        await this.tm.start();
        await this._waitForBelt();
      } catch (e) {
        this._msg('Nie udało się wystartować bieżni: ' + e.message + ' — przechodzę w tryb prowadzenia.');
        this.autoControl = false;
      }
    }

    // Zegar rusza dopiero teraz. Wcześniej liczyłby czas rozmowy z bieżnią
    // i odliczanie na jej konsoli jako czas treningu.
    this._lastTs = performance.now();
    this._loop();
    // Rozpędzania nie czekamy - pierwszy odcinek ma już biec.
    this.applySegment(this.segment, { immediate: true });
  }

  /**
   * Po komendzie Start bieżnia odlicza jeszcze kilka sekund na własnej konsoli,
   * zanim ruszy pas. Bez tego oczekiwania trening zaczynałby się na stojąco.
   */
  async _waitForBelt(timeoutS = 30) {
    const t0 = Date.now();
    let announced = false;
    while (Date.now() - t0 < timeoutS * 1000) {
      if (this.state !== STATE.RUNNING) return false;
      if ((this.tm.metrics?.speed ?? 0) > 0.2) return true;
      if (!announced && Date.now() - t0 > 1500) {
        announced = true;
        this._msg('Czekam, aż pas ruszy — bieżnia odlicza na swojej konsoli.');
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    this._msg('Pas nie ruszył w ciągu 30 sekund. Sprawdź kluczyk bezpieczeństwa i konsolę.');
    return false;
  }

  _loop() {
    clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  _tick() {
    if (this.state !== STATE.RUNNING) return;
    const now = performance.now();
    const dt = (now - this._lastTs) / 1000;
    this._lastTs = now;

    this.segElapsed += dt;
    this.totalElapsed += dt;

    const m = this.tm.metrics || {};
    if (m.distance != null) {
      if (this._lastMachineDist === null) this._lastMachineDist = m.distance;
      let delta = m.distance - this._lastMachineDist;
      // Bieżnia zeruje własny licznik po zatrzymaniu pasa. Ujemny przyrost to
      // taki reset, a nie cofnięcie się — inaczej przepadłby cały przebyty
      // dystans, gdybyś zatrzymał pas z konsoli w środku treningu.
      if (delta < 0) delta = m.distance;
      this._lastMachineDist = m.distance;
      this.distanceM = (this.distanceM ?? 0) + delta;
    } else {
      // Bieżnia nie raportuje dystansu — całkujemy z prędkości.
      this.distanceM = (this.distanceM ?? 0) + ((m.speed ?? this.targetSpeedFor(this.segment)) * 1000 / 3600) * dt;
    }

    // Kubełkujemy co pięć sekund. Warunek na reszcie z dzielenia był prawdziwy
    // przez całą sekundę, czyli cztery takty — próbek wychodziło czterokrotnie
    // za dużo, z powtórzonymi znacznikami czasu.
    const bucket = Math.floor(this.totalElapsed / 5);
    if (bucket !== this._lastSampleBucket) {
      this._lastSampleBucket = bucket;
      this.samples.push({
        t: Math.round(this.totalElapsed),
        target: this.targetSpeedFor(this.segment),
        actual: m.speed ?? null,
        incline: m.incline ?? this.targetInclineFor(this.segment),
        hr: m.hr ?? null,
      });
    }

    this._maybeAnnounce();
    this._maybePreRamp();

    if (this.segElapsed >= this.segment.duration) this._advance();

    this._emit('tick', this._tickPayload());
  }

  _tickPayload() {
    return {
      state: this.state,
      segment: this.segment,
      segIndex: this.segIndex,
      segRemaining: this.segRemaining,
      totalRemaining: this.totalRemaining,
      totalElapsed: this.totalElapsed,
      distanceM: this.distanceM ?? 0,
      metrics: this.tm.metrics || {},
      targetSpeed: this.targetSpeedFor(this.segment),
      targetIncline: this.targetInclineFor(this.segment),
      ramping: this.ramping,
    };
  }

  _maybeAnnounce() {
    const next = this.nextSegment;
    if (!next || this._announced === this.segIndex) return;
    if (this.segRemaining > ANNOUNCE_LEAD_S) return;
    this._announced = this.segIndex;
    const s = spoken(this.targetSpeedFor(next));
    const inc = this.targetInclineFor(next);
    const incPart = inc > 0 ? ', nachylenie ' + inc + ' procent' : '';
    // Krótkie odcinki (np. 30/30) nie dają pełnych dziesięciu sekund wyprzedzenia.
    const lead = Math.round(this.segRemaining);
    const when = lead >= 8 ? 'Za dziesięć sekund: ' : lead >= 4 ? 'Za ' + lead + ' sekund: ' : 'Zaraz: ';
    this.speech?.say(when + next.label + ', ' + s + ' kilometrów na godzinę' + incPart);
  }

  /**
   * Rozpędzanie zaczyna się przed końcem poprzedniego segmentu, żeby na
   * początku interwału pas był już na docelowej prędkości.
   */
  _maybePreRamp() {
    const next = this.nextSegment;
    if (!this.autoControl || !next || this._ramped === this.segIndex) return;
    const target = this.targetSpeedFor(next);
    const current = this.targetSpeedFor(this.segment);
    const delta = Math.abs(target - current);
    if (delta < 0.2) return;
    // Im większy skok, tym wcześniej startujemy.
    const lead = Math.min(12, RAMP_LEAD_S + delta * 0.8);
    if (this.segRemaining > lead) return;
    this._ramped = this.segIndex;
    // Ekran musi wiedzieć, że pas zmienia już prędkość, mimo że zegar odlicza
    // wciąż poprzedni odcinek — inaczej pokazywałby coś innego, niż robi bieżnia.
    this.ramping = { target, from: current, label: next.label, up: target > current };
    this.tm.rampTo(target, { step: 0.5, intervalMs: 650 }).catch((e) => this._msg('Rampa: ' + e.message));
  }

  async applySegment(seg, { immediate = false } = {}) {
    if (!this.autoControl || !seg) return;
    if (!this._mayDrive()) return;
    const speed = this.targetSpeedFor(seg);
    const incline = this.targetInclineFor(seg);
    try {
      if (this.tm.caps.incline) await this.tm.setIncline(incline);
      // Ponowna kontrola: pauza lub stop mogły nastąpić w trakcie powyższego
      // await. Bez tego pas przyspieszyłby już po zatrzymaniu treningu.
      if (!this._mayDrive() || seg !== this.segment) return;
      if (immediate) await this.tm.rampTo(speed, { step: 0.8, intervalMs: 500 });
      else if (Math.abs(this.tm.targetSpeed - speed) > 0.15) await this.tm.rampTo(speed);
    } catch (e) {
      this._msg('Bieżnia odrzuciła komendę: ' + e.message);
    }
  }

  _mayDrive() {
    return this.state === STATE.RUNNING || this.state === STATE.COUNTDOWN;
  }

  _advance() {
    const over = this.segElapsed - this.segment.duration;
    if (this.segIndex >= this.plan.segments.length - 1) { this.finish(); return; }
    this.segIndex += 1;
    this.segElapsed = Math.max(0, over);
    this.ramping = null;
    const seg = this.segment;
    this._emit('segment', { index: this.segIndex, segment: seg });
    const cue = seg.cue ? ' ' + seg.cue : '';
    this.speech?.say(seg.label + '.' + cue, { priority: true });
    this.applySegment(seg);
  }

  skipSegment() {
    if (this.state !== STATE.RUNNING) return;
    this.segElapsed = this.segment.duration;
    this._announced = -1;
    this._ramped = -1;
    this.ramping = null;
  }

  previousSegment() {
    if (this.segIndex === 0) { this.segElapsed = 0; return; }
    this.totalElapsed -= this.segElapsed;
    this.segIndex -= 1;
    this.segElapsed = 0;
    this._announced = -1;
    this._ramped = -1;
    this.applySegment(this.segment);
  }

  /** Korekta całego planu w górę lub w dół — przydatna, gdy plan jest za łatwy. */
  adjustSpeed(delta) {
    this.speedOffset = Math.round((this.speedOffset + delta) * 10) / 10;
    this._msg('Korekta prędkości: ' + (this.speedOffset >= 0 ? '+' : '') + spoken(this.speedOffset) + ' km/h');
    this.applySegment(this.segment);
    return this.speedOffset;
  }

  adjustIncline(delta) {
    this.inclineOffset = Math.round(this.inclineOffset + delta);
    this.applySegment(this.segment);
    return this.inclineOffset;
  }

  async pause(reason = '') {
    if (this.state !== STATE.RUNNING) return;
    clearInterval(this._timer);
    this._setState(STATE.PAUSED);
    if (reason) this._msg(reason);
    this.tm.stopRamp();
    this.ramping = null;
    if (this.autoControl) { try { await this.tm.pauseBelt(); } catch { /* pas może już stać */ } }
    this.speech?.say('Pauza');
  }

  async resume() {
    if (this.state !== STATE.PAUSED) return;
    this._lastTs = performance.now();
    this._setState(STATE.RUNNING);
    this.speech?.say('Wznawiam');
    if (this.autoControl) {
      try { await this.tm.start(); await this.applySegment(this.segment, { immediate: true }); }
      catch (e) { this._msg('Nie udało się wznowić: ' + e.message); }
    }
    this._loop();
  }

  async abort(reason = 'Trening przerwany.') {
    clearInterval(this._timer);
    this.tm.stopRamp();
    this._setState(STATE.ABORTED);
    this._msg(reason);
    if (this.autoControl) { try { await this.tm.stopBelt(); } catch { /* ignoruj */ } }
    this.speech?.say(reason, { priority: true });
    const s = this.summary();
    // Zdarzenie "ended" leci dopiero po wysłaniu komendy zatrzymania, żeby
    // moment zatrzymania pasa zdążył trafić do zapisu technicznego.
    this._emit('ended', s);
    return s;
  }

  async finish() {
    clearInterval(this._timer);
    this.tm.stopRamp();
    this._setState(STATE.FINISHED);
    if (this.autoControl) { try { await this.tm.stopBelt(); } catch { /* ignoruj */ } }
    const s = this.summary();
    this._emit('ended', s);
    this.speech?.say(
      'Trening ukończony. Czas ' + fmtTime(s.durationS) + ', dystans ' +
      s.distanceKm.toFixed(2).replace('.', ',') + ' kilometra. Dobra robota.',

      { priority: true }
    );
    return s;
  }

  summary() {
    const m = this.tm.metrics || {};
    const durationS = Math.round(this.totalElapsed);
    const distanceKm = (this.distanceM ?? 0) / 1000;
    const hrs = this.samples.map((x) => x.hr).filter((x) => x > 0);
    return {
      planId: this.plan?.id,
      planName: this.plan?.name,
      date: new Date().toISOString(),
      durationS,
      distanceKm,
      kcal: m.kcal ?? Math.round(this.profile.weightKg * distanceKm * 1.036),
      avgSpeed: durationS > 0 ? (distanceKm / (durationS / 3600)) : 0,
      avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      maxHr: hrs.length ? Math.max(...hrs) : null,
      completed: this.state === STATE.FINISHED,
      speedOffset: this.speedOffset,
      // Zaplanowany czas pozwala policzyć, jak daleko zaszedłeś w przerwanym
      // treningu — bez tego "przerwany" nie mówi, czy po minucie, czy po pół
      // godzinie.
      plannedS: this.plan?.totalSeconds ?? null,
      segmentCount: this.plan?.segments.length ?? null,
      segmentsDone: this.segIndex + (this.state === STATE.FINISHED ? 1 : 0),
      maxSpeed: this.samples.reduce((a, s) => Math.max(a, s.actual ?? s.target ?? 0), 0),
      samples: this.samples,
    };
  }
}
