export function normalizeStick(dx, dy, radius = 48) {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { x: 0, z: 0 };
  const distance = Math.hypot(dx, dy);
  if (distance <= radius * 0.1) return { x: 0, z: 0 };
  const strength = Math.min(1, (distance / radius - 0.1) / 0.9);
  return { x: dx === 0 ? 0 : (dx / distance) * strength, z: dy === 0 ? 0 : (dy / distance) * strength };
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const SHOT_KEYS = { KeyJ: 'clear', KeyK: 'drop', KeyL: 'smash' };
const AIM_KEYS = { KeyZ: -1, KeyX: 0, KeyC: 1 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const editable = (target) => Boolean(target && (
  /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable ||
  target.closest?.('[contenteditable]:not([contenteditable="false"]), [role="textbox"]')
));
const textEditable = (target) => editable(target) && !(target.tagName === 'INPUT' && target.type === 'range');

export class Controls {
  constructor({ joystick, knob, shotButtons, movementSurface = null, onShot = () => {}, onAim = () => {}, onAimSelect = () => {}, onPause = () => {} }) {
    this.joystick = joystick;
    this.knob = knob;
    this.shotButtons = Array.from(shotButtons);
    this.document = joystick.ownerDocument;
    this.window = this.document.defaultView;
    this.movementSurface = movementSurface;
    this.onShot = onShot;
    this.onAim = onAim;
    this.onAimSelect = onAimSelect;
    this.onPause = onPause;
    this.enabled = true;
    this.disposed = false;
    this.keys = new Set();
    this.axes = { x: 0, z: 0 };
    this.stickPointer = null;
    this.stickOrigin = null;
    this.activeShot = null;
    this.chargeFrame = null;
    this.removeListeners = [];
    this.originalTouchActions = new Map();

    const pointerUp = (event) => this._pointerUp(event);
    const pointerCancel = (event) => this._pointerCancel(event);
    const movedEvents = new WeakSet();
    const pointerMove = (event) => {
      // A captured move also bubbles to window; process that event only once.
      if (!this.enabled || movedEvents.has(event)) return;
      movedEvents.add(event);
      if (event.pointerId === this.stickPointer) {
        event.preventDefault();
        this._moveStick(event);
      }
      if (event.pointerId === this.activeShot?.pointerId) {
        event.preventDefault();
        this._moveAim(event);
      }
    };
    for (const element of new Set([joystick, movementSurface, ...this.shotButtons].filter(Boolean))) {
      this.originalTouchActions.set(element, element.style.touchAction);
      element.style.touchAction = 'none';
      this._listen(element, 'pointerup', pointerUp);
      this._listen(element, 'pointermove', pointerMove);
      this._listen(element, 'pointercancel', pointerCancel);
      this._listen(element, 'lostpointercapture', pointerCancel);
      this._listen(element, 'contextmenu', (event) => { if (this.enabled) event.preventDefault(); });
    }
    if (movementSurface) {
      joystick.dataset.floating = 'true';
      joystick.dataset.active = 'false';
      // The visible stick never intercepts touches. The court captures the
      // gesture while document also admits non-interactive control-space gaps.
      this._listen(this.document, 'pointerdown', (event) => this._stickDown(event));
      this._listen(this.window, 'resize', () => this.reset());
      this._listen(this.window, 'orientationchange', () => this.reset());
    } else this._listen(joystick, 'pointerdown', (event) => this._stickDown(event));
    for (const button of this.shotButtons) {
      button.style.setProperty('--charge', '0');
      this._listen(button, 'pointerdown', (event) => this._shotDown(event, button));
    }
    // These also cover pointer capture failing or a release outside a control.
    this._listen(this.window, 'pointermove', pointerMove);
    this._listen(this.window, 'pointerup', pointerUp);
    this._listen(this.window, 'pointercancel', pointerCancel);
    this._listen(this.window, 'keydown', (event) => this._keyDown(event));
    this._listen(this.window, 'keyup', (event) => this._keyUp(event));
    this._listen(this.window, 'blur', () => this.reset());
    this._listen(this.window, 'pagehide', () => this.reset());
    this._listen(this.document, 'visibilitychange', () => { if (this.document.hidden) this.reset(); });
    this._listen(this.document, 'focusin', (event) => { if (textEditable(event.target)) this.reset(); });
    const inMatch = (event) => this.document.body?.dataset?.screen === 'match' && !textEditable(event.target);
    for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange']) {
      this._listen(this.document, type, (event) => { if (inMatch(event)) event.preventDefault(); });
    }
    // CSS touch-action is the first line of defence. This non-passive fallback
    // also covers blank court touches in WebKit, while leaving dialogs/ranges
    // and the nickname/room-code fields with their native editing behaviour.
    for (const type of ['touchstart', 'touchmove']) {
      this._listen(this.document, type, (event) => {
        if (inMatch(event) && event.target?.closest?.('#court, #game-controls')) event.preventDefault();
      });
    }
    this._setKnob(0, 0);
  }

  _listen(target, type, listener) {
    target.addEventListener(type, listener, { passive: false });
    this.removeListeners.push(() => target.removeEventListener(type, listener));
  }

  _capture(element, pointerId) {
    try { element.setPointerCapture(pointerId); } catch { /* Window handlers still track and release the input. */ }
  }

  _release(element, pointerId) {
    if (pointerId == null) return;
    try {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    } catch { /* The browser may already have removed this pointer. */ }
  }

  _setKnob(x, y) {
    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  _canStartFloatingStick(event) {
    if (this.document.body?.dataset?.screen !== 'match') return false;
    const target = event.target;
    if (target?.closest?.('button, a, input, textarea, select, [contenteditable], [role="button"], [role="slider"], dialog, .dialog, #dialog-backdrop, #camera-panel, .topbar')) return false;
    if (this.document.querySelector?.('dialog[open], .dialog:not([hidden]), [role="dialog"]:not([hidden])')) return false;
    if (target !== this.movementSurface && !this.movementSurface.contains?.(target) && !target?.closest?.('#game-controls')) return false;
    const width = this.window.innerWidth || this.document.documentElement?.clientWidth;
    const height = this.window.innerHeight || this.document.documentElement?.clientHeight;
    return [event.clientX, event.clientY, width, height].every(Number.isFinite) &&
      event.clientX >= 0 && event.clientX < width / 2 && event.clientY >= 0 && event.clientY < height;
  }

  _stickDown(event) {
    if (!this.enabled || this.stickPointer !== null || event.pointerId === this.activeShot?.pointerId || (event.button != null && event.button !== 0)) return;
    if (this.movementSurface && !this._canStartFloatingStick(event)) return;
    event.preventDefault();
    this.stickPointer = event.pointerId;
    if (this.movementSurface) {
      // Keep the true down point even near an edge: clamping the visual origin
      // would make a resting thumb move the player before it actually drags.
      this.stickOrigin = { x: event.clientX, y: event.clientY };
      this.joystick.style.left = `${event.clientX}px`;
      this.joystick.style.top = `${event.clientY}px`;
      this.joystick.dataset.active = 'true';
    }
    this._capture(this.movementSurface || this.joystick, event.pointerId);
    this._moveStick(event);
  }

  _moveStick(event) {
    const rect = this.joystick.getBoundingClientRect();
    const width = this.joystick.clientWidth || rect.width;
    const height = this.joystick.clientHeight || rect.height;
    if (rect.width <= 0 || rect.height <= 0) return;
    const origin = this.stickOrigin || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const dx = (event.clientX - origin.x) * width / rect.width;
    const dy = (event.clientY - origin.y) * height / rect.height;
    const radius = Math.min(width, height) * 0.4;
    this.axes = normalizeStick(dx, dy, radius);
    const distance = Math.hypot(dx, dy);
    const factor = distance > radius ? radius / distance : 1;
    this._setKnob(Number.isFinite(dx) ? dx * factor : 0, Number.isFinite(dy) ? dy * factor : 0);
  }

  _clearStick() {
    const pointerId = this.stickPointer;
    this.stickPointer = null;
    this.stickOrigin = null;
    this.axes = { x: 0, z: 0 };
    this._setKnob(0, 0);
    if (this.movementSurface) this.joystick.dataset.active = 'false';
    this._release(this.movementSurface || this.joystick, pointerId);
  }

  _shotDown(event, button) {
    if (!this.enabled || this.activeShot || event.pointerId === this.stickPointer || (event.button != null && event.button !== 0)) return;
    if (!Object.values(SHOT_KEYS).includes(button.dataset.shot)) return;
    event.preventDefault();
    const rect = button.getBoundingClientRect();
    this._startShot({
      shot: button.dataset.shot, button, pointerId: event.pointerId,
      startX: event.clientX, scaleX: rect.width > 0 ? (button.clientWidth || rect.width) / rect.width : 1,
      startY: event.clientY, scaleY: rect.height > 0 ? (button.clientHeight || rect.height) / rect.height : 1,
    });
    this._capture(button, event.pointerId);
  }

  _startShot(data) {
    this.activeShot = { ...data, startTime: this.window.performance.now(), aim: 0, aimDepth: 0, aimExplicit: false };
    data.button?.classList.add('charging');
    this.onAim(0, false, 0);
    this._paintCharge();
  }

  _charge() {
    return this.activeShot ? clamp((this.window.performance.now() - this.activeShot.startTime) / 650, 0, 1) : 0;
  }

  _paintCharge() {
    if (!this.activeShot) return;
    const charge = this._charge();
    this.activeShot.button?.style.setProperty('--charge', String(charge));
    if (charge < 1) this.chargeFrame = this.window.requestAnimationFrame(() => {
      this.chargeFrame = null;
      this._paintCharge();
    });
  }

  _moveAim(event) {
    const shot = this.activeShot;
    const dx = (event.clientX - shot.startX) * shot.scaleX;
    const dy = (shot.startY - event.clientY) * shot.scaleY;
    if (![dx, dy].every(Number.isFinite)) return;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) shot.aimExplicit = true;
    shot.aim = Math.abs(dx) <= 6 ? 0 : clamp(dx / 48, -1, 1);
    shot.aimDepth = Math.abs(dy) <= 6 ? 0 : clamp(dy / 48, -1, 1);
    this.onAim(shot.aim, shot.aimExplicit, shot.aimDepth);
  }

  _finishShot(fire) {
    const shot = this.activeShot;
    if (!shot) return;
    const result = { shot: shot.shot, aim: shot.aim, aimDepth: shot.aimDepth, aimExplicit: shot.aimExplicit, charge: this._charge() };
    // Clear ownership before releasePointerCapture synchronously causes a loss event.
    this.activeShot = null;
    if (this.chargeFrame !== null) this.window.cancelAnimationFrame(this.chargeFrame);
    this.chargeFrame = null;
    shot.button?.classList.remove('charging');
    shot.button?.style.setProperty('--charge', '0');
    if (shot.button) this._release(shot.button, shot.pointerId);
    this.onAim(0, false, 0);
    if (fire && this.enabled) this.onShot(result);
  }

  _pointerUp(event) {
    if (event.pointerId === this.stickPointer) {
      event.preventDefault();
      this._clearStick();
    }
    if (this.activeShot?.pointerId === event.pointerId) {
      event.preventDefault();
      this._moveAim(event);
      this._finishShot(this.enabled);
    }
  }

  _pointerCancel(event) {
    if (event.pointerId === this.stickPointer) this._clearStick();
    if (this.activeShot?.pointerId === event.pointerId) this._finishShot(false);
  }

  _ignoreKeyboard(event) {
    return event.isComposing || event.ctrlKey || event.metaKey || event.altKey || editable(event.target);
  }

  _keyDown(event) {
    if (!this.enabled || this._ignoreKeyboard(event)) return;
    const code = event.code;
    if (!MOVE_KEYS.has(code) && !SHOT_KEYS[code] && !Object.hasOwn(AIM_KEYS, code) && code !== 'Escape') return;
    event.preventDefault();
    if (MOVE_KEYS.has(code)) this.keys.add(code);
    else if (code === 'Escape') { if (!event.repeat) this.onPause(); }
    else if (Object.hasOwn(AIM_KEYS, code)) { if (!event.repeat) this.onAimSelect(AIM_KEYS[code]); }
    else if (!event.repeat && !this.activeShot) this._startShot({
      shot: SHOT_KEYS[code], key: code, button: this.shotButtons.find((button) => button.dataset.shot === SHOT_KEYS[code]),
    });
  }

  _keyUp(event) {
    this.keys.delete(event.code);
    const allowed = this.enabled && !this._ignoreKeyboard(event);
    if (allowed && (MOVE_KEYS.has(event.code) || SHOT_KEYS[event.code] || Object.hasOwn(AIM_KEYS, event.code))) event.preventDefault();
    if (this.activeShot?.key === event.code) this._finishShot(allowed);
  }

  sample() {
    if (!this.enabled || this.disposed) return { x: 0, z: 0, prepare: null, charge: 0 };
    const held = (...keys) => Number(keys.some((key) => this.keys.has(key)));
    const x = this.axes.x + held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
    const z = this.axes.z + held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
    const magnitude = Math.max(1, Math.hypot(x, z));
    return { x: x / magnitude, z: z / magnitude, prepare: this.activeShot?.shot || null, charge: this._charge() };
  }

  reset() {
    this.keys.clear();
    this._clearStick();
    this._finishShot(false);
  }

  setEnabled(enabled) {
    if (this.disposed) return;
    if (!enabled) this.reset();
    this.enabled = Boolean(enabled);
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.enabled = false;
    this.disposed = true;
    this.removeListeners.forEach((remove) => remove());
    this.removeListeners = [];
    this.originalTouchActions.forEach((value, element) => { element.style.touchAction = value || ''; });
  }
}
