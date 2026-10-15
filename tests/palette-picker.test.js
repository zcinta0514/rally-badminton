import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT_PALETTES } from '../src/court-palettes.js';
import { bindPalettePicker } from '../src/palette-picker.js';

class Element {
  constructor(tag = 'div', id = '') {
    this.tagName = tag; this.id = id; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.hidden = false;
    this.listeners = new Map(); this.textContent = ''; this.type = '';
  }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  contains(target) { return target === this || this.children.some((child) => child instanceof Element && child.contains(target)); }
  focus() { this.focused = true; }
  emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener({ target: this, stopPropagation() {}, preventDefault() {}, ...event }); }
}

function fixture(palette) {
  const ids = new Map(['palette-toggle', 'palette-panel', 'palette-options', 'palette-current'].map((id) => [id, new Element('div', id)]));
  ids.get('palette-panel').hidden = true;
  // The options container is a descendant of the panel in the real page.
  ids.get('palette-panel').append(new Element('div'), ids.get('palette-options'));
  const documentListeners = new Map();
  const body = new Element('body'); body.dataset.screen = 'match';
  const document = {
    querySelector: (selector) => ids.get(selector.replace(/^#/, '')) ?? null,
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: text }),
    body,
    addEventListener: (type, listener) => { if (!documentListeners.has(type)) documentListeners.set(type, []); documentListeners.get(type).push(listener); },
  };
  const selections = [];
  const picker = bindPalettePicker({ document, palette, onSelect: (name) => selections.push(name) });
  return { ids, body, selections, picker, documentListeners };
}

const options = (f) => f.ids.get('palette-options').children;
const optionFor = (f, name) => options(f).find((option) => option.dataset.palette === name);
const swatch = (name) => '#' + COURT_PALETTES[name].court.toString(16).padStart(6, '0');

test('the standalone picker lists every palette with its floor colour', () => {
  const f = fixture('green');
  assert.equal(options(f).length, Object.keys(COURT_PALETTES).length);
  for (const option of options(f)) {
    assert.ok(COURT_PALETTES[option.dataset.palette], 'each option carries a real palette name');
    assert.equal(option.getAttribute('aria-pressed'), String(option.dataset.palette === 'green'));
    assert.equal(option.children[0].style.background, swatch(option.dataset.palette));
    assert.match(option.children[1].textContent, /./);
  }
  assert.equal(f.ids.get('palette-current').style.background, swatch('green'));
});

test('choosing an option reports the palette and keeps the panel open for comparison', () => {
  const f = fixture('green');
  f.ids.get('palette-toggle').emit('click');
  assert.equal(f.picker.isOpen, true);
  optionFor(f, 'purple').emit('click');
  assert.deepEqual(f.selections, ['purple']);
  assert.equal(f.picker.isOpen, true, 'a player can compare floors without reopening the panel');
});

test('setValue moves the selection marker and falls back on unknown names', () => {
  const f = fixture('green');
  assert.equal(f.picker.setValue('pink'), 'pink');
  assert.equal(f.ids.get('palette-current').style.background, swatch('pink'));
  assert.equal(optionFor(f, 'pink').getAttribute('aria-pressed'), 'true');
  assert.equal(optionFor(f, 'green').getAttribute('aria-pressed'), 'false');
  assert.equal(f.picker.setValue('chartreuse'), 'green');
  assert.equal(optionFor(f, 'green').getAttribute('aria-pressed'), 'true');
  assert.equal(f.ids.get('palette-current').style.background, swatch('green'));
});

test('the toolbar button opens the picker and Escape or an outside press closes it', () => {
  const f = fixture('blue');
  const toggle = f.ids.get('palette-toggle'), panel = f.ids.get('palette-panel');
  toggle.emit('click');
  assert.equal(panel.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  toggle.emit('click');
  assert.equal(panel.hidden, true);
  toggle.emit('click');
  panel.emit('keydown', { key: 'Escape' });
  assert.equal(panel.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.focused, true, 'focus returns to the toolbar entry');
  toggle.emit('click');
  for (const listener of f.documentListeners.get('pointerdown') || []) listener({ target: new Element('div') });
  assert.equal(panel.hidden, true);
});

test('a press inside the open panel keeps it open for further comparison', () => {
  const f = fixture('green');
  f.ids.get('palette-toggle').emit('click');
  const inside = optionFor(f, 'blue');
  for (const listener of f.documentListeners.get('pointerdown') || []) listener({ target: inside });
  assert.equal(f.ids.get('palette-panel').hidden, false);
});
