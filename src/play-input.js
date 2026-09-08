import { screenToCourt } from './court-layout.js';

export function resolveShotAim(request, selectedAim) {
  return request.aimExplicit ? request.aim : selectedAim;
}

export function toWorldInput(input, side, selectedAim = 0) {
  return { ...screenToCourt(input, side), aim: (input.aim ?? selectedAim) * (side === 0 ? 1 : -1) };
}
