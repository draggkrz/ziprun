// Spinacz całości: nawigacja, renderowanie widoków i podłączenie silnika
// treningu do interfejsu.

import { Treadmill, bleAvailable } from './ble/manager.js';
import { PLANS, planById, resolvePlan, anchorSpeed, fmtTime, KIND_LABEL, cooperVo2 } from './plans.js';
import { WorkoutEngine, STATE } from './engine.js';
import { Speech, ScreenKeeper } from './speech.js';
import { parseHex, KNOWN_NAMES } from './ble/uuids.js';
import { Trace } from './trace.js';
import { VERSION, CHANGELOG, currentEntry } from './version.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const el = (sel) => document.querySelector(sel);
const els = (sel) => [...document.querySelectorAll(sel)];

const tm = new Treadmill();
const speech = new Speech();
const keeper = new ScreenKeeper();
const engine = new WorkoutEngine(tm, speech);
// Rejestrator podłącza się do zdarzeń, które i tak są emitowane - nie ingeruje
// w silnik ani w warstwę BLE, więc nie może zepsuć samego treningu.
const trace = new Trace().attach(tm, engine);

let profile = store.loadProfile();
let settings = store.loadSettings();
let selectedPlan = null;
let levelFilter = 'all';
let lastSummary = null;
let runSaved = false;

speech.enabled = settings.voice;

// ---------------------------------------------------------------- nawigacja

let currentView = 'plans';
let prevView = 'plans';

function goto(name) {
  if (name !== currentView) { prevView = currentView; currentView = name; }
  els('.view').forEach((v) => v.classList.remove('active'));
  $('view-' + name)?.classList.add('active');
  els('.tab').forEach((t) => t.classList.toggle('active', t.dataset.goto === name));
  window.scrollTo(0, 0);
  if (name === 'history') renderHistory();
  if (name === 'profile') renderProfile();
}

els('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(b.dataset.goto)));

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('err', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// ------------------------------------------------- wersja i historia zmian

function renderVersion() {
  const cur = currentEntry();
  $('brand-ver').textContent = VERSION;
  $('about-ver').textContent = VERSION;
  $('about-title').textContent = cur.title + ' · ' + cur.date;
  $('cl-current').textContent = VERSION;
}

function renderChangelog() {
  $('cl-list').innerHTML = CHANGELOG.map((e) =>
    '<div class="card">' +
    '<div class="cl-head"><b>' + e.version + '</b>' +
    (e.version === VERSION ? '<span class="cl-now">używana</span>' : '') +
    '<span class="cl-date">' + e.date + '</span></div>' +
    '<div class="cl-title">' + e.title + '</div>' +
    '<ul class="cl-changes">' + e.changes.map((c) => '<li>' + c + '</li>').join('') + '</ul>' +
    '</div>'
  ).join('');
}

$('brand').addEventListener('click', () => { renderChangelog(); goto('changelog'); });
$('btn-changelog').addEventListener('click', () => { renderChangelog(); goto('changelog'); });
$('cl-back').addEventListener('click', () => goto(prevView === 'changelog' ? 'plans' : prevView));

/**
 * Aplikacja aktualizuje się sama w tle, więc bez tego użytkownik nie miałby
 * skąd wiedzieć, że coś się zmieniło.
 */
function announceUpdate() {
  const seen = settings.seenVersion;
  if (seen === VERSION) return;
  settings.seenVersion = VERSION;
  store.saveSettings(settings);
  if (!seen) return; // pierwsze uruchomienie - nie ma o czym informować
  toast('Zaktualizowano do wersji ' + VERSION + '. Dotknij nazwy ZipRun, żeby zobaczyć zmiany.');
}

// ------------------------------------------------------------- lista planów

function renderPlans() {
  const list = $('plan-list');
  list.innerHTML = '';
  const visible = PLANS.filter((p) => levelFilter === 'all' || String(p.level) === levelFilter);

  for (const plan of visible) {
    const r = resolvePlan(plan, profile);
    const speeds = r.segments.map((s) => s.speed);
    const btn = document.createElement('button');
    btn.className = 'plan l' + plan.level;
    btn.innerHTML =
      '<div class="focus">' + plan.focus + '</div>' +
      '<h3>' + plan.name + '</h3>' +
      '<div class="row">' +
        '<span>' + Math.round(r.totalSeconds / 60) + ' min</span>' +
        '<span>~' + r.estDistanceKm.toFixed(1).replace('.', ',') + ' km</span>' +
        '<span>' + Math.min(...speeds).toFixed(1).replace('.', ',') + '–' +
          Math.max(...speeds).toFixed(1).replace('.', ',') + ' km/h</span>' +
      '</div>';
    btn.addEventListener('click', () => openPlan(plan.id));
    list.appendChild(btn);
  }
}

els('#plan-filters .chip').forEach((c) =>
  c.addEventListener('click', () => {
    els('#plan-filters .chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    levelFilter = c.dataset.level;
    renderPlans();
  })
);

// --------------------------------------------------------- szczegóły planu

function chartHtml(segments, maxSpeed) {
  // Szerokość słupka proporcjonalna do czasu, wysokość do prędkości.
  const total = segments.reduce((a, s) => a + s.duration, 0);
  return segments
    .map((s) => {
      const h = Math.max(4, Math.round((s.speed / maxSpeed) * 100));
      const w = Math.max(0.4, (s.duration / total) * 100);
      return '<div class="bar ' + s.kind + '" style="height:' + h + '%;flex:0 0 ' + w + '%" ' +
             'title="' + s.label + ' — ' + s.speed + ' km/h"></div>';
    })
    .join('');
}

function openPlan(id) {
  const plan = planById(id);
  selectedPlan = resolvePlan(plan, profile);
  const r = selectedPlan;

  $('pd-name').textContent = plan.name;
  $('pd-meta').innerHTML =
    '<span>' + plan.focus + '</span>' +
    '<span>' + Math.round(r.totalSeconds / 60) + ' min</span>' +
    '<span>~' + r.estDistanceKm.toFixed(2).replace('.', ',') + ' km</span>' +
    '<span>poziom ' + plan.level + '/3</span>';
  $('pd-desc').textContent = plan.desc;

  const maxSpeed = Math.max(...r.segments.map((s) => s.speed), 1);
  $('pd-chart').innerHTML = chartHtml(r.segments, maxSpeed);

  $('pd-segments').innerHTML = r.segments
    .map((s) => {
      const inc = s.incline > 0 ? ' · ' + s.incline + '%'
                : s.wantedIncline > 0 ? ' · <s>' + s.wantedIncline + '%</s>'
                : '';
      return '<div class="seg ' + s.kind + '"><i></i>' +
      '<div class="nm">' + s.label + inc + '</div>' +
      '<div class="sp">' + s.speed.toFixed(1).replace('.', ',') + '</div>' +
      '<div class="tm">' + fmtTime(s.duration) + '</div></div>';
    })
    .join('');

  const warn = $('pd-warning');
  const notes = [];
  if (plan.manual) notes.push('Ten plan nie ustawia prędkości automatycznie — tempo dobierasz sam.');
  if (!tm.connected) notes.push('Bieżnia nie jest połączona. Możesz uruchomić trening w trybie prowadzenia, ale bez automatycznego sterowania.');
  else if (!tm.caps.speed) notes.push('Ta bieżnia nie przyjmuje komend prędkości — dostaniesz tylko zapowiedzi, co ustawić.');

  // Porównujemy z nachyleniem ZAŁOŻONYM w planie, nie z już przyciętym do zera —
  // inaczej ostrzeżenie nigdy by się nie pokazało.
  const maxWanted = Math.max(0, ...r.segments.map((s) => s.wantedIncline || 0));
  if (maxWanted > profile.maxInclineCap) {
    notes.push(
      'Plan zakłada nachylenie do ' + maxWanted + '%, a Twoja bieżnia nie ma sterowanej pochylni — ' +
      'odcinki pod górę pobiegniesz płasko. Wysiłek będzie zauważalnie mniejszy niż zakładany.'
    );
  }

  // Górne kotwice zlewają się w jedno, gdy plan żąda więcej, niż bieżnia potrafi.
  const capped = r.segments.filter((s) => s.speed >= profile.maxSpeedCap).length;
  if (capped > 2 && tm.connected) {
    notes.push('Część odcinków została przycięta do maksymalnej prędkości bieżni (' +
               profile.maxSpeedCap + ' km/h).');
  }
  warn.innerHTML = notes.join('<br>');
  warn.classList.toggle('hidden', notes.length === 0);

  goto('plan');
}

$('btn-start').addEventListener('click', async () => {
  if (!selectedPlan) return;
  const plan = planById(selectedPlan.id);
  engine.load(plan, profile);
  runSaved = false;
  engine.autoControl = settings.autoControl && !plan.manual && tm.caps.speed;
  trace.start({
    wersja: 'ZipRun ' + VERSION,
    plan: plan.name,
    urządzenie: tm.device?.name || '(niepołączone)',
    protokół: tm.driver?.name || '-',
    sterowanie: engine.autoControl ? 'automatyczne' : 'tryb prowadzenia',
    profil: 'swobodnie ' + profile.easy + ', szybko ' + profile.fast +
            ', limit ' + profile.maxSpeedCap + ' km/h',
  });
  if (settings.keepAwake) keeper.acquire();
  speech.beep(660, 90); // odblokowuje audio przy pierwszym gescie
  goto('run');
  try { await engine.start(settings.countdown); }
  catch (e) { toast(e.message, true); }
});

// ------------------------------------------------------------ ekran treningu

const RING = 553;

/**
 * Bieżnia bez sterowanej pochylni pokazywałaby stałe zero i miała dwa martwe
 * przyciski — chowamy je i oddajemy miejsce przyciskowi zmiany odcinka.
 */
function updateInclineUi() {
  const has = profile.maxInclineCap > 0;
  $('tile-incline').classList.toggle('hidden', !has);
  $('tile-avg').classList.toggle('hidden', has);
  $('c-inc-up').classList.toggle('hidden', !has);
  $('c-inc-down').classList.toggle('hidden', !has);
  el('.controls').classList.toggle('no-incline', !has);
  $('p-inc').closest('.field').classList.toggle('hidden', !has && tm.connected);
}

function paceStr(kmh) {
  if (!kmh || kmh < 0.5) return '—';
  const total = 60 / kmh;
  const m = Math.floor(total);
  const s = Math.round((total - m) * 60);
  return m + ':' + String(s).padStart(2, '0');
}

engine.on('tick', (d) => {
  if (d.countdown != null) {
    $('run-countdown').classList.remove('hidden');
    $('cd-num').textContent = d.countdown;
    return;
  }
  $('run-countdown').classList.add('hidden');

  const seg = d.segment;
  const kind = KIND_LABEL[seg.kind] || '';
  // Nie powtarzamy nagłówka, gdy nazwa odcinka jest tym samym słowem.
  $('run-kind').textContent = kind === seg.label ? '' : kind;
  $('run-label').textContent = seg.label;
  $('run-segtime').textContent = fmtTime(d.segRemaining);

  const frac = seg.duration > 0 ? d.segRemaining / seg.duration : 0;
  $('ring-fg').style.strokeDashoffset = String(RING * (1 - frac));

  const actual = d.metrics.speed;
  $('run-speed').textContent = (actual != null ? actual : d.targetSpeed).toFixed(1).replace('.', ',');
  $('run-target').textContent = d.targetSpeed.toFixed(1).replace('.', ',');
  $('run-total').textContent = fmtTime(d.totalRemaining);
  $('run-dist').textContent = (d.distanceM / 1000).toFixed(2).replace('.', ',');
  $('run-incline').textContent = String(d.metrics.incline ?? d.targetIncline);
  const avg = d.totalElapsed > 0 ? (d.distanceM / 1000) / (d.totalElapsed / 3600) : 0;
  $('run-avg').textContent = avg.toFixed(1).replace('.', ',');
  $('run-kcal').textContent = String(d.metrics.kcal ?? Math.round(profile.weightKg * (d.distanceM / 1000) * 1.036));
  $('run-hr').textContent = d.metrics.hr ? String(d.metrics.hr) : '—';
  $('run-pace').textContent = paceStr(actual ?? d.targetSpeed);

  const off = $('run-offset');
  if (engine.speedOffset !== 0) {
    off.textContent = (engine.speedOffset > 0 ? '+' : '') + engine.speedOffset.toFixed(1).replace('.', ',');
    off.classList.remove('hidden');
  } else off.classList.add('hidden');

  $('run-mode').textContent = engine.autoControl ? '' : 'Tryb prowadzenia — prędkość ustawiasz ręcznie';

  const next = engine.nextSegment;
  $('run-next').innerHTML = next
    ? 'Dalej: <b>' + next.label + '</b> · ' + engine.targetSpeedFor(next).toFixed(1).replace('.', ',') +
      ' km/h · ' + fmtTime(next.duration)
    : 'Ostatni odcinek';
});

engine.on('state', (s) => {
  $('c-pause').textContent = s === STATE.PAUSED ? 'Wznów' : 'Pauza';
  if (s === STATE.FINISHED || s === STATE.ABORTED) keeper.release();
});

/**
 * Czeka, aż bieżnia zwolni do zera. Hamowanie trwa tym dłużej, im szybciej
 * biegłeś (około pół km/h na sekundę), więc sztywne opóźnienie albo ucinałoby
 * zapis, albo kazało czekać bez potrzeby. Bez połączenia kończy od razu.
 */
async function waitForBeltStop(maxS = 30) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    if ((tm.metrics?.speed ?? 0) <= 0.1) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  // Chwila zapasu na potwierdzenie statusu z bieżni.
  await new Promise((r) => setTimeout(r, 800));
}

/**
 * "ended" leci dopiero po wysłaniu komendy zatrzymania pasa — inaczej
 * najważniejszy moment treningu wypadałby poza zapisem technicznym.
 */
engine.on('ended', async (sum) => {
  // Zabezpieczenie przed dwukrotnym zapisem tego samego treningu.
  if (runSaved) return;
  runSaved = true;
  lastSummary = sum;
  store.addHistory(sum);
  showSummary(sum);

  // Rejestrator dopisuje do chwili, aż pas faktycznie stanie — zamiast
  // zgadywać czas hamowania, który zależy od prędkości końcowej. Podsumowanie
  // jest już na ekranie, więc to czekanie niczego nie blokuje.
  await waitForBeltStop();
  trace.stop();
  store.addTrace({
    date: sum.date,
    planName: sum.planName,
    completed: sum.completed,
    data: trace.toStored(),
  });
});

engine.on('msg', (m) => { $('run-msg').textContent = m; toast(m); });
engine.on('segment', () => speech.beep(engine.segment.kind === 'work' ? 1040 : 720, 130));

$('c-pause').addEventListener('click', () => {
  if (engine.state === STATE.PAUSED) engine.resume();
  else engine.pause();
});
$('c-skip').addEventListener('click', () => engine.skipSegment());
$('c-faster').addEventListener('click', () => engine.adjustSpeed(+0.5));
$('c-slower').addEventListener('click', () => engine.adjustSpeed(-0.5));
$('c-inc-up').addEventListener('click', () => engine.adjustIncline(+1));
$('c-inc-down').addEventListener('click', () => engine.adjustIncline(-1));
$('c-stop').addEventListener('click', async () => {
  if (!confirm('Zatrzymać trening i pas bieżni?')) return;
  await engine.abort('Trening zatrzymany.');
});

// ------------------------------------------------------------ podsumowanie

function showSummary(s) {
  $('sum-title').textContent = s.completed ? 'Trening ukończony' : 'Trening przerwany';
  $('sum-plan').textContent = s.planName + ' · ' + new Date(s.date).toLocaleString('pl-PL');
  $('sum-tiles').innerHTML = [
    ['tv', fmtTime(s.durationS), 'czas'],
    ['tv', s.distanceKm.toFixed(2).replace('.', ','), 'km'],
    ['tv', String(s.kcal), 'kcal'],
    ['tv', s.avgSpeed.toFixed(1).replace('.', ','), 'średnia km/h'],
    ...(s.avgHr ? [['tv', String(s.avgHr), 'średni puls'], ['tv', String(s.maxHr), 'maks. puls']] : []),
  ].map(([, v, l]) => '<div class="tile"><div class="tv">' + v + '</div><div class="tl">' + l + '</div></div>').join('');

  const max = Math.max(...s.samples.map((x) => x.actual ?? x.target ?? 0), 1);
  $('sum-chart').innerHTML = s.samples
    .map((x) => {
      const v = x.actual ?? x.target ?? 0;
      return '<div class="bar" style="height:' + Math.max(3, (v / max) * 100) + '%"></div>';
    })
    .join('');

  const extra = $('sum-extra');
  if (s.planId === 'test-cooper') {
    const vo2 = cooperVo2(s.distanceKm * 1000);
    extra.innerHTML = '<div class="card"><div class="card-title">Wynik testu</div>' +
      '<div class="kv">Dystans testowy: <b>' + Math.round(s.distanceKm * 1000) + ' m</b><br>' +
      'Szacowany VO2max: <b>' + vo2 + ' ml/kg/min</b><br>' +
      '<span class="hint">Uwaga: dystans obejmuje cały trening, nie tylko 12-minutowy odcinek testowy — ' +
      'odejmij rozgrzewkę i schłodzenie, jeśli chcesz dokładny wynik.</span></div></div>';
  } else extra.innerHTML = '';

  goto('summary');
}

// ---------------------------------------------------------------- historia

/** Polska odmiana: 1 trening, 2-4 treningi, 5+ treningów. */
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (n === 1) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function renderHistory() {
  const h = store.loadHistory();
  const st = store.historyStats(h);
  $('hist-stats').innerHTML = [
    [st.count, plural(st.count, 'trening', 'treningi', 'treningów')],
    [st.totalKm.toFixed(1).replace('.', ',') + ' km', 'łącznie'],
    [fmtTime(st.totalSec), 'w ruchu'],
    [st.weekKm.toFixed(1).replace('.', ',') + ' km', 'ostatnie 7 dni'],
  ].map(([v, l]) => '<div class="tile"><div class="tv">' + v + '</div><div class="tl">' + l + '</div></div>').join('');

  $('hist-list').innerHTML = h.length
    ? h.map((x) =>
        '<div class="hist' + (x.completed ? '' : ' dnf') + '">' +
        '<div><div class="nm">' + (x.planName || '—') + '</div>' +
        '<div class="dt">' + new Date(x.date).toLocaleString('pl-PL') +
        (x.completed ? '' : ' · przerwany') + '</div></div>' +
        '<div class="st"><div>' + (x.distanceKm || 0).toFixed(2).replace('.', ',') + ' km</div>' +
        '<div class="dt">' + fmtTime(x.durationS || 0) + '</div></div></div>'
      ).join('')
    : '<p class="hint">Brak zapisanych treningów.</p>';
  renderTraces();
}

function renderTraces() {
  const list = store.loadTraces();
  const box = $('trace-list');
  if (!list.length) {
    box.innerHTML = '<p class="hint">Brak zapisów — pojawią się po pierwszym treningu.</p>';
    return;
  }
  box.innerHTML = list
    .map((t, i) =>
      '<button class="trace" data-trace="' + i + '">' +
      '<span class="nm">' + (t.planName || '—') + (t.completed ? '' : ' · przerwany') + '</span>' +
      '<span class="dt">' + new Date(t.date).toLocaleString('pl-PL') + ' · ' +
      (t.data?.metrics?.length || 0) + ' pomiarów, ' + (t.data?.events?.length || 0) + ' zdarzeń</span>' +
      '<span class="dl">Zapisz ↓</span></button>'
    )
    .join('');
  els('#trace-list [data-trace]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = store.loadTraces()[+b.dataset.trace];
      if (!t) return;
      downloadText('ziprun-trening-' + stamp(t.date) + '.txt', Trace.fromStored(t.data).toText());
      toast('Zapis pobrany.');
    })
  );
}

$('btn-export-trace').addEventListener('click', () => {
  if (!trace.metrics.length && !trace.events.length) return toast('Brak zapisu do wyeksportowania.', true);
  downloadText(
    'ziprun-trening-' + stamp(lastSummary?.date) + '.txt',
    trace.toText({
      wynik: lastSummary
        ? fmtTime(lastSummary.durationS) + ', ' + lastSummary.distanceKm.toFixed(2) + ' km' +
          (lastSummary.completed ? ', ukończony' : ', przerwany')
        : '-',
    })
  );
  toast('Zapis techniczny pobrany.');
});

$('btn-clear-history').addEventListener('click', () => {
  if (!confirm('Usunąć całą historię treningów wraz z zapisami technicznymi?')) return;
  store.clearHistory();
  store.clearTraces();
  renderHistory();
  toast('Historia wyczyszczona.');
});

// ------------------------------------------------------------------ profil

function renderProfile() {
  const set = (id, val) => { $(id).value = val; };
  set('p-easy', profile.easy); $('p-easy-v').textContent = profile.easy.toFixed(1).replace('.', ',') + ' km/h';
  set('p-fast', profile.fast); $('p-fast-v').textContent = profile.fast.toFixed(1).replace('.', ',') + ' km/h';
  set('p-walk', profile.walk); $('p-walk-v').textContent = profile.walk.toFixed(1).replace('.', ',') + ' km/h';
  set('p-cap', profile.maxSpeedCap); $('p-cap-v').textContent = profile.maxSpeedCap.toFixed(1).replace('.', ',') + ' km/h';
  set('p-inc', profile.maxInclineCap); $('p-inc-v').textContent = profile.maxInclineCap + ' %';
  $('s-voice').checked = settings.voice;
  $('s-auto').checked = settings.autoControl;
  $('s-awake').checked = settings.keepAwake;
  $('s-countdown').value = settings.countdown;
  $('s-countdown-v').textContent = settings.countdown + ' s';

  const names = {
    walk: 'marsz', brisk: 'szybki marsz', jog: 'trucht', easy: 'swobodnie',
    steady: 'żywo', tempo: 'tempo', threshold: 'próg', vo2: 'VO2max', sprint: 'sprint',
  };
  $('anchors').innerHTML = Object.entries(names)
    .map(([k, label]) =>
      '<div><b>' + anchorSpeed(k, profile).toFixed(1).replace('.', ',') + '</b>' + label + '</div>')
    .join('');
}

function bindRange(id, key, fmt, isInt = false) {
  $(id).addEventListener('input', (e) => {
    const v = isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
    profile[key] = v;
    // Tempo szybkie nie może być niższe od swobodnego — plan straciłby sens.
    if (key === 'easy' && profile.fast <= v) profile.fast = Math.round((v + 1) * 10) / 10;
    if (key === 'fast' && v <= profile.easy) profile.easy = Math.round((v - 1) * 10) / 10;
    store.saveProfile(profile);
    renderProfile();
    renderPlans();
  });
}

bindRange('p-easy', 'easy');
bindRange('p-fast', 'fast');
bindRange('p-walk', 'walk');
bindRange('p-cap', 'maxSpeedCap');
bindRange('p-inc', 'maxInclineCap', null, true);

const bindSwitch = (id, key, after) => $(id).addEventListener('change', (e) => {
  settings[key] = e.target.checked;
  store.saveSettings(settings);
  after?.(e.target.checked);
});
bindSwitch('s-voice', 'voice', (v) => { speech.enabled = v; if (v) speech.say('Zapowiedzi włączone'); });
bindSwitch('s-auto', 'autoControl');
bindSwitch('s-awake', 'keepAwake');
$('s-countdown').addEventListener('input', (e) => {
  settings.countdown = parseInt(e.target.value, 10);
  $('s-countdown-v').textContent = settings.countdown + ' s';
  store.saveSettings(settings);
});
$('btn-test-voice').addEventListener('click', () => {
  speech.beep();
  speech.say('Za dziesięć sekund: interwał cztery minuty, trzynaście kilometrów na godzinę.', { priority: true });
  if (!speech.voice) toast('Brak polskiego głosu w systemie — doinstaluj go w ustawieniach Androida (Zamiana tekstu na mowę).');
});

// ------------------------------------------------------------------ sprzęt

function logLine(msg) {
  const box = $('log');
  const t = new Date().toLocaleTimeString('pl-PL');
  box.textContent += '[' + t + '] ' + msg + '\n';
  box.scrollTop = box.scrollHeight;
}

tm.on('log', (e) => logLine(e.msg));

tm.on('state', (e) => {
  const dot = $('conn-dot');
  dot.className = 'dot' + (e.state === 'connected' ? ' on' : e.state === 'connecting' ? ' wait' : '');
  if (e.state === 'connected') {
    $('btn-connect').textContent = tm.device?.name || 'Połączona';
    $('dev-status').innerHTML = 'Połączono z <b>' + (tm.device?.name || 'urządzeniem') + '</b><br>' +
      'Protokół: <b>' + e.driver + '</b>';
    renderCaps(e.caps);
    settings.lastDeviceName = tm.device?.name || '';
    store.saveSettings(settings);
    toast('Połączono: ' + (tm.device?.name || 'bieżnia'));
  } else if (e.state === 'disconnected') {
    $('btn-connect').textContent = 'Połącz bieżnię';
    $('dev-status').textContent = 'Rozłączono.';
    if (engine.state === STATE.RUNNING) {
      engine.pause('Utracono połączenie z bieżnią.');
      tm.reconnect().then((ok) => { if (ok) toast('Połączenie odzyskane — wznów trening.'); });
    }
  }
});

function renderCaps(caps) {
  const yn = (v) => (v ? '<b>tak</b>' : 'nie');
  $('dev-caps').innerHTML =
    'Sterowanie prędkością: ' + yn(caps.speed) + '<br>' +
    'Sterowanie nachyleniem: ' + yn(caps.incline) + '<br>' +
    'Zakres prędkości: <b>' + caps.speedRange.min + '–' + caps.speedRange.max + ' km/h</b><br>' +
    'Zakres nachylenia: <b>' + caps.inclineRange.min + '–' + caps.inclineRange.max + ' %</b>' +
    (caps.unverified
      ? '<br><span style="color:var(--warn)">Protokół własnościowy — komendy sterujące nie są jeszcze potwierdzone. ' +
        'Uruchom diagnostykę i test sterowania.</span>'
      : '');
  // Limit z profilu nie powinien przekraczać tego, co bieżnia w ogóle potrafi.
  if (caps.speedRange.max && profile.maxSpeedCap > caps.speedRange.max) {
    profile.maxSpeedCap = caps.speedRange.max;
    store.saveProfile(profile);
  }
  if (caps.inclineRange.max != null && profile.maxInclineCap > caps.inclineRange.max) {
    profile.maxInclineCap = caps.inclineRange.max;
    store.saveProfile(profile);
  }
  updateInclineUi();
  renderPlans();
}

async function connectFlow() {
  try {
    await tm.pick();
    await tm.connect();
  } catch (e) {
    if (e.name === 'NotFoundError') toast('Nie wybrano urządzenia.');
    else toast('Błąd połączenia: ' + e.message, true);
    logLine('BŁĄD: ' + e.message);
  }
}

$('btn-connect').addEventListener('click', () => {
  if (tm.connected) goto('device'); else connectFlow();
});
$('btn-pick').addEventListener('click', connectFlow);
$('btn-disconnect').addEventListener('click', () => tm.disconnect());

$('btn-diag').addEventListener('click', async () => {
  if (!tm.connected) return toast('Najpierw połącz bieżnię.', true);
  $('btn-diag').textContent = 'Skanuję...';
  try {
    const { tree, info } = await tm.runDiagnostics();
    const infoLines = Object.entries(info).map(([k, v]) => k + ': ' + v).join('\n');
    $('diag-tree').textContent =
      (infoLines ? infoLines + '\n\n' : '') +
      tree.map((s) =>
        'USŁUGA ' + s.uuid + (KNOWN_NAMES[s.uuid] ? '  // ' + KNOWN_NAMES[s.uuid] : '') + '\n' +
        s.chars.map((c) =>
          '  ' + c.uuid.slice(4, 8) + ' [' + c.props + ']' +
          (c.name ? '  // ' + c.name : '') +
          (c.raw ? '\n     = ' + c.raw : '') +
          (c.text ? '\n     "' + c.text + '"' : '')
        ).join('\n')
      ).join('\n\n');
    toast('Diagnostyka gotowa. Pozmieniaj teraz prędkość na konsoli bieżni.');
  } catch (e) {
    toast('Diagnostyka nieudana: ' + e.message, true);
  } finally {
    $('btn-diag').textContent = 'Uruchom diagnostykę';
  }
});

tm.on('frame', (f) => logLine('<- ' + (f.char || f.uuid || '').slice(4, 8) + '  ' + f.hex));

/** Podaje tekst do zapisania jako plik. */
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const stamp = (iso = new Date().toISOString()) => iso.slice(0, 19).replace(/[:T]/g, '-');

$('btn-export').addEventListener('click', () => {
  if (!tm.diagnostics) return toast('Najpierw uruchom diagnostykę.', true);
  const report = tm.diagnostics.toReport({
    'Wersja aplikacji': 'ZipRun ' + VERSION,
    'Urządzenie': tm.device?.name || '(bez nazwy)',
    'Sterownik': tm.driver?.name || '-',
    'Możliwości': JSON.stringify(tm.caps),
  });
  downloadText('ziprun-diagnostyka-' + stamp() + '.txt', report);
});

els('[data-test]').forEach((b) =>
  b.addEventListener('click', async () => {
    if (!tm.connected) return toast('Najpierw połącz bieżnię.', true);
    const map = {
      control: () => tm.driver.requestControl(),
      start: () => tm.start(),
      s3: () => tm.setSpeedNow(3),
      s6: () => tm.setSpeedNow(6),
      i2: () => tm.setIncline(2),
      stop: () => tm.stopBelt(),
    };
    try {
      await map[b.dataset.test]();
      logLine('Test "' + b.dataset.test + '": OK');
      toast('Komenda przyjęta.');
      if (tm.driver && 'confirmed' in tm.driver) {
        tm.driver.confirmed = true;
        renderCaps(tm.caps);
      }
    } catch (e) {
      logLine('Test "' + b.dataset.test + '": ' + e.message);
      toast('Odrzucone: ' + e.message, true);
    }
  })
);

$('btn-raw').addEventListener('click', async () => {
  const bytes = parseHex($('raw-hex').value);
  if (!bytes.length) return toast('Podaj bajty w hex.', true);
  try {
    if (tm.driver?.sendRaw) await tm.driver.sendRaw(bytes);
    else throw new Error('Ten sterownik nie obsługuje wysyłki surowych ramek.');
  } catch (e) { toast(e.message, true); }
});

$('btn-clear-log').addEventListener('click', () => { $('log').textContent = ''; });

// ------------------------------------------------------------------- start

if (!bleAvailable()) $('unsupported').classList.remove('hidden');
renderVersion();
renderPlans();
renderProfile();
updateInclineUi();
announceUpdate();
if (settings.lastDeviceName) $('btn-connect').textContent = 'Połącz: ' + settings.lastDeviceName;

// Ostrzeżenie przed zamknięciem karty w trakcie treningu — pas by dalej chodził.
window.addEventListener('beforeunload', (e) => {
  if (engine.state === STATE.RUNNING) { e.preventDefault(); e.returnValue = ''; }
});

if ('serviceWorker' in navigator) {
  // type:'module' pozwala service workerowi zaimportować numer wersji
  navigator.serviceWorker.register('sw.js', { type: 'module' }).catch(() => { /* offline opcjonalny */ });
}
