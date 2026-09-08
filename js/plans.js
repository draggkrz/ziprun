// Biblioteka planów treningowych.
//
// Prędkości nie są zapisane na sztywno w km/h, tylko jako "kotwice" wysiłku
// (easy, tempo, vo2, ...) przeliczane na km/h z Twojego profilu. Dzięki temu
// ten sam plan skaluje się razem z formą i nie musi być przepisywany.

const S = (t) => t;
const M = (t) => Math.round(t * 60);

/** Rozwija powtórzenia: rep(4, [a, b]) -> [a, b, a, b, a, b, a, b] */
const rep = (n, segs) => Array.from({ length: n }, () => segs.map((s) => ({ ...s }))).flat();

export const DEFAULT_PROFILE = {
  walk: 5.0,       // spokojny marsz
  easy: 8.5,       // tempo, w którym możesz swobodnie rozmawiać
  fast: 13.5,      // tempo, które utrzymasz około 3 minuty
  maxSpeedCap: 16, // twardy limit bezpieczeństwa
  maxInclineCap: 15,
  weightKg: 80,
  age: 40,
  restBetweenAnnounce: true,
};

/**
 * Kotwice wysiłku. Wszystko pomiędzy "easy" i "fast" jest interpolowane,
 * więc wystarczy, że ustawisz te dwie wartości w profilu.
 */
export function anchorSpeed(anchor, p) {
  const span = Math.max(0.5, p.fast - p.easy);
  const map = {
    stop: 0,
    walk: p.walk,
    brisk: p.walk + 1.0,
    jog: Math.max(p.walk + 0.5, p.easy - 1.2),
    easy: p.easy,
    steady: p.easy + 0.35 * span,
    tempo: p.easy + 0.7 * span,
    threshold: p.easy + 0.85 * span,
    vo2: p.fast,
    sprint: p.fast + 1.5,
  };
  const v = map[anchor];
  if (v === undefined) throw new Error('Nieznana kotwica prędkości: ' + anchor);
  return Math.min(p.maxSpeedCap, Math.round(v * 10) / 10);
}

/** Zamienia definicję segmentu na konkretne km/h i procent nachylenia. */
export function resolveSegment(seg, profile) {
  const speed = typeof seg.s === 'number' ? Math.min(profile.maxSpeedCap, seg.s)
                                          : anchorSpeed(seg.s, profile);
  const incline = Math.min(profile.maxInclineCap, seg.i ?? 0);
  return { ...seg, speed, incline, duration: seg.t };
}

export function resolvePlan(plan, profile) {
  const segments = plan.segments.map((s) => resolveSegment(s, profile));
  const total = segments.reduce((a, s) => a + s.duration, 0);
  const distanceKm = segments.reduce((a, s) => a + (s.speed * s.duration) / 3600, 0);
  return { ...plan, segments, totalSeconds: total, estDistanceKm: Math.round(distanceKm * 100) / 100 };
}

const WU = (t = M(5), s = 'walk', i = 0) => ({ t, s, i, kind: 'warmup', label: 'Rozgrzewka' });
const CD = (t = M(5)) => ({ t, s: 'walk', i: 0, kind: 'cooldown', label: 'Schłodzenie' });

export const PLANS = [
  {
    id: 'easy-30',
    name: 'Rozbieganie 30 min',
    focus: 'Baza tlenowa',
    level: 1,
    desc: 'Spokojny, równy bieg w strefie 2. Fundament każdego planu — buduje wydolność bez obciążania organizmu.',
    segments: [
      WU(M(5)),
      { t: M(3), s: 'jog', kind: 'warmup', label: 'Wprowadzenie do biegu' },
      { t: M(15), s: 'easy', kind: 'work', label: 'Bieg spokojny', cue: 'Oddychaj nosem, powinieneś móc rozmawiać' },
      { t: M(4), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(3)),
    ],
  },
  {
    id: 'z2-fat-45',
    name: 'Spalanie tłuszczu 45 min',
    focus: 'Wytrzymałość / redukcja',
    level: 1,
    desc: 'Długi wysiłek o niskiej intensywności z falującym nachyleniem. Nachylenie podnosi koszt energetyczny bez podnoszenia prędkości, więc stawy dostają mniej.',
    segments: [
      WU(M(5)),
      ...rep(4, [
        { t: M(4), s: 'easy', i: 1, kind: 'work', label: 'Płasko' },
        { t: M(4), s: 'easy', i: 5, kind: 'work', label: 'Pod górę 5%', cue: 'Skróć krok, utrzymaj rytm' },
        { t: M(1), s: 'brisk', i: 2, kind: 'recovery', label: 'Luz' },
      ]),
      CD(M(4)),
    ],
  },
  {
    id: 'walk-12-3-30',
    name: 'Marsz 12-3-30',
    focus: 'Redukcja / niskie obciążenie',
    level: 1,
    desc: 'Nachylenie 12%, prędkość 4,8 km/h, 30 minut. Bardzo wysoki wydatek energetyczny przy minimalnym obciążeniu kolan — jeśli wracasz po przerwie lub masz problemy ze stawami, zacznij tutaj.',
    segments: [
      { t: M(3), s: 'walk', i: 0, kind: 'warmup', label: 'Rozgrzewka' },
      { t: M(2), s: 4.8, i: 6, kind: 'warmup', label: 'Wchodzenie w nachylenie' },
      { t: M(30), s: 4.8, i: 12, kind: 'work', label: 'Marsz 12%', cue: 'Nie trzymaj się poręczy — to zmienia cały efekt' },
      CD(M(4)),
    ],
  },
  {
    id: 'hill-8x2',
    name: 'Podbiegi 8 × 2 min',
    focus: 'Siła biegowa',
    level: 2,
    desc: 'Osiem podbiegów po dwie minuty. Buduje siłę mięśni i ekonomię biegu — działa mocniej niż płaskie interwały przy niższej prędkości pasa.',
    segments: [
      WU(M(4)),
      { t: M(4), s: 'jog', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(8, [
        { t: M(2), s: 'steady', i: 8, kind: 'work', label: 'Podbieg 8%', cue: 'Pracuj rękami, wzrok w przód' },
        { t: M(2), s: 'jog', i: 0, kind: 'recovery', label: 'Zjazd — trucht' },
      ]),
      CD(M(5)),
    ],
  },
  {
    id: 'int-4x4',
    name: 'Interwały norweskie 4 × 4',
    focus: 'VO2max',
    level: 3,
    desc: 'Klasyk z Trondheim: cztery czterominutowe odcinki na 90–95% tętna maksymalnego, przeplatane trzyminutowym truchtem. Najlepiej udokumentowany protokół podnoszenia pułapu tlenowego.',
    segments: [
      WU(M(4)),
      { t: M(6), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(4, [
        { t: M(4), s: 'vo2', i: 1, kind: 'work', label: 'Interwał 4 min', cue: 'Powinno być ciężko — mowa niemożliwa' },
        { t: M(3), s: 'jog', i: 0, kind: 'recovery', label: 'Trucht 3 min' },
      ]),
      { t: M(3), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(4)),
    ],
  },
  {
    id: 'int-30-30',
    name: 'Interwały 30/30',
    focus: 'VO2max / szybkość',
    level: 3,
    desc: 'Dwanaście powtórzeń 30 sekund szybko / 30 sekund trucht. Krótkie odcinki pozwalają zebrać dużo czasu na wysokiej intensywności bez tak dużego zmęczenia jak przy długich interwałach.',
    segments: [
      WU(M(4)),
      { t: M(5), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(12, [
        { t: S(30), s: 'vo2', kind: 'work', label: '30 s szybko' },
        { t: S(30), s: 'jog', kind: 'recovery', label: '30 s trucht' },
      ]),
      { t: M(3), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(4)),
    ],
  },
  {
    id: 'int-pyramid',
    name: 'Piramida 1-2-3-4-3-2-1',
    focus: 'Wytrzymałość tempowa',
    level: 3,
    desc: 'Odcinki rosną do czterech minut i schodzą z powrotem. Uczy rozkładania sił i dobrze znosi monotonię bieżni.',
    segments: [
      WU(M(4)),
      { t: M(5), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(1), s: 'vo2', kind: 'work', label: '1 min' },
      { t: M(1), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(2), s: 'threshold', kind: 'work', label: '2 min' },
      { t: M(1.5), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(3), s: 'tempo', kind: 'work', label: '3 min' },
      { t: M(2), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(4), s: 'tempo', kind: 'work', label: '4 min — szczyt', cue: 'Najdłuższy odcinek, trzymaj rytm' },
      { t: M(2), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(3), s: 'tempo', kind: 'work', label: '3 min' },
      { t: M(1.5), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(2), s: 'threshold', kind: 'work', label: '2 min' },
      { t: M(1), s: 'jog', kind: 'recovery', label: 'Przerwa' },
      { t: M(1), s: 'vo2', kind: 'work', label: '1 min — ostatni' },
      CD(M(5)),
    ],
  },
  {
    id: 'tempo-20',
    name: 'Bieg tempowy 20 min',
    focus: 'Próg mleczanowy',
    level: 2,
    desc: 'Dwadzieścia minut w tempie "komfortowo ciężkim" — mniej więcej takim, jakie utrzymasz przez godzinę na zawodach. Podnosi próg mleczanowy.',
    segments: [
      WU(M(4)),
      { t: M(6), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(20), s: 'tempo', i: 1, kind: 'work', label: 'Tempo', cue: 'Komfortowo ciężko — krótkie zdania, nie rozmowa' },
      { t: M(4), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(4)),
    ],
  },
  {
    id: 'fartlek-35',
    name: 'Fartlek 35 min',
    focus: 'Mieszany',
    level: 2,
    desc: 'Zabawa biegowa: nieregularne przyspieszenia o różnej długości. Bieżnia zmienia prędkość sama, więc dostajesz element zaskoczenia, którego zwykle brakuje w domu.',
    segments: [
      WU(M(4)),
      { t: M(4), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(2), s: 'tempo', kind: 'work', label: 'Przyspieszenie 2 min' },
      { t: M(2), s: 'easy', kind: 'recovery', label: 'Luz' },
      { t: S(45), s: 'vo2', kind: 'work', label: 'Zryw 45 s' },
      { t: M(1.5), s: 'jog', kind: 'recovery', label: 'Luz' },
      { t: M(3), s: 'steady', i: 3, kind: 'work', label: 'Podjazd 3 min' },
      { t: M(2), s: 'easy', kind: 'recovery', label: 'Luz' },
      { t: S(30), s: 'sprint', kind: 'work', label: 'Sprint 30 s' },
      { t: M(2), s: 'jog', kind: 'recovery', label: 'Luz' },
      { t: M(4), s: 'tempo', kind: 'work', label: 'Tempo 4 min' },
      { t: M(2), s: 'easy', kind: 'recovery', label: 'Luz' },
      { t: M(2), s: 'vo2', kind: 'work', label: 'Ostatnie dwie minuty' },
      CD(M(5)),
    ],
  },
  {
    id: 'hiit-20',
    name: 'HIIT sprinty 20 min',
    focus: 'Moc / metabolizm',
    level: 3,
    desc: 'Krótko i bardzo intensywnie. Osiem sprintów po 20 sekund z pełną przerwą. Uwaga: przy tej prędkości rampa startuje wcześniej, żeby pas nie szarpnął.',
    segments: [
      WU(M(3)),
      { t: M(3), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(8, [
        { t: S(20), s: 'sprint', kind: 'work', label: 'Sprint 20 s', cue: 'Maksimum, ale kontrolowane' },
        { t: S(70), s: 'walk', kind: 'recovery', label: 'Marsz — pełna przerwa' },
      ]),
      CD(M(2)),
    ],
  },
  {
    id: 'progression-40',
    name: 'Bieg progresywny 40 min',
    focus: 'Kontrola tempa',
    level: 2,
    desc: 'Zaczynasz spokojnie i co pięć minut przyspieszasz. Ostatnie dziesięć minut jest naprawdę wymagające — najlepszy trening mentalny na finisz.',
    segments: [
      WU(M(4)),
      { t: M(6), s: 'jog', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(5), s: 'easy', kind: 'work', label: 'Etap 1' },
      { t: M(5), s: 'steady', kind: 'work', label: 'Etap 2' },
      { t: M(5), s: 'tempo', kind: 'work', label: 'Etap 3' },
      { t: M(5), s: 'threshold', kind: 'work', label: 'Etap 4' },
      { t: M(5), s: 'vo2', kind: 'work', label: 'Etap 5 — finisz', cue: 'Ostatnie pięć minut, nie odpuszczaj' },
      { t: M(2), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(3)),
    ],
  },
  {
    id: 'long-60',
    name: 'Długie wybieganie 60 min',
    focus: 'Wytrzymałość',
    level: 2,
    desc: 'Godzina w spokojnym tempie z lekkimi zmianami nachylenia, żeby rozłożyć obciążenie na różne grupy mięśni. Podstawa przygotowania do dłuższych dystansów.',
    segments: [
      WU(M(5)),
      { t: M(5), s: 'jog', kind: 'warmup', label: 'Rozbieganie' },
      ...rep(3, [
        { t: M(6), s: 'easy', i: 1, kind: 'work', label: 'Blok płaski' },
        { t: M(4), s: 'easy', i: 3, kind: 'work', label: 'Blok 3%' },
        { t: M(5), s: 'steady', i: 0, kind: 'work', label: 'Blok żywszy' },
      ]),
      { t: M(2), s: 'jog', kind: 'cooldown', label: 'Wytruchtanie' },
      CD(M(3)),
    ],
  },
  {
    id: 'recovery-20',
    name: 'Regeneracja 20 min',
    focus: 'Odnowa',
    level: 1,
    desc: 'Bardzo lekki trucht na dzień po mocnej sesji. Ma poprawić krążenie, nie zmęczyć.',
    segments: [
      { t: M(4), s: 'walk', kind: 'warmup', label: 'Marsz' },
      { t: M(12), s: 'jog', kind: 'work', label: 'Lekki trucht', cue: 'Jeśli masz wątpliwości, zwolnij' },
      { t: M(4), s: 'walk', kind: 'cooldown', label: 'Marsz' },
    ],
  },
  {
    id: 'test-cooper',
    name: 'Test Coopera (12 min)',
    focus: 'Pomiar formy',
    level: 3,
    desc: 'Dwanaście minut na maksymalny dystans. Nie ustawia prędkości za Ciebie — tutaj sterujesz ręcznie, a aplikacja mierzy dystans i przelicza szacowany VO2max.',
    manual: true,
    segments: [
      WU(M(3)),
      { t: M(5), s: 'easy', kind: 'warmup', label: 'Rozbieganie' },
      { t: M(12), s: 'tempo', kind: 'work', label: 'TEST — 12 min', cue: 'Tempo ustawiasz sam. Cel: maksymalny dystans' },
      CD(M(5)),
    ],
  },
];

export const planById = (id) => PLANS.find((p) => p.id === id);

export const KIND_LABEL = {
  warmup: 'Rozgrzewka',
  work: 'Praca',
  recovery: 'Przerwa',
  cooldown: 'Schłodzenie',
};

/** Szacowany VO2max z testu Coopera (dystans w metrach). */
export const cooperVo2 = (meters) => Math.round(((meters - 504.9) / 44.73) * 10) / 10;

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0')
    : m + ':' + String(r).padStart(2, '0');
};
