// Shared presentation rules for the crowd's audible and visible reactions.
export function isExcitingPoint(state) {
  const end = state?.rallyEnd;
  return !!end && end.kind === 'in' && (end.winner === 0 || end.winner === 1) &&
    end.winner === end.hitSide && (state.lastShot === 'smash' || state.rally >= 8);
}
