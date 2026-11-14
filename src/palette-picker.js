import { COURT_PALETTES, DEFAULT_COURT_PALETTE, normalizeCourtPalette } from './court-palettes.js';

const swatchColor = (name) => '#' + COURT_PALETTES[name].court.toString(16).padStart(6, '0');

export function bindPalettePicker({ document = globalThis.document, palette = DEFAULT_COURT_PALETTE, onSelect = () => {} } = {}) {
  const options = document.querySelector('#palette-options');
  if (!options) return null;
  const entries = new Map();
  for (const [name, { label }] of Object.entries(COURT_PALETTES)) {
    const option = document.createElement('button');
    option.type = 'button';
    option.dataset.palette = name;
    option.setAttribute('aria-pressed', 'false');
    const swatch = document.createElement('i');
    swatch.style.background = swatchColor(name);
    swatch.setAttribute('aria-hidden', 'true');
    option.append(swatch, document.createTextNode(label));
    option.addEventListener('click', () => onSelect(name));
    entries.set(name, option);
    options.append(option);
  }
  const setValue = (name) => {
    const selected = normalizeCourtPalette(name);
    for (const [key, option] of entries) option.setAttribute('aria-pressed', String(key === selected));
    return selected;
  };
  setValue(palette);
  return { setValue };
}
