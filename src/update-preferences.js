import { normalizeArenaPreferences } from './arena-preferences.js';
const KEY = 'rally.update.preferences';
const VERSION = /^[a-f0-9]{16}$/;

export function getUpdatePreferencesStorage(window = globalThis.window) {
  try { return window?.sessionStorage || null; } catch { return null; }
}

function allowedPreferences(settings, sound, arena) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || typeof sound !== 'boolean' ||
      !['balanced', 'swift', 'power'].includes(settings.role) ||
      (settings.coachRole !== undefined && !['balanced', 'swift', 'power'].includes(settings.coachRole)) ||
      (settings.friendRole !== undefined && !['balanced', 'swift', 'power'].includes(settings.friendRole)) ||
      (settings.friendTarget !== undefined && ![5,11,21].includes(settings.friendTarget)) ||
      (settings.friendRuleset !== undefined && !['quick','standard21'].includes(settings.friendRuleset)) ||
      !['easy', 'medium', 'hard'].includes(settings.difficulty) ||
      ![5, 11, 21].includes(settings.target) ||
      !['quick', 'standard21'].includes(settings.ruleset)) return null;
  return { settings: { role: settings.role, ...(settings.coachRole === undefined ? {} : {coachRole: settings.coachRole}),
    ...(settings.friendRole === undefined ? {} : {friendRole:settings.friendRole}),
    ...(settings.friendTarget === undefined ? {} : {friendTarget:settings.friendTarget}),
    ...(settings.friendRuleset === undefined ? {} : {friendRuleset:settings.friendRuleset}),
    difficulty: settings.difficulty, target: settings.target, ruleset: settings.ruleset }, sound,
    ...(arena === undefined ? {} : { arena: normalizeArenaPreferences(arena) }) };
}

// This is a one-use bridge across an automatic update, not a saved user profile.
// The lock caller must reject preparation when any write/read-back step fails.
export function saveUpdatePreferences({ version, settings, sound, arena }, storage) {
  const preferences = allowedPreferences(settings, sound, arena);
  if (typeof version !== 'string' || !VERSION.test(version) || !preferences) throw new Error('无法保存更新前的游戏设置。');
  const serialized = JSON.stringify({ schema: 1, targetVersion: version, ...preferences });
  if (!storage?.setItem || !storage?.getItem) throw new Error('无法保存更新前的游戏设置。');
  storage.setItem(KEY, serialized);
  if (storage.getItem(KEY) !== serialized) throw new Error('未能确认游戏设置已保存。');
}

export function restoreUpdatePreferences(version, storage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    // Discard cancelled, stale and malformed transfers as well. No ordinary
    // future launch should unexpectedly reuse choices from an older session.
    storage.removeItem(KEY);
    if (storage.getItem(KEY) !== null) return null;
    const saved = JSON.parse(raw);
    if (!saved || saved.schema !== 1 || typeof version !== 'string' || !VERSION.test(version) || saved.targetVersion !== version) return null;
    return allowedPreferences(saved.settings, saved.sound, saved.arena);
  } catch { return null; }
}
