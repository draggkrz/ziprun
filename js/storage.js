// Profil, historia treningów i notatki o protokole - wszystko lokalnie
// w localStorage. Żadne dane nie wychodzą z telefonu.

import { DEFAULT_PROFILE } from './plans.js';

const KEY_PROFILE = 'ziprun.profile';
const KEY_HISTORY = 'ziprun.history';
const KEY_PROTO = 'ziprun.protocol';
const KEY_SETTINGS = 'ziprun.settings';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch { return { ...fallback }; }
};

const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
};

export const loadProfile = () => read(KEY_PROFILE, DEFAULT_PROFILE);
export const saveProfile = (p) => write(KEY_PROFILE, p);

export const DEFAULT_SETTINGS = {
  voice: true,
  autoControl: true,
  countdown: 5,
  rampStep: 0.5,
  keepAwake: true,
  lastDeviceName: '',
  seenVersion: '',
};

export const loadSettings = () => read(KEY_SETTINGS, DEFAULT_SETTINGS);
export const saveSettings = (s) => write(KEY_SETTINGS, s);

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_HISTORY) || '[]'); }
  catch { return []; }
}

export function addHistory(entry) {
  const h = loadHistory();
  // Próbki są potrzebne tylko dla ostatnich kilku treningów - inaczej
  // localStorage zapełni się w kilka tygodni.
  h.unshift(entry);
  const trimmed = h.slice(0, 200).map((e, i) => (i < 10 ? e : { ...e, samples: undefined }));
  write(KEY_HISTORY, trimmed);
  return trimmed;
}

export function clearHistory() { write(KEY_HISTORY, []); }

export const loadProtocol = () => read(KEY_PROTO, { driver: '', notes: '', templates: [] });
export const saveProtocol = (p) => write(KEY_PROTO, p);

// --- zapisy techniczne treningów ------------------------------------------

const KEY_TRACES = 'ziprun.traces';
const MAX_TRACES = 3;

export function loadTraces() {
  try { return JSON.parse(localStorage.getItem(KEY_TRACES) || '[]'); }
  catch { return []; }
}

/**
 * Trzymamy tylko trzy ostatnie zapisy. Jeden trening to kilkaset kilobajtów,
 * a localStorage ma około pięciu megabajtów na całą aplikację - bez tego
 * limitu historia treningów przestałaby się zapisywać po kilku tygodniach.
 * Gdy zapis się nie mieści, odrzucamy najstarsze i próbujemy ponownie.
 */
export function addTrace(entry) {
  let list = [entry, ...loadTraces()].slice(0, MAX_TRACES);
  while (list.length) {
    if (write(KEY_TRACES, list)) return list;
    list = list.slice(0, -1); // brak miejsca - rezygnujemy z najstarszego
  }
  write(KEY_TRACES, []);
  return [];
}

export function clearTraces() { write(KEY_TRACES, []); }

export function historyStats(h = loadHistory()) {
  const done = h.filter((x) => x.completed);
  const km = h.reduce((a, x) => a + (x.distanceKm || 0), 0);
  const sec = h.reduce((a, x) => a + (x.durationS || 0), 0);
  const kcal = h.reduce((a, x) => a + (x.kcal || 0), 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = h.filter((x) => new Date(x.date).getTime() > weekAgo);
  return {
    count: h.length,
    completed: done.length,
    totalKm: Math.round(km * 10) / 10,
    totalSec: sec,
    totalKcal: kcal,
    weekCount: thisWeek.length,
    weekKm: Math.round(thisWeek.reduce((a, x) => a + (x.distanceKm || 0), 0) * 10) / 10,
  };
}
