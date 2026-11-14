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
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener({ target: this, stopPropagation() {}, preventDefault() {}, ...event }); }
}

function fixture(palette) {
  const optionsElement = new Element('div', 'palette-options');
  const document = {
    querySelector: selector => selector === '#palette-options' ? optionsElement : null,
    createElement: tag => new Element(tag),
    createTextNode: text => ({ textContent: text }),
  };
  const selections = [];
  const picker = bindPalettePicker({ document, palette, onSelect: (name) => selections.push(name) });
  return { optionsElement, selections, picker };
}

const options = (f) => f.optionsElement.children;
const optionFor = (f, name) => options(f).find((option) => option.dataset.palette === name);
const swatch = (name) => '#' + COURT_PALETTES[name].court.toString(16).padStart(6, '0');

test('the settings picker lists every palette with its floor colour', () => {
  const f = fixture('green');
  assert.equal(options(f).length, Object.keys(COURT_PALETTES).length);
  for (const option of options(f)) {
    assert.ok(COURT_PALETTES[option.dataset.palette], 'each option carries a real palette name');
    assert.equal(option.getAttribute('aria-pressed'), String(option.dataset.palette === 'green'));
    assert.equal(option.children[0].style.background, swatch(option.dataset.palette));
    assert.match(option.children[1].textContent, /./);
  }
});

test('choosing an option reports the palette', () => {
  const f = fixture('green');
  optionFor(f, 'purple').emit('click');
  assert.deepEqual(f.selections, ['purple']);
});

test('setValue moves the selection marker and falls back on unknown names', () => {
  const f = fixture('green');
  assert.equal(f.picker.setValue('pink'), 'pink');
  assert.equal(optionFor(f, 'pink').getAttribute('aria-pressed'), 'true');
  assert.equal(optionFor(f, 'green').getAttribute('aria-pressed'), 'false');
  assert.equal(f.picker.setValue('chartreuse'), 'green');
  assert.equal(optionFor(f, 'green').getAttribute('aria-pressed'), 'true');
});
