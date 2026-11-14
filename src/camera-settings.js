export const CAMERA_DEFAULTS = Object.freeze({ pitchDegrees: 24, zoom: 1 });
export const CAMERA_LIMITS = Object.freeze({ pitchMin: 18, pitchMax: 40, zoomMin: .85, zoomMax: 1.12 });
const STORAGE_KEY = 'rally.camera.v1';
const clamp = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizeCameraSettings(value) {
  return {
    pitchDegrees: clamp(value?.pitchDegrees, CAMERA_DEFAULTS.pitchDegrees, CAMERA_LIMITS.pitchMin, CAMERA_LIMITS.pitchMax),
    zoom: clamp(value?.zoom, CAMERA_DEFAULTS.zoom, CAMERA_LIMITS.zoomMin, CAMERA_LIMITS.zoomMax),
  };
}

function localStorageIfAvailable() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function readCameraSettings(storage = localStorageIfAvailable()) {
  try { return normalizeCameraSettings(JSON.parse(storage?.getItem(STORAGE_KEY) || 'null')); }
  catch { return { ...CAMERA_DEFAULTS }; }
}

export function saveCameraSettings(settings, storage = localStorageIfAvailable()) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeCameraSettings(settings))); } catch { /* Private or full storage must not block camera controls. */ }
}

export function bindCameraSettings(view, { document = globalThis.document, storage = localStorageIfAvailable() } = {}) {
  const pitch = document.querySelector('#camera-pitch');
  const zoom = document.querySelector('#camera-zoom');
  const pitchValue = document.querySelector('#camera-pitch-value');
  const zoomValue = document.querySelector('#camera-zoom-value');
  const reset = document.querySelector('#camera-reset');
  let settings = readCameraSettings(storage);
  const cleanups = [];
  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  };
  const apply = () => {
    view.setCameraSettings(settings);
    pitch.value = String(settings.pitchDegrees);
    zoom.value = String(Math.round(settings.zoom * 100));
    pitchValue.value = `${settings.pitchDegrees}°`;
    zoomValue.value = `${Math.round(settings.zoom * 100)}%`;
  };
  const change = (persist) => {
    settings = normalizeCameraSettings({ pitchDegrees: Number(pitch.value), zoom: Number(zoom.value) / 100 });
    apply();
    if (persist) saveCameraSettings(settings, storage);
  };
  // Apply each input event immediately; persist once at the end of a drag.
  for (const input of [pitch, zoom]) {
    listen(input, 'input', () => change(false));
    listen(input, 'change', () => change(true));
  }
  listen(reset, 'click', () => { settings = { ...CAMERA_DEFAULTS }; apply(); saveCameraSettings(settings, storage); });
  apply();
  return { dispose() { cleanups.forEach(remove => remove()); } };
}
