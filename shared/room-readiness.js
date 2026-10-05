export function confirmsRoomRules(message, room) {
  return message.type === 'ready' && message.target === room.target && message.ruleset === room.ruleset &&
    message.finale === room.rules.finale;
}

export function startRoomCountdown(state) {
  state.phase = 'countdown'; state.timer = 3;
  state.pause.previousPhase = 'serve'; state._savedTimer = 0;
  state.message = '双方已准备 · 即将开打';
}
