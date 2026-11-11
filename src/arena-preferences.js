import { DEFAULT_COURT_PALETTE, normalizeCourtPalette } from './court-palettes.js';

export const ARENA_DEFAULTS = Object.freeze({ brightness: 1.25, master: .6, music: .25, ui: .45, musicTrack: 'warmup', hits: 1, movement: .65, crowd: .5, environment: .15, courtPalette: DEFAULT_COURT_PALETTE });
export const ARENA_STORAGE_KEY = 'rally.arena.v1';
const levels = ['master', 'music', 'ui', 'hits', 'movement', 'crowd', 'environment'];
export const normalizeBrightness = value => Number.isFinite(value) ? Math.max(.8, Math.min(1.8, value)) : ARENA_DEFAULTS.brightness;
export function normalizeArenaPreferences(value) {
  const result = { ...ARENA_DEFAULTS };
  for (const key of levels) if (Number.isFinite(value?.[key])) result[key] = Math.max(0, Math.min(1, value[key]));
  if (value?.musicTrack === 'highlights') result.musicTrack = value.musicTrack;
  result.brightness = normalizeBrightness(value?.brightness);
  result.courtPalette = normalizeCourtPalette(value?.courtPalette);
  return result;
}
const storage = () => { try { return globalThis.localStorage; } catch { return null; } };
export function readArenaPreferences(store = storage()) {
  try { return normalizeArenaPreferences(JSON.parse(store?.getItem(ARENA_STORAGE_KEY) || 'null')); }
  catch { return normalizeArenaPreferences(null); }
}
export function saveArenaPreferences(value, store = storage()) {
  try { store?.setItem(ARENA_STORAGE_KEY, JSON.stringify(normalizeArenaPreferences(value))); } catch { /* Local storage is optional. */ }
}
