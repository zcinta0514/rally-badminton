const STORAGE_KEY = 'rally.player.v1';
const validKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function normalizePlayerName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
}

export function createPlayerProfile(options = {}) {
  let storage = options.storage, saved;
  if (!Object.hasOwn(options, 'storage')) { try { storage = globalThis.localStorage; } catch { /* Session-only identity. */ } }
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null'); } catch { /* Invalid or blocked browser storage. */ }
  let playerKey = saved?.playerKey;
  if (!validKey(playerKey)) {
    const crypto = options.crypto ?? globalThis.crypto;
    if (typeof crypto?.getRandomValues !== 'function') throw new Error('浏览器未提供安全随机数，请换用 Safari、Chrome 或 Edge');
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    playerKey = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const profile = {
    playerKey, name: normalizePlayerName(saved?.name), persistent: false,
    saveName(value) { profile.name = normalizePlayerName(value); persist(); return profile.name; },
  };
  function persist() {
    try {
      if (!storage) throw new Error('No browser storage');
      storage.setItem(STORAGE_KEY, JSON.stringify({ playerKey: profile.playerKey, name: profile.name }));
      profile.persistent = true;
    } catch { profile.persistent = false; }
  }
  persist();
  return profile;
}
