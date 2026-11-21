export function canChangeHand(state, slot) {
  const player = state.players[slot];
  if (!player || player.pendingShot || (player.action && player.action.endsAt > state.time)) return false;
  if (state.training) return ['rest', 'ready'].includes(state.training.stage);
  return ['serve', 'point', 'intermission', 'over'].includes(state.phase);
}

export function applyHandPreference(state, slot, hand) {
  if ((hand === 'left' || hand === 'right') && canChangeHand(state, slot)) {
    state.players[slot].hand = hand;
  }
}
