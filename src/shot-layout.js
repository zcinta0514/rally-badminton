export const SHOT_LAYOUT_STORAGE_KEY = 'rally.shotLayout.v1';
export const SHOT_KEYS = Object.freeze(['clear', 'drop', 'smash']);
export const SHOT_LAYOUT_MODES = Object.freeze(['default', 'arc', 'custom']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const storage = () => { try { return globalThis.localStorage; } catch { return null; } };
const isMode = value => SHOT_LAYOUT_MODES.includes(value);

/** Valid inputs only change the saved layout; malformed data falls back to the shipped grid. */
export function normalizeShotLayout(value) {
  if (!isMode(value?.mode) || value.mode !== 'custom') return { mode: isMode(value?.mode) ? value.mode : 'default', positions: null };
  const positions = {};
  for (const key of SHOT_KEYS) {
    const point = value?.positions?.[key];
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return { mode: 'default', positions: null };
    positions[key] = { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
  }
  return { mode: 'custom', positions };
}

export function readShotLayout(store = storage()) {
  try { return normalizeShotLayout(JSON.parse(store?.getItem(SHOT_LAYOUT_STORAGE_KEY) || 'null')); }
  catch { return normalizeShotLayout(null); }
}

export function saveShotLayout(value, store = storage()) {
  const layout = normalizeShotLayout(value);
  try { store?.setItem(SHOT_LAYOUT_STORAGE_KEY, JSON.stringify(layout)); } catch { /* Local storage is optional. */ }
  return layout;
}

function clearHints(doc) {
  const wrap = doc.querySelector?.('#game-controls .shots-wrap');
  for (const element of [wrap?.querySelector('.aim-heading'), wrap?.querySelector('.shot-instruction')]) {
    if (!element) continue;
    element.style.removeProperty('left');
    element.style.removeProperty('top');
  }
}

/** The hint follows the custom cluster so it can never point at an old corner. */
export function positionShotHints(doc = globalThis.document) {
  const wrap = doc.querySelector?.('#game-controls .shots-wrap');
  const heading = wrap?.querySelector('.aim-heading'), instruction = wrap?.querySelector('.shot-instruction');
  if (!wrap || !heading || !instruction) return;
  if (doc.body?.dataset.shotLayout !== 'custom') { clearHints(doc); return; }
  const rects = [...wrap.querySelectorAll('.shot-btn')].map(button => button.getBoundingClientRect());
  if (!rects.length) return;
  const view = doc.defaultView || globalThis;
  const left = Math.min(...rects.map(rect => rect.left)), right = Math.max(...rects.map(rect => rect.right));
  const top = Math.min(...rects.map(rect => rect.top)), bottom = Math.max(...rects.map(rect => rect.bottom));
  const center = clamp((left + right) / 2, 92, Math.max(92, view.innerWidth - 92));
  heading.style.left = `${center}px`;
  heading.style.top = `${Math.max(8, top - 30)}px`;
  instruction.style.left = `${center}px`;
  instruction.style.top = bottom + 44 <= view.innerHeight ? `${bottom + 8}px` : `${Math.max(8, top - 66)}px`;
}

/** Apply one layout to the live controls. Positions are viewport percentages. */
export function applyShotLayout(layout, doc = globalThis.document) {
  const normalized = normalizeShotLayout(layout);
  if (doc.body) doc.body.dataset.shotLayout = normalized.mode;
  const buttons = [...(doc.querySelectorAll?.('#game-controls .shot-btn') || [])];
  const view = doc.defaultView || globalThis;
  for (const button of buttons) {
    if (normalized.mode === 'custom') {
      const point = normalized.positions?.[button.dataset.shot];
      if (point) {
        const halfWidth = (button.offsetWidth || 0) / 2, halfHeight = (button.offsetHeight || 0) / 2;
        const width = view.innerWidth || 0, height = view.innerHeight || 0;
        const x = width > 0 ? Math.max((halfWidth + 8) / width, Math.min(1 - (halfWidth + 8) / width, point.x)) : point.x;
        const y = height > 0 ? Math.max((halfHeight + 8) / height, Math.min(1 - (halfHeight + 8) / height, point.y)) : point.y;
        button.style.left = `${x * 100}%`;
        button.style.top = `${y * 100}%`;
        continue;
      }
    }
    button.style.removeProperty('left');
    button.style.removeProperty('top');
  }
  if (normalized.mode === 'custom' && doc.body?.dataset.screen === 'match' && !doc.querySelector('#game-controls')?.hidden) positionShotHints(doc);
  else clearHints(doc);
  return normalized;
}

const KEY_LABELS = { clear: '高远', drop: '吊球', smash: '杀球' };

/** Resolve the notch and home-indicator insets once per clamp. */
const safeInsets = doc => {
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;inset:0;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  doc.body.append(probe);
  const style = (doc.defaultView || globalThis).getComputedStyle(probe);
  const read = value => Number.parseFloat(value) || 0;
  const insets = { top: read(style.paddingTop), right: read(style.paddingRight), bottom: read(style.paddingBottom), left: read(style.paddingLeft) };
  probe.remove();
  return insets;
};

/**
 * Menu-level layout editor. The real controls stay untouched until Save.
 * The preview clones the shipped buttons so the hit target and skin are identical.
 */
export function bindShotLayout({ document: doc = globalThis.document, store = storage(), showToast = () => {}, onClose = () => {} } = {}) {
  const controls = doc.querySelector?.('#game-controls');
  if (!controls) return null;
  let saved = applyShotLayout(readShotLayout(store), doc);
  let editor = null, keys = [], mode = saved.mode, drag = null, previous = saved;

  const measurePreset = preset => {
    const source = controls.querySelector('.shots-wrap');
    const stage = doc.createElement('div');
    stage.className = 'shot-layout-measure';
    const clone = source.cloneNode(true);
    clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    clone.querySelectorAll('.shot-btn').forEach(button => {
      for (const property of ['left', 'top', 'width', 'height']) button.style.removeProperty(property);
    });
    stage.append(clone);
    doc.body.append(stage);
    const previousMode = doc.body.dataset.shotLayout;
    doc.body.dataset.shotLayout = preset;
    const view = doc.defaultView || globalThis;
    const positions = {};
    for (const key of SHOT_KEYS) {
      const rect = clone.querySelector(`[data-shot="${key}"]`).getBoundingClientRect();
      positions[key] = { x: (rect.left + rect.width / 2) / view.innerWidth, y: (rect.top + rect.height / 2) / view.innerHeight };
    }
    stage.remove();
    doc.body.dataset.shotLayout = previousMode;
    return positions;
  };

  const keyCenter = key => {
    const rect = key.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
  };

  const place = (key, point) => {
    const view = doc.defaultView || globalThis;
    const safe = safeInsets(doc);
    const rect = key.getBoundingClientRect();
    const x = clamp(point.x, rect.width / 2 + 8 + safe.left, view.innerWidth - rect.width / 2 - 8 - safe.right);
    const y = clamp(point.y, rect.height / 2 + 8 + safe.top, view.innerHeight - rect.height / 2 - 8 - safe.bottom);
    key.style.left = `${x}px`;
    key.style.top = `${y}px`;
  };

  const status = () => editor?.querySelector('.shot-layout-status');
  const setMode = next => {
    mode = next;
    if (status()) status().textContent = next === 'custom' ? '自定义' : next === 'arc' ? '弧形预设' : '原位预设';
    for (const chip of editor?.querySelectorAll('[data-preset]') || []) chip.setAttribute('aria-pressed', String(chip.dataset.preset === next));
  };

  const setPreset = preset => {
    const positions = preset === 'custom'
      ? saved.positions
      : measurePreset(preset);
    if (!positions) return setPreset('default');
    for (const key of keys) {
      const point = positions[key.dataset.shot];
      if (!point) continue;
      place(key, { x: point.x * (doc.defaultView || globalThis).innerWidth, y: point.y * (doc.defaultView || globalThis).innerHeight });
    }
    setMode(preset);
  };

  const buildEditor = () => {
    if (editor) return;
    editor = doc.createElement('section');
    editor.id = 'shot-layout-editor';
    editor.className = 'shot-layout-editor';
    editor.hidden = true;
    editor.setAttribute('role', 'dialog');
    editor.setAttribute('aria-modal', 'true');
    editor.setAttribute('aria-label', '调整击球键位置');
    editor.innerHTML = '<div class="shot-layout-toolbar"><div class="shot-layout-title"><strong>调整击球键位置</strong><small>拖动三个键到顺手的位置</small></div><div class="shot-layout-presets" role="group" aria-label="按键预设"><button type="button" data-preset="default">原位</button><button type="button" data-preset="arc">弧形</button></div><span class="shot-layout-status">原位预设</span><div class="shot-layout-actions"><button type="button" class="text-btn" data-action="cancel">取消</button><button type="button" class="primary-btn" data-action="save">保存</button></div></div><div class="shot-layout-stage"><div class="shot-layout-joystick" aria-hidden="true"><i></i></div><div class="shot-layout-keys"></div></div><p class="shot-layout-note">左摇杆位置不变 · 三个键之间会自动留出间距</p>';
    doc.body.append(editor);
    const holder = editor.querySelector('.shot-layout-keys');
    const source = [...controls.querySelectorAll('.shot-btn')];
    keys = source.map(button => {
      const clone = button.cloneNode(true);
      clone.removeAttribute('id');
      clone.classList.remove('unavailable', 'ready', 'charging', 'fired');
      clone.classList.add('shot-layout-key');
      clone.removeAttribute('disabled');
      clone.removeAttribute('data-aiming');
      for (const property of ['--charge', '--aim-x', '--aim-y', '--aim-angle']) clone.style.removeProperty(property);
      clone.setAttribute('role', 'button');
      clone.setAttribute('tabindex', '0');
      clone.setAttribute('aria-label', `拖动${KEY_LABELS[clone.dataset.shot] || '击球键'}`);
      holder.append(clone);
      return clone;
    });
    const start = event => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      const key = event.currentTarget, center = keyCenter(key);
      drag = { key, id: event.pointerId, dx: event.clientX - center.x, dy: event.clientY - center.y };
      try { key.setPointerCapture(event.pointerId); } catch { /* Window listeners still finish the drag. */ }
      key.classList.add('dragging');
      setMode('custom');
    };
    const move = event => {
      if (!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      const key = drag.key, center = keyCenter(key);
      const view = doc.defaultView || globalThis, safe = safeInsets(doc);
      const x = clamp(event.clientX - drag.dx, center.width / 2 + 8 + safe.left, view.innerWidth - center.width / 2 - 8 - safe.right);
      const y = clamp(event.clientY - drag.dy, center.height / 2 + 8 + safe.top, view.innerHeight - center.height / 2 - 8 - safe.bottom);
      for (const other of keys) {
        if (other === key) continue;
        const point = keyCenter(other);
        const minimum = (center.width + point.width) / 2 + 6;
        if (Math.hypot(x - point.x, y - point.y) < minimum) return;
      }
      key.style.left = `${x}px`;
      key.style.top = `${y}px`;
    };
    const end = event => {
      if (!drag || drag.id !== event.pointerId) return;
      drag.key.classList.remove('dragging');
      drag = null;
    };
    for (const key of keys) {
      key.addEventListener('pointerdown', start);
      key.addEventListener('pointermove', move);
      key.addEventListener('pointerup', end);
      key.addEventListener('pointercancel', end);
      key.addEventListener('lostpointercapture', end);
      key.addEventListener('keydown', event => {
        const step = event.shiftKey ? 12 : 4;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const center = keyCenter(key);
        place(key, { x: center.x + delta[0], y: center.y + delta[1] });
        setMode('custom');
      });
    }
    editor.querySelector('.shot-layout-presets').addEventListener('click', event => {
      const preset = event.target.closest('[data-preset]')?.dataset.preset;
      if (preset) setPreset(preset);
    });
    editor.querySelector('[data-action=cancel]').addEventListener('click', () => close(false));
    editor.querySelector('[data-action=save]').addEventListener('click', () => {
      const view = doc.defaultView || globalThis;
      if (mode === 'custom') {
        const positions = {};
        for (const key of keys) {
          const center = keyCenter(key);
          const halfWidth = center.width / 2, halfHeight = center.height / 2;
          positions[key.dataset.shot] = {
            x: Math.max((halfWidth + 8) / view.innerWidth, Math.min(1 - (halfWidth + 8) / view.innerWidth, center.x / view.innerWidth)),
            y: Math.max((halfHeight + 8) / view.innerHeight, Math.min(1 - (halfHeight + 8) / view.innerHeight, center.y / view.innerHeight)),
          };
        }
        saved = saveShotLayout({ mode: 'custom', positions }, store);
      } else saved = saveShotLayout({ mode }, store);
      applyShotLayout(saved, doc);
      close();
      showToast('击球键位置已保存');
    });
    doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor.hidden) close(false); });
  };

  const open = () => {
    buildEditor();
    previous = saved;
    editor.hidden = false;
    doc.body.dataset.shotLayoutEditing = 'true';
    setPreset(saved.mode === 'custom' ? 'custom' : saved.mode);
    return true;
  };
  const close = (commit = true) => {
    if (!editor || editor.hidden) return;
    editor.hidden = true;
    delete doc.body.dataset.shotLayoutEditing;
    drag = null;
    if (!commit) applyShotLayout(previous, doc);
    else applyShotLayout(saved, doc);
    mode = saved.mode;
    onClose();
  };

  const resetPosition = () => {
    if (!editor) return;
    setPreset('default');
  };

  const onResize = () => {
    if (!editor || editor.hidden) return applyShotLayout(saved, doc);
    for (const key of keys) {
      const current = keyCenter(key);
      place(key, { x: current.x, y: current.y });
    }
  };
  doc.defaultView?.addEventListener('resize', onResize);
  doc.defaultView?.addEventListener('orientationchange', onResize);

  return { open, close: () => close(false), resetPosition, refresh: () => applyShotLayout(saved, doc), get layout() { return { ...saved }; }, get editing() { return Boolean(editor && !editor.hidden); } };
}
