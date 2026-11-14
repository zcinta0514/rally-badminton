export const SHOT_LAYOUT_STORAGE_KEY = 'rally.shotLayout.v1';
export const SHOT_KEYS = Object.freeze(['clear', 'drop', 'smash']);
export const SHOT_LAYOUT_MODES = Object.freeze(['default', 'arc', 'custom']);
const SIZE = { min: 75, max: 140, default: 100 };

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
  const sizes = {};
  for (const key of SHOT_KEYS) {
    const size = value.sizes?.[key];
    if (!Number.isFinite(size)) continue;
    const percent = clamp(Math.round(size), SIZE.min, SIZE.max);
    if (percent !== SIZE.default) sizes[key] = percent;
  }
  return Object.keys(sizes).length ? { mode: 'custom', positions, sizes } : { mode: 'custom', positions };
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
  const safe = normalized.mode === 'custom' && doc.createElement ? safeInsets(doc) : { top: 0, right: 0, bottom: 0, left: 0 };
  for (const button of buttons) {
    applySize(button, normalized.sizes?.[button.dataset.shot]);
    if (normalized.mode === 'custom') {
      const point = normalized.positions?.[button.dataset.shot];
      if (point) {
        const halfWidth = (button.offsetWidth || 0) / 2, halfHeight = (button.offsetHeight || 0) / 2;
        const width = view.innerWidth || 0, height = view.innerHeight || 0;
        const x = width > 0 ? clamp(point.x, (halfWidth + 8 + safe.left) / width, 1 - (halfWidth + 8 + safe.right) / width) : point.x;
        const y = height > 0 ? clamp(point.y, (halfHeight + 8 + safe.top) / height, 1 - (halfHeight + 8 + safe.bottom) / height) : point.y;
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
function applySize(button, size) {
  if (size && size !== SIZE.default) button.style.setProperty('--shot-scale', String(size / 100));
  else button.style.removeProperty('--shot-scale');
}

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
  const view = doc.defaultView || globalThis;
  let editor, keys, toolbar, slider, sizeLabel, feedback;
  let draft, selected, drag, safe;

  const measurePreset = preset => {
    const source = controls.querySelector('.shots-wrap');
    const stage = doc.createElement('div');
    stage.className = 'shot-layout-measure';
    const clone = source.cloneNode(true);
    clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    clone.querySelectorAll('.shot-btn').forEach(button => {
      for (const property of ['left', 'top', '--shot-scale']) button.style.removeProperty(property);
    });
    stage.append(clone);
    doc.body.append(stage);
    const previousMode = doc.body.dataset.shotLayout;
    doc.body.dataset.shotLayout = preset;
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

  const place = (key, point, checkSpacing = false) => {
    const rect = key.getBoundingClientRect();
    const x = clamp(point.x, rect.width / 2 + 8 + safe.left, view.innerWidth - rect.width / 2 - 8 - safe.right);
    const top = Math.max(safe.top, toolbar.getBoundingClientRect().bottom);
    const y = clamp(point.y, rect.height / 2 + 8 + top, view.innerHeight - rect.height / 2 - 8 - safe.bottom);
    if (checkSpacing && keys.some(other => {
      if (other === key) return false;
      const center = keyCenter(other);
      return Math.hypot(x - center.x, y - center.y) < (rect.width + center.width) / 2 + 6;
    })) return false;
    key.style.left = `${x}px`;
    key.style.top = `${y}px`;
    return true;
  };

  const syncPresets = () => {
    for (const chip of toolbar.querySelectorAll('[data-preset]')) chip.setAttribute('aria-pressed', String(chip.dataset.preset === draft.mode));
  };

  const select = key => {
    selected = key;
    for (const button of keys) button.setAttribute('aria-pressed', String(button === key));
    sizeLabel.textContent = KEY_LABELS[key.dataset.shot] + '大小';
    slider.value = draft.sizes[key.dataset.shot] ?? SIZE.default;
    slider.nextElementSibling.value = slider.value + '%';
    feedback.textContent = '';
  };

  const render = () => {
    const positions = draft.mode === 'custom' ? draft.positions : measurePreset(draft.mode);
    for (const key of keys) {
      const point = positions[key.dataset.shot];
      applySize(key, draft.sizes[key.dataset.shot]);
      place(key, { x: point.x * view.innerWidth, y: point.y * view.innerHeight });
    }
    syncPresets();
    select(selected);
  };

  const recordPositions = () => {
    draft.mode = 'custom';
    draft.positions = Object.fromEntries(keys.map(key => {
      const { x, y } = keyCenter(key);
      return [key.dataset.shot, { x: x / view.innerWidth, y: y / view.innerHeight }];
    }));
    syncPresets();
  };

  const buildEditor = () => {
    if (editor) return;
    editor = doc.createElement('dialog');
    editor.id = 'shot-layout-editor';
    editor.className = 'shot-layout-editor';
    editor.hidden = true;
    editor.setAttribute('aria-label', '击球键布局');
    editor.innerHTML = `
      <div class="shot-layout-toolbar">
        <div class="shot-layout-title"><strong>击球键布局</strong><small>拖动调整位置，点选后调整大小</small></div>
        <div class="shot-layout-presets" role="group" aria-label="按键预设">
          <button type="button" data-preset="default">原位</button>
          <button type="button" data-preset="arc">弧形</button>
        </div>
        <div class="shot-layout-actions">
          <button type="button" class="text-btn" data-action="cancel">取消</button>
          <button type="button" class="primary-btn" data-action="save">保存</button>
        </div>
        <div class="shot-layout-size">
          <label for="shot-key-size">高远大小</label>
          <input id="shot-key-size" type="range" min="${SIZE.min}" max="${SIZE.max}" step="1">
          <output for="shot-key-size">100%</output>
          <small class="shot-layout-feedback" role="status"></small>
        </div>
      </div>
      <div class="shot-layout-stage"><div class="shot-layout-joystick" aria-hidden="true"><i></i></div><div class="shot-layout-keys"></div></div>`;
    doc.body.append(editor);
    toolbar = editor.querySelector('.shot-layout-toolbar');
    slider = editor.querySelector('#shot-key-size');
    sizeLabel = editor.querySelector('label[for="shot-key-size"]');
    feedback = editor.querySelector('.shot-layout-feedback');
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
      clone.setAttribute('aria-label', KEY_LABELS[clone.dataset.shot]);
      holder.append(clone);
      return clone;
    });
    const start = event => {
      if (drag || (event.button !== 0 && event.pointerType === 'mouse')) return;
      event.preventDefault();
      const key = event.currentTarget, center = keyCenter(key);
      select(key);
      key.focus({ preventScroll: true });
      drag = { key, id: event.pointerId, x: event.clientX, y: event.clientY, center };
      key.setPointerCapture(event.pointerId);
    };
    const move = event => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 2 && !drag.moved) return;
      if (place(drag.key, { x: drag.center.x + dx, y: drag.center.y + dy }, true)) {
        drag.moved = true;
        recordPositions();
      }
    };
    const end = event => {
      if (drag?.id === event.pointerId) drag = null;
    };
    for (const key of keys) {
      key.addEventListener('pointerdown', start);
      key.addEventListener('pointermove', move);
      key.addEventListener('pointerup', end);
      key.addEventListener('pointercancel', end);
      key.addEventListener('lostpointercapture', end);
      key.addEventListener('focus', () => select(key));
      key.addEventListener('click', () => select(key));
      key.addEventListener('keydown', event => {
        const step = event.shiftKey ? 12 : 4;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const center = keyCenter(key);
        if (place(key, { x: center.x + delta[0], y: center.y + delta[1] }, true)) recordPositions();
      });
    }
    slider.addEventListener('input', () => {
      const key = selected.dataset.shot, next = Number(slider.value);
      const previous = draft.sizes[key] ?? SIZE.default, center = keyCenter(selected);
      applySize(selected, next);
      // Always allow shrinking so a layout can be repaired after rotating.
      if (!place(selected, center, next > previous)) {
        applySize(selected, previous);
        slider.value = previous;
        feedback.textContent = '空间不足，先移开相邻按键';
        return;
      }
      draft.sizes[key] = next;
      slider.nextElementSibling.value = next + '%';
      feedback.textContent = '';
      recordPositions();
    });
    toolbar.querySelector('.shot-layout-presets').addEventListener('click', event => {
      const preset = event.target.closest('[data-preset]')?.dataset.preset;
      if (!preset) return;
      draft = { mode: preset, sizes: {} };
      render();
    });
    toolbar.querySelector('[data-action=cancel]').addEventListener('click', close);
    toolbar.querySelector('[data-action=save]').addEventListener('click', () => {
      saved = saveShotLayout(draft, store);
      applyShotLayout(saved, doc);
      close();
      showToast('击球键布局已保存');
    });
    editor.addEventListener('cancel', event => {
      event.preventDefault();
      close();
    });
  };

  const open = () => {
    buildEditor();
    editor.hidden = false;
    editor.showModal();
    doc.body.dataset.shotLayoutEditing = 'true';
    draft = { ...saved, sizes: { ...saved.sizes } };
    selected = keys[0];
    safe = safeInsets(doc);
    render();
    toolbar.querySelector('[data-action=cancel]').focus();
    return true;
  };
  const close = () => {
    if (!editor || editor.hidden) return;
    editor.close();
    editor.hidden = true;
    delete doc.body.dataset.shotLayoutEditing;
    drag = null;
    onClose();
  };

  const resetPosition = () => {
    if (!editor || editor.hidden) return;
    draft = { mode: 'default', sizes: {} };
    render();
  };

  const onResize = () => {
    applyShotLayout(saved, doc);
    if (!editor || editor.hidden) return;
    drag = null;
    safe = safeInsets(doc);
    render();
  };
  doc.defaultView?.addEventListener('resize', onResize);
  doc.defaultView?.addEventListener('orientationchange', onResize);

  return { open, close, resetPosition, refresh: () => applyShotLayout(saved, doc), get layout() { return { ...saved }; }, get editing() { return Boolean(editor && !editor.hidden); } };
}
