// Court floor colour presets shared by the venue view and the local match
// settings panel. Green is the existing default; blue is the mainstream BWF
// event colour; the violet and pink floors follow the court colour schemes
// used at the Paris 2024 La Chapelle Arena (violet sampled from press photos,
// deepened for the in-game evening lighting) and in commercial halls that
// install pink PVC. Every preset keeps the white lines readable and moves the
// whole floor ladder (court, apron, edge accent and base) together.
export const DEFAULT_COURT_PALETTE = 'green';

export const COURT_PALETTES = Object.freeze({
  green: Object.freeze({ label: '经典绿', court: 0x0c7054, apron: 0x1c4248, edge: 0x3d7069, dark: 0x14383c }),
  blue: Object.freeze({ label: '赛事蓝', court: 0x154473, apron: 0x1e324a, edge: 0x415970, dark: 0x192838 }),
  purple: Object.freeze({ label: '紫罗兰', court: 0x73589e, apron: 0x483861, edge: 0x776494, dark: 0x362b47 }),
  pink: Object.freeze({ label: '玫瑰粉', court: 0xa14d72, apron: 0x633449, edge: 0x8f5871, dark: 0x452634 }),
});

export const COURT_PALETTE_NAMES = Object.freeze(Object.keys(COURT_PALETTES));

export function normalizeCourtPalette(name) {
  return COURT_PALETTE_NAMES.includes(name) ? name : DEFAULT_COURT_PALETTE;
}

export function resolveCourtPalette(name) {
  return COURT_PALETTES[normalizeCourtPalette(name)];
}
