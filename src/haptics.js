export const HAPTICS_STORAGE_KEY = 'rally.haptics.v1';
export const HAPTIC_PATTERNS = Object.freeze({
  press: 6,
  charged: 8,
  shot: 12,
  smash: Object.freeze([16, 20, 26]),
  ready: 7,
});
const storage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function readHapticsEnabled(store = storage()) {
  try { return store?.getItem(HAPTICS_STORAGE_KEY) !== 'off'; } catch { return true; }
}
export function saveHapticsEnabled(enabled, store = storage()) {
  try { store?.setItem(HAPTICS_STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* Storage is optional. */ }
}

/**
 * Vibration feedback for shot controls. Devices without the Vibration API
 * (notably iOS Safari) report `supported: false` and stay silent; visual and
 * audio feedback are unaffected.
 */
export function createHaptics({ navigator = globalThis.navigator, storage: store = storage() } = {}) {
  const supported = typeof navigator?.vibrate === 'function';
  let enabled = readHapticsEnabled(store);
  const fire = pattern => {
    if (!enabled || !supported) return false;
    try { return navigator.vibrate(pattern); } catch { return false; }
  };
  return {
    supported,
    get enabled() { return enabled; },
    setEnabled(value) {
      enabled = Boolean(value);
      saveHapticsEnabled(enabled, store);
      if (!enabled && supported) { try { navigator.vibrate(0); } catch { /* Ignore a cancelled pattern. */ } }
    },
    press(shot = 'clear') { return fire(shot === 'smash' ? HAPTIC_PATTERNS.charged : HAPTIC_PATTERNS.press); },
    charged() { return fire(HAPTIC_PATTERNS.charged); },
    shoot(shot = 'clear') { return fire(shot === 'smash' ? HAPTIC_PATTERNS.smash : HAPTIC_PATTERNS.shot); },
    ready() { return fire(HAPTIC_PATTERNS.ready); },
  };
}
