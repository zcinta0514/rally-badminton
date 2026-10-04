export const ARENA_DEFAULTS = Object.freeze({ master: .6, hits: 1, movement: .65, crowd: .5, environment: .15 });
export const ARENA_STORAGE_KEY = 'rally.arena.v1';
const levels = ['master', 'hits', 'movement', 'crowd', 'environment'];
export function normalizeArenaPreferences(value) {
  const result = { ...ARENA_DEFAULTS };
  for (const key of levels) if (Number.isFinite(value?.[key])) result[key] = Math.max(0, Math.min(1, value[key]));
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
