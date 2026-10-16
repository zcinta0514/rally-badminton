import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT_PALETTES, COURT_PALETTE_NAMES, DEFAULT_COURT_PALETTE, normalizeCourtPalette, resolveCourtPalette } from '../src/court-palettes.js';

const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => 0.2126 * channel((hex >> 16) & 255) + 0.7152 * channel((hex >> 8) & 255) + 0.0722 * channel(hex & 255);
const contrast = (a, b) => { const first = luminance(a), second = luminance(b); return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05); };
const hue = (hex) => {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!delta) return 0;
  const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
};
const WHITE_LINE = 0xf0f5e7;

test('every court palette defines a label and one colour per venue layer', () => {
  assert.deepEqual(COURT_PALETTE_NAMES, ['green', 'blue', 'purple', 'pink']);
  for (const name of COURT_PALETTE_NAMES) {
    const palette = COURT_PALETTES[name];
    assert.ok(typeof palette.label === 'string' && palette.label.length > 0, `${name} needs a label`);
    for (const key of ['court', 'apron', 'edge', 'dark']) {
      assert.ok(Number.isInteger(palette[key]) && palette[key] >= 0 && palette[key] <= 0xffffff, `${name}.${key} must be a packed RGB colour`);
    }
  }
});

test('the traditional green stays the untouched default so existing halls do not change', () => {
  assert.equal(DEFAULT_COURT_PALETTE, 'green');
  assert.equal(COURT_PALETTES.green.court, 0x0c7054);
  assert.equal(COURT_PALETTES.green.apron, 0x1c4248);
});

test('the white lines keep enough contrast on every court colour', () => {
  for (const name of COURT_PALETTE_NAMES) {
    const ratio = contrast(WHITE_LINE, COURT_PALETTES[name].court);
    assert.ok(ratio >= 4.5, `${name} court vs white line contrast is only ${ratio.toFixed(2)}:1`);
  }
});

test('each palette keeps the floor ladder darker than the court above it', () => {
  for (const name of COURT_PALETTE_NAMES) {
    const palette = COURT_PALETTES[name];
    assert.ok(luminance(palette.court) > luminance(palette.apron), `${name}: the apron must stay darker than the court`);
    assert.ok(luminance(palette.apron) > luminance(palette.dark), `${name}: the base must stay darker than the apron`);
  }
});

test('the four court colours stay far enough apart to be told apart in play', () => {
  const hues = COURT_PALETTE_NAMES.map((name) => hue(COURT_PALETTES[name].court));
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) {
    const gap = Math.min(Math.abs(hues[i] - hues[j]), 360 - Math.abs(hues[i] - hues[j]));
    assert.ok(gap >= 25, `${COURT_PALETTE_NAMES[i]} and ${COURT_PALETTE_NAMES[j]} are only ${gap.toFixed(0)}° apart`);
  }
});

test('unknown, missing or hostile palette names fall back to the documented default', () => {
  assert.equal(normalizeCourtPalette('purple'), 'purple');
  assert.equal(normalizeCourtPalette('pink'), 'pink');
  for (const value of [undefined, null, '', 'chartreuse', 0, [], {}, ['pink'], '__proto__', 'constructor']) {
    assert.equal(normalizeCourtPalette(value), DEFAULT_COURT_PALETTE, `${String(value)} must not select a palette`);
  }
  assert.equal(resolveCourtPalette('nope'), COURT_PALETTES[DEFAULT_COURT_PALETTE]);
  assert.equal(resolveCourtPalette('blue'), COURT_PALETTES.blue);
});
