import { isValidCup } from './cup-draw.js';

export const CUP_STORAGE_KEY = 'rally.cup.v1';

export function readCupSave(storage) {
  try {
    const saved = JSON.parse(storage.getItem(CUP_STORAGE_KEY));
    if (saved && isValidCup(saved.draw)) {
      saved.draw.target ??= 5;
      return saved;
    }
  } catch {}
  return null;
}

// A newer checkpoint from another tab owns the run. Never overwrite it
// with the older tab's match or bring back an already withdrawn draw.
export function writeCupSave(storage, previous, draw, match) {
  const current = readCupSave(storage);
  if ((current?.revision ?? null) !== (previous?.revision ?? null)) {
    throw new Error('另一窗口已更新杯赛进度，请从签表重新进入。');
  }
  if (!draw) {
    storage.removeItem(CUP_STORAGE_KEY);
    return null;
  }
  const saved = {revision: crypto.randomUUID?.() || Math.random().toString(36).slice(2), draw, match};
  storage.setItem(CUP_STORAGE_KEY, JSON.stringify(saved));
  return saved;
}
