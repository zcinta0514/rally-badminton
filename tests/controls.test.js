import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { Controls, normalizeStick } from '../src/controls.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('stick uses screen axes and preserves analog motion outside its deadzone', () => {
  assert.deepEqual(normalizeStick(48, 0), { x: 1, z: 0 });
  assert.deepEqual(normalizeStick(0, -48), { x: 0, z: -1 });
  close(normalizeStick(24, 0).x, (0.5 - 0.1) / 0.9);
});

test('stick clamps diagonal distance and ignores a small resting thumb movement', () => {
  const axes = normalizeStick(48, -48);
  close(axes.x, Math.SQRT1_2);
  close(axes.z, -Math.SQRT1_2);
  assert.deepEqual(normalizeStick(2, 2), { x: 0, z: 0 });
});

test('stick never exposes nonfinite or invalid input values', () => {
  for (const args of [[NaN, 3], [0, Infinity], [1, 2, 0], [1, 2, -5], [1, 2, NaN], ['3', 1]]) {
    assert.deepEqual(normalizeStick(...args), { x: 0, z: 0 });
  }
});

// Minimal browser boundary: actual EventTarget dispatch, deterministic RAF and
// geometry. These tests assert controller outputs; the browser verifies capture.
class Element extends EventTarget {
  constructor(document, shot) {
    super();
    this.ownerDocument = document;
    this.dataset = { shot };
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.classes = new Set();
    this.classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) };
    this.rect = { left: 100, top: 200, width: 120, height: 120 };
    this.clientWidth = this.clientHeight = 120;
    this.tagName = 'DIV';
    this.captured = new Set();
    this.parentElement = null;
  }
  contains(element) { return element === this || Boolean(element?.parentElement && this.contains(element.parentElement)); }
  closest(selectors) {
    const matches = selectors.split(',').map((selector) => selector.trim());
    for (let element = this; element; element = element.parentElement) {
      if (matches.some((selector) => selector === element.tagName.toLowerCase() ||
        selector === `#${element.id}` || (selector.startsWith('.') && element.classes.has(selector.slice(1))) ||
        selector === `[role="${element.role}"]` || (selector === '[contenteditable]' && element.isContentEditable))) return element;
    }
    return null;
  }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); emit(this, 'lostpointercapture', { pointerId: id }); }
}

function emit(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(properties)) Object.defineProperty(event, name, { value });
  target.dispatchEvent(event);
  return event;
}

function fixture(t, { floating = false } = {}) {
  let now = 0;
  let frameId = 0;
  const frames = new Map();
  const window = new EventTarget();
  window.innerWidth = 844;
  window.innerHeight = 390;
  window.performance = { now: () => now };
  window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const document = new EventTarget();
  document.defaultView = window;
  document.hidden = false;
  document.body = { dataset: { screen: 'match' } };
  document.querySelector = () => document.visibleDialog || null;
  const movementSurface = new Element(document);
  movementSurface.id = 'court';
  const joystick = new Element(document);
  const knob = new Element(document);
  const shotButtons = ['clear', 'drop', 'smash'].map((shot) => new Element(document, shot));
  const shots = [];
  const aims = [];
  const aimPreviews = [];
  const selections = [];
  let pauses = 0;
  const controls = new Controls({ joystick, knob, shotButtons, movementSurface: floating ? movementSurface : undefined, onShot: (shot) => shots.push(shot), onAim: (aim, explicit, aimDepth) => { aims.push(aim); aimPreviews.push({ aim, explicit, aimDepth }); }, onAimSelect: (aim) => selections.push(aim), onPause: () => pauses++ });
  t.after(() => controls.dispose());
  return {
    controls, joystick, knob, shotButtons, movementSurface, window, document, shots, aims, aimPreviews, selections,
    get pauses() { return pauses; },
    advance(ms) { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(now)); },
    get pendingFrames() { return frames.size; },
  };
}

const pointer = (target, type, pointerId, clientX, clientY = 260) => emit(target, type, { pointerId, clientX, clientY, button: 0, pointerType: 'touch' });
const key = (window, type, code, extra = {}) => emit(window, type, { code, repeat: false, ...extra });
const movement = (controls) => { const { x, z } = controls.sample(); return { x, z }; };

test('two thumbs independently move and release one shot without stopping movement', (t) => {
  const f = fixture(t);
  pointer(f.joystick, 'pointerdown', 1, 160);
  pointer(f.joystick, 'pointermove', 1, 208);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.shotButtons[0], 'pointerdown', 2, 500);
  f.advance(65);
  pointer(f.shotButtons[0], 'pointerup', 99, 548);
  assert.equal(f.shots.length, 0);
  pointer(f.shotButtons[0], 'pointerup', 2, 500);
  assert.deepEqual(f.shots, [{ shot: 'clear', aim: 0, aimDepth: 0, aimExplicit: false, charge: 0.1 }]);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.joystick, 'pointerup', 1, 208);
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
});

test('joystick converts scaled screen geometry into its local 48px travel', (t) => {
  const f = fixture(t);
  f.joystick.rect = { left: 100, top: 200, width: 240, height: 240 };
  pointer(f.joystick, 'pointerdown', 3, 316, 320);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  assert.match(f.knob.style.transform, /48px/);
});

test('a held shot previews drag aim, caps charge, and emits once on release', (t) => {
  const f = fixture(t);
  const button = f.shotButtons[2];
  pointer(button, 'pointerdown', 2, 500);
  pointer(button, 'pointermove', 2, 524);
  assert.equal(f.aims.at(-1), 0.5);
  f.advance(900);
  assert.equal(Number(button.style['--charge']), 1);
  assert.equal(button.classes.has('charging'), true);
  pointer(button, 'pointerup', 2, 596);
  pointer(button, 'pointerup', 2, 596);
  assert.deepEqual(f.shots, [{ shot: 'smash', aim: 1, aimDepth: 0, aimExplicit: true, charge: 1 }]);
  assert.equal(f.aims.at(-1), 0);
  assert.equal(button.classes.has('charging'), false);
});

test('small tapping drift keeps the shot aimed along the middle', (t) => {
  const f = fixture(t);
  pointer(f.shotButtons[1], 'pointerdown', 2, 500);
  pointer(f.shotButtons[1], 'pointerup', 2, 504);
  assert.deepEqual(f.shots, [{ shot: 'drop', aim: 0, aimDepth: 0, aimExplicit: false, charge: 0 }]);
});

for (const cancellation of ['pointercancel', 'lostpointercapture', 'reset', 'blur', 'hidden', 'disable']) {
  test(`${cancellation} abandons a held shot so its later release cannot fire`, (t) => {
    const f = fixture(t);
    pointer(f.shotButtons[0], 'pointerdown', 2, 500);
    assert.equal(f.shotButtons[0].classes.has('charging'), true);
    f.advance(325);
    if (cancellation === 'reset') f.controls.reset();
    else if (cancellation === 'blur') emit(f.window, 'blur');
    else if (cancellation === 'hidden') { f.document.hidden = true; emit(f.document, 'visibilitychange'); }
    else if (cancellation === 'disable') f.controls.setEnabled(false);
    else pointer(f.shotButtons[0], cancellation, 2, 500);
    pointer(f.shotButtons[0], 'pointerup', 2, 500);
    assert.deepEqual(f.shots, []);
    assert.equal(f.shotButtons[0].classes.has('charging'), false);
    assert.equal(f.pendingFrames, 0);
  });
}

test('losing one pointer does not clear the other thumb and stray pointers do not steal control', (t) => {
  const f = fixture(t);
  pointer(f.joystick, 'pointerdown', 1, 208);
  pointer(f.joystick, 'pointerdown', 9, 112);
  pointer(f.joystick, 'pointermove', 9, 112);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.shotButtons[0], 'pointerdown', 2, 500);
  pointer(f.shotButtons[1], 'pointerdown', 3, 500);
  pointer(f.joystick, 'lostpointercapture', 1, 208);
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
  pointer(f.shotButtons[1], 'pointerup', 3, 500);
  pointer(f.shotButtons[0], 'pointerup', 2, 500);
  assert.deepEqual(f.shots, [{ shot: 'clear', aim: 0, aimDepth: 0, aimExplicit: false, charge: 0 }]);
});

test('keyboard diagonal movement is normalized, held shots charge, and pause ignores repeat', (t) => {
  const f = fixture(t);
  assert.equal(key(f.window, 'keydown', 'KeyW').defaultPrevented, true);
  key(f.window, 'keydown', 'ArrowRight');
  close(f.controls.sample().x, Math.SQRT1_2);
  close(f.controls.sample().z, -Math.SQRT1_2);
  key(f.window, 'keydown', 'KeyJ');
  key(f.window, 'keydown', 'KeyJ', { repeat: true });
  f.advance(325);
  key(f.window, 'keyup', 'KeyJ');
  assert.deepEqual(f.shots, [{ shot: 'clear', aim: 0, aimDepth: 0, aimExplicit: false, charge: 0.5 }]);
  key(f.window, 'keydown', 'Escape');
  key(f.window, 'keydown', 'Escape', { repeat: true });
  assert.equal(f.pauses, 1);
  emit(f.window, 'blur');
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
});

test('input editing, composing text, and browser modifier shortcuts are untouched', (t) => {
  const f = fixture(t);
  const input = new Element(f.document);
  input.tagName = 'INPUT';
  for (const extra of [{ target: input }, { isComposing: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.equal(key(f.window, 'keydown', 'KeyW', extra).defaultPrevented, false);
    key(f.window, 'keydown', 'KeyJ', extra);
    key(f.window, 'keyup', 'KeyJ', extra);
  }
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
  assert.deepEqual(f.shots, []);
});

test('disabled controls stay neutral and dispose removes all active input behavior', (t) => {
  const f = fixture(t);
  pointer(f.joystick, 'pointerdown', 1, 208);
  f.controls.setEnabled(false);
  const aimCount = f.aims.length;
  pointer(f.joystick, 'pointerdown', 3, 208);
  pointer(f.shotButtons[0], 'pointerdown', 2, 500);
  key(f.window, 'keydown', 'KeyW');
  key(f.window, 'keydown', 'Escape');
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
  assert.equal(f.aims.length, aimCount);
  assert.equal(f.pauses, 0);
  f.controls.setEnabled(true);
  f.controls.dispose();
  pointer(f.joystick, 'pointerdown', 1, 208);
  pointer(f.shotButtons[0], 'pointerdown', 2, 500);
  pointer(f.shotButtons[0], 'pointerup', 2, 500);
  key(f.window, 'keydown', 'Escape');
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
  assert.deepEqual(f.shots, []);
  assert.equal(f.pauses, 0);
});

test('focusing a text field clears movement and abandons any keyboard charge', (t) => {
  const f = fixture(t);
  key(f.window, 'keydown', 'KeyW');
  key(f.window, 'keydown', 'KeyK');
  assert.equal(f.controls.sample().z, -1);
  const input = new Element(f.document);
  input.tagName = 'TEXTAREA';
  emit(f.document, 'focusin', { target: input });
  key(f.window, 'keyup', 'KeyK', { target: input });
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
  assert.deepEqual(f.shots, []);
  assert.equal(f.pendingFrames, 0);
});

test('a release outside the button still completes the captured gesture exactly once', (t) => {
  const f = fixture(t);
  pointer(f.joystick, 'pointerdown', 1, 208);
  pointer(f.shotButtons[1], 'pointerdown', 2, 500);
  pointer(f.window, 'pointerup', 2, 452);
  assert.deepEqual(f.shots, [{ shot: 'drop', aim: -1, aimDepth: 0, aimExplicit: true, charge: 0 }]);
  pointer(f.window, 'pointerup', 1, 208);
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
});

test('dispose cancels charge animation and unregisters its DOM and window listeners', (t) => {
  const f = fixture(t);
  pointer(f.shotButtons[2], 'pointerdown', 2, 500);
  assert.ok(f.pendingFrames > 0);
  assert.ok(getEventListeners(f.window, 'keydown').length > 0);
  f.controls.dispose();
  assert.equal(f.pendingFrames, 0);
  const events = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'contextmenu', 'keydown', 'keyup', 'blur', 'pagehide', 'visibilitychange', 'focusin'];
  for (const target of [f.window, f.document, f.joystick, ...f.shotButtons]) {
    for (const type of events) assert.equal(getEventListeners(target, type).length, 0, `${type} remains registered`);
  }
});

test('dragging beyond the aim deadzone then returning to centre remains an explicit target', (t) => {
  const f = fixture(t);
  pointer(f.shotButtons[0], 'pointerdown', 2, 500);
  pointer(f.shotButtons[0], 'pointermove', 2, 530);
  pointer(f.shotButtons[0], 'pointermove', 2, 500);
  pointer(f.shotButtons[0], 'pointerup', 2, 500);
  assert.deepEqual(f.shots, [{ shot: 'clear', aim: 0, aimDepth: 0, aimExplicit: true, charge: 0 }]);
  pointer(f.shotButtons[0], 'pointerdown', 3, 500);
  pointer(f.shotButtons[0], 'pointerup', 3, 506);
  assert.equal(f.shots[1].aimExplicit, false, 'a new tap does not inherit the previous drag');
});

test('Z X C select the left middle and right preset once without starting a shot', (t) => {
  const f = fixture(t);
  for (const code of ['KeyZ', 'KeyX', 'KeyC']) {
    assert.equal(key(f.window, 'keydown', code).defaultPrevented, true);
    key(f.window, 'keydown', code, { repeat: true });
    key(f.window, 'keyup', code);
  }
  assert.deepEqual(f.selections, [-1, 0, 1]);
  assert.deepEqual(f.shots, []);
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
});

test('lane selection leaves text input, browser shortcuts and disabled controls untouched', (t) => {
  const f = fixture(t);
  const input = new Element(f.document); input.tagName = 'INPUT';
  for (const extra of [{ target: input }, { isComposing: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.equal(key(f.window, 'keydown', 'KeyZ', extra).defaultPrevented, false);
  }
  f.controls.setEnabled(false);
  assert.equal(key(f.window, 'keydown', 'KeyC').defaultPrevented, false);
  assert.deepEqual(f.selections, []);
});

test('samples expose charged shot preparation while movement remains independent', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.controls.sample(), { x: 0, z: 0, prepare: null, charge: 0 });
  pointer(f.joystick, 'pointerdown', 1, 208);
  pointer(f.shotButtons[2], 'pointerdown', 2, 500);
  f.advance(325);
  assert.deepEqual(f.controls.sample(), { x: 1, z: 0, prepare: 'smash', charge: 0.5 });
  f.advance(650);
  assert.equal(f.controls.sample().charge, 1);
  pointer(f.shotButtons[2], 'pointerup', 2, 500);
  assert.deepEqual(f.controls.sample(), { x: 1, z: 0, prepare: null, charge: 0 });
  key(f.window, 'keydown', 'KeyK');
  assert.equal(f.controls.sample().prepare, 'drop');
  f.controls.reset();
  assert.deepEqual(f.controls.sample(), { x: 0, z: 0, prepare: null, charge: 0 });
});

test('aim previews distinguish an explicit centre from a reset or a fresh tap', (t) => {
  const f = fixture(t);
  pointer(f.shotButtons[1], 'pointerdown', 4, 500);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: false, aimDepth: 0 });
  pointer(f.shotButtons[1], 'pointermove', 4, 548);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 1, explicit: true, aimDepth: 0 });
  pointer(f.shotButtons[1], 'pointermove', 4, 500);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: true, aimDepth: 0 });
  f.controls.reset();
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: false, aimDepth: 0 });
  assert.deepEqual(f.shots, []);
});

for (const [shotIndex, shot] of ['clear', 'drop', 'smash'].entries()) {
  test(`${shot} accepts forward, backward and diagonal drag targets from its own button`, (t) => {
    const f = fixture(t);
    const button = f.shotButtons[shotIndex];
    const cases = [
      { dx: 0, dy: -48, aim: 0, aimDepth: 1 },
      { dx: 0, dy: 48, aim: 0, aimDepth: -1 },
      { dx: -24, dy: -24, aim: -0.5, aimDepth: 0.5 },
      { dx: 96, dy: 96, aim: 1, aimDepth: -1 },
    ];
    for (const { dx, dy, aim, aimDepth } of cases) {
      pointer(button, 'pointerdown', 2, 500, 300);
      pointer(button, 'pointermove', 2, 500 + dx, 300 + dy);
      assert.deepEqual(f.aimPreviews.at(-1), { aim, explicit: true, aimDepth });
      pointer(button, 'pointerup', 2, 500 + dx, 300 + dy);
      assert.deepEqual(f.shots.at(-1), { shot, aim, aimDepth, aimExplicit: true, charge: 0 });
    }
  });
}

test('shot drag compensates both axes for CSS scale', (t) => {
  const f = fixture(t);
  const button = f.shotButtons[0];
  button.rect = { left: 100, top: 200, width: 240, height: 60 };
  pointer(button, 'pointerdown', 2, 500, 300);
  pointer(button, 'pointermove', 2, 548, 288);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0.5, explicit: true, aimDepth: 0.5 });
  pointer(button, 'pointerup', 2, 596, 276);
  assert.deepEqual(f.shots.at(-1), { shot: 'clear', aim: 1, aimDepth: 1, aimExplicit: true, charge: 0 });
});

test('independent axis deadzones retain an explicit centre after a vertical drag', (t) => {
  const f = fixture(t);
  const button = f.shotButtons[1];
  pointer(button, 'pointerdown', 2, 500, 300);
  pointer(button, 'pointermove', 2, 506, 294);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: false, aimDepth: 0 });
  pointer(button, 'pointermove', 2, 504, 276);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: true, aimDepth: 0.5 });
  pointer(button, 'pointermove', 2, 500, 300);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: true, aimDepth: 0 });
  pointer(button, 'pointerup', 2, 500, 300);
  assert.deepEqual(f.shots.at(-1), { shot: 'drop', aim: 0, aimDepth: 0, aimExplicit: true, charge: 0 });
  pointer(button, 'pointerdown', 3, 500, 300);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: false, aimDepth: 0 });
  pointer(button, 'pointermove', 3, 476, 276);
  pointer(button, 'pointercancel', 3, 476, 276);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: 0, explicit: false, aimDepth: 0 });
  assert.equal(f.shots.length, 1);
});

test('window motion keeps both thumbs and a shot preview live when pointer capture fails', (t) => {
  const f = fixture(t);
  const button = f.shotButtons[2];
  f.joystick.setPointerCapture = button.setPointerCapture = () => { throw new Error('capture unavailable'); };
  pointer(f.joystick, 'pointerdown', 1, 160, 260);
  pointer(button, 'pointerdown', 2, 500, 300);
  pointer(f.window, 'pointermove', 1, 208, 260);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.window, 'pointermove', 2, 476, 276);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: -0.5, explicit: true, aimDepth: 0.5 });
  pointer(f.window, 'pointermove', 99, 700, 100);
  assert.deepEqual(f.aimPreviews.at(-1), { aim: -0.5, explicit: true, aimDepth: 0.5 });
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.window, 'pointerup', 2, 452, 252);
  assert.deepEqual(f.shots, [{ shot: 'smash', aim: -1, aimDepth: 1, aimExplicit: true, charge: 0 }]);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.window, 'pointerup', 1, 208, 260);
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
});

test('match blank space blocks long-press, selection and gesture defaults while text editing remains available', (t) => {
  const f = fixture(t);
  f.document.body = { dataset: { screen: 'match' } };
  const blank = new Element(f.document);
  blank.closest = (selector) => selector.includes('#court') ? blank : null;
  const input = new Element(f.document); input.tagName = 'INPUT';
  for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'touchstart', 'touchmove']) {
    assert.equal(emit(f.document, type, { target: blank }).defaultPrevented, true, type);
    assert.equal(emit(f.document, type, { target: input }).defaultPrevented, false, `${type} must allow editing`);
  }
  f.document.body.dataset.screen = 'menu';
  assert.equal(emit(f.document, 'contextmenu', { target: blank }).defaultPrevented, false);
});

test('one pointer cannot own both movement and a shot while a second thumb remains free', (t) => {
  const f = fixture(t);
  pointer(f.joystick, 'pointerdown', 1, 208);
  pointer(f.shotButtons[0], 'pointerdown', 1, 500);
  assert.equal(f.controls.sample().prepare, null);
  pointer(f.shotButtons[1], 'pointerdown', 2, 500);
  pointer(f.window, 'pointerup', 2, 476, 236);
  assert.equal(f.shots.length, 1);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.window, 'pointerup', 1, 208);
  pointer(f.shotButtons[1], 'pointerdown', 3, 500);
  pointer(f.joystick, 'pointerdown', 3, 208);
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
});

test('adjusting a camera range does not cancel either thumb and cannot summon a context menu', (t) => {
  const f = fixture(t);
  f.document.body = { dataset: { screen: 'match' } };
  const range = new Element(f.document); range.tagName = 'INPUT'; range.type = 'range';
  pointer(f.joystick, 'pointerdown', 1, 208);
  pointer(f.shotButtons[2], 'pointerdown', 2, 500);
  emit(f.document, 'focusin', { target: range });
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  assert.equal(f.controls.sample().prepare, 'smash');
  assert.equal(emit(f.document, 'contextmenu', { target: range }).defaultPrevented, true);
  assert.equal(key(f.window, 'keydown', 'ArrowLeft', { target: range }).defaultPrevented, false);
});

const floatingDown = (f, id, x, y, target = f.movementSurface, extra = {}) => emit(f.document, 'pointerdown', {
  pointerId: id, clientX: x, clientY: y, button: 0, pointerType: 'touch', target, ...extra,
});

test('a floating stick starts neutral exactly under each new left-side touch and hides on release', (t) => {
  const f = fixture(t, { floating: true });
  assert.equal(f.joystick.dataset.floating, 'true');
  assert.equal(f.joystick.dataset.active, 'false');
  for (const [id, x, y] of [[1, 35, 60], [2, 330, 345], [3, 1, 1]]) {
    assert.equal(floatingDown(f, id, x, y).defaultPrevented, true);
    assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
    assert.equal(f.joystick.dataset.active, 'true');
    assert.equal(f.joystick.style.left, `${x}px`);
    assert.equal(f.joystick.style.top, `${y}px`);
    assert.equal(f.movementSurface.hasPointerCapture(id), true);
    pointer(f.movementSurface, 'pointermove', id, x + 48, y);
    assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
    pointer(f.window, 'pointerup', id, x + 48, y);
    assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
    assert.equal(f.joystick.dataset.active, 'false');
    assert.equal(f.movementSurface.hasPointerCapture(id), false);
  }
});

test('floating movement can continue across the centre line without shifting its origin', (t) => {
  const f = fixture(t, { floating: true });
  floatingDown(f, 1, 410, 200);
  pointer(f.window, 'pointermove', 1, 458, 200);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  pointer(f.window, 'pointermove', 1, 410, 152);
  assert.deepEqual(movement(f.controls), { x: 0, z: -1 });
  pointer(f.window, 'pointermove', 1, 410, 200);
  assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
  assert.equal(f.joystick.style.left, '410px');
  assert.equal(f.joystick.style.top, '200px');
});

test('floating stick rejects right-side, outside-viewport, nonfinite and secondary-button starts', (t) => {
  const f = fixture(t, { floating: true });
  for (const [x, y] of [[422, 200], [843, 389], [-1, 100], [100, -1], [100, 390], [NaN, 100], [100, Infinity]]) {
    assert.equal(floatingDown(f, 1, x, y).defaultPrevented, false);
    assert.equal(f.controls.stickPointer, null);
  }
  assert.equal(floatingDown(f, 1, 100, 200, f.movementSurface, { button: 2 }).defaultPrevented, false);
  assert.equal(f.joystick.dataset.active, 'false');
  assert.equal(floatingDown(f, 2, 421.9, 389).defaultPrevented, true);
});

test('floating stick preserves buttons, camera controls, editable fields, header and dialog gestures', (t) => {
  const f = fixture(t, { floating: true });
  const gameControls = new Element(f.document); gameControls.id = 'game-controls';
  const excluded = [
    ['BUTTON'], ['A'], ['INPUT'], ['TEXTAREA'], ['SELECT'], ['DIV', 'role', 'button'],
    ['DIV', 'role', 'slider'], ['DIV', 'isContentEditable', true], ['DIV', 'id', 'camera-panel'],
    ['DIV', 'id', 'dialog-backdrop'], ['DIV', 'class', 'topbar'], ['SECTION', 'class', 'dialog'],
  ];
  for (const [tagName, property, value] of excluded) {
    const parent = new Element(f.document); parent.tagName = tagName; parent.parentElement = gameControls;
    if (property === 'class') parent.classes.add(value);
    else if (property) parent[property] = value;
    const nestedLabel = new Element(f.document); nestedLabel.parentElement = parent;
    assert.equal(floatingDown(f, 1, 100, 100, nestedLabel).defaultPrevented, false, `${tagName} ${value || ''}`);
    assert.equal(f.controls.stickPointer, null);
  }
  const outside = new Element(f.document);
  assert.equal(floatingDown(f, 1, 100, 100, outside).defaultPrevented, false);
  f.document.visibleDialog = new Element(f.document);
  assert.equal(floatingDown(f, 1, 100, 100).defaultPrevented, false, 'open overlay blocks the underlying court');
  f.document.visibleDialog = null;
  f.document.body.dataset.screen = 'menu';
  assert.equal(floatingDown(f, 1, 100, 100).defaultPrevented, false);
  f.document.body.dataset.screen = 'match';
  const information = new Element(f.document); information.parentElement = gameControls;
  assert.equal(floatingDown(f, 2, 100, 100, information).defaultPrevented, true, 'informational control space remains usable');
});

test('a second left-side finger never moves the floating origin or steals the first finger', (t) => {
  const f = fixture(t, { floating: true });
  floatingDown(f, 1, 60, 200);
  pointer(f.window, 'pointermove', 1, 108, 200);
  assert.equal(floatingDown(f, 2, 300, 200).defaultPrevented, false);
  pointer(f.window, 'pointermove', 2, 250, 200);
  pointer(f.window, 'pointerup', 2, 250, 200);
  assert.equal(f.controls.stickPointer, 1);
  assert.equal(f.joystick.style.left, '60px');
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
});

test('floating movement and shot drag retain independent ownership even when capture fails', (t) => {
  const f = fixture(t, { floating: true });
  const button = f.shotButtons[2];
  f.movementSurface.setPointerCapture = button.setPointerCapture = () => { throw new Error('capture unavailable'); };
  pointer(button, 'pointerdown', 2, 600, 200);
  assert.equal(floatingDown(f, 2, 100, 200).defaultPrevented, false);
  floatingDown(f, 1, 100, 200);
  pointer(f.window, 'pointermove', 1, 148, 200);
  pointer(f.window, 'pointermove', 2, 576, 176);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
  assert.deepEqual(f.aimPreviews.at(-1), { aim: -0.5, explicit: true, aimDepth: 0.5 });
  pointer(f.window, 'pointercancel', 1, 148, 200);
  assert.equal(f.joystick.dataset.active, 'false');
  assert.equal(f.controls.sample().prepare, 'smash');
  pointer(f.window, 'pointerup', 2, 552, 152);
  assert.deepEqual(f.shots, [{ shot: 'smash', aim: -1, aimDepth: 1, aimExplicit: true, charge: 0 }]);
  floatingDown(f, 3, 200, 200);
  pointer(f.window, 'pointermove', 3, 248, 200);
  pointer(button, 'pointerdown', 4, 600, 200);
  pointer(f.window, 'pointerup', 4, 600, 200);
  assert.deepEqual(movement(f.controls), { x: 1, z: 0 });
});

for (const cancellation of ['pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'hidden', 'disable', 'resize', 'orientationchange']) {
  test(`${cancellation} clears and hides the floating stick without leaving a later shot or movement`, (t) => {
    const f = fixture(t, { floating: true });
    floatingDown(f, 1, 100, 200);
    pointer(f.window, 'pointermove', 1, 148, 200);
    if (cancellation === 'hidden') { f.document.hidden = true; emit(f.document, 'visibilitychange'); }
    else if (cancellation === 'disable') f.controls.setEnabled(false);
    else if (['pointercancel', 'lostpointercapture'].includes(cancellation)) pointer(f.movementSurface, cancellation, 1, 148, 200);
    else emit(f.window, cancellation);
    assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
    assert.equal(f.joystick.dataset.active, 'false');
    assert.equal(f.movementSurface.hasPointerCapture(1), false);
    pointer(f.window, 'pointermove', 1, 180, 200);
    pointer(f.window, 'pointerup', 1, 180, 200);
    assert.deepEqual(movement(f.controls), { x: 0, z: 0 });
    assert.deepEqual(f.shots, []);
  });
}

test('viewport rotation recalculates the floating activation boundary and preserves keyboard play', (t) => {
  const f = fixture(t, { floating: true });
  floatingDown(f, 1, 300, 200);
  pointer(f.shotButtons[0], 'pointerdown', 2, 600, 200);
  f.window.innerWidth = 390; f.window.innerHeight = 844;
  emit(f.window, 'orientationchange');
  assert.equal(f.controls.sample().prepare, null);
  pointer(f.window, 'pointerup', 2, 600, 200);
  assert.deepEqual(f.shots, []);
  assert.equal(floatingDown(f, 3, 300, 200).defaultPrevented, false);
  assert.equal(floatingDown(f, 4, 100, 700).defaultPrevented, true);
  pointer(f.window, 'pointerup', 4, 100, 700);
  key(f.window, 'keydown', 'KeyW');
  assert.deepEqual(movement(f.controls), { x: 0, z: -1 });
});

test('disposing floating controls unregisters surface and global listeners and restores touch behaviour', (t) => {
  const f = fixture(t, { floating: true });
  floatingDown(f, 1, 100, 200);
  f.controls.dispose();
  assert.equal(f.joystick.dataset.active, 'false');
  assert.equal(f.movementSurface.style.touchAction, '');
  for (const target of [f.movementSurface, f.document, f.window]) {
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'resize', 'orientationchange']) {
      assert.equal(getEventListeners(target, type).length, 0, type);
    }
  }
  assert.equal(floatingDown(f, 2, 100, 200).defaultPrevented, false);
});
