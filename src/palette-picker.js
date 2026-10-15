import { COURT_PALETTES, DEFAULT_COURT_PALETTE, normalizeCourtPalette } from './court-palettes.js';

const swatchColor = (name) => '#' + COURT_PALETTES[name].court.toString(16).padStart(6, '0');

// Always-visible local entry point for the court palette. The toolbar button
// carries the current floor colour; the panel stays open while a player
// compares floors and closes on a press outside or when the match screen ends.
export function bindPalettePicker({ document = globalThis.document, palette = DEFAULT_COURT_PALETTE, onSelect = () => {} } = {}) {
  const button = document.querySelector('#palette-toggle');
  const panel = document.querySelector('#palette-panel');
  const options = document.querySelector('#palette-options');
  const dot = document.querySelector('#palette-current');
  if (!button || !panel || !options) return null;
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
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  const setValue = (name) => {
    const selected = normalizeCourtPalette(name);
    for (const [key, option] of entries) option.setAttribute('aria-pressed', String(key === selected));
    if (dot) dot.style.background = swatchColor(selected);
    return selected;
  };
  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); }
  });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close();
  });
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(() => { if (document.body.dataset.screen !== 'match') close(); }) : null;
  observer?.observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  setValue(palette);
  return { close, setValue, get isOpen() { return !panel.hidden; } };
}
