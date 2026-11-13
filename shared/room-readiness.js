export function confirmsRoomRules(message, room) {
  return message.type === 'ready' && message.target === room.target && message.ruleset === room.ruleset &&
    message.finale === room.rules.finale && (room.format !== 'doubles' || message.format === 'doubles');
}

export function startRoomCountdown(state) {
  state.phase = 'countdown'; state.timer = 3;
  state.pause.previousPhase = 'serve'; state._savedTimer = 0;
  state.message = state.format === 'doubles' ? '四人已准备 · 即将开打' : '双方已准备 · 即将开打';
}
