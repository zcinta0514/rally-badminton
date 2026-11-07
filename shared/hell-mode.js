import { sampleShuttleFlight } from './shuttle-flight.js';

export const HELL = Object.freeze({ targets: Object.freeze([2, 5]), chargeTime: .45, recovery: 1.05,
  diveTime: .32, diveSpeed: 10, moveScale: 1.12 });

export function createHellChallenge() {
  return { kind: 'hell', bossSide: 1, next: 'phantom', ordinary: 0, warning: null,
    active: null, rescue: null, rescueUsed: false, recoverUntil: 0,
    counts: { phantom: 0, cannon: 0, rescue: 0 } };
}

export function resetHellRally(challenge) {
  challenge.warning = null; challenge.active = null; challenge.rescue = null;
  challenge.rescueUsed = false; challenge.recoverUntil = 0; challenge.ordinary = 0;
}

export function hellStatus(state) {
  const h = state?.challenge;
  if (!h || h.kind !== 'hell') return null;
  if (!['serve', 'rally', 'paused', 'countdown'].includes(state.phase)) return { key: 'idle', title: '地狱挑战', hint: '你得 2 分获胜 · 对手得 5 分获胜' };
  if (h.rescue && !h.rescue.hit) return { key: 'rescue', title: '极限救球', hint: '本回合仅一次 · 准备接慢球再反攻' };
  if (h.warning) return { key: 'charge', title: '重炮蓄力', hint: '线路已锁定 · 提前站位，挡回后反攻' };
  if (h.active?.hitId === state.hitId && state.shuttle.lastHit === h.bossSide) {
    return h.active.kind === 'phantom'
      ? { key: 'phantom', title: '四重幻影', hint: '追踪实线真球 · 虚影过网前消散' }
      : { key: 'cannon', title: '重炮来袭', hint: '稳住回球 · 对手随后回位减速' };
  }
  if (state.time < h.recoverUntil) return { key: 'recovery', title: '破绽出现', hint: '对手恢复中 · 趁机打空当' };
  return { key: 'idle', title: '地狱人机 · 无限体力', hint: '拉开落点 · 识破技能 · 抓住两次机会' };
}

// Presentation only: fake flight points never enter collision, prediction or AI.
export function phantomPositions(state) {
  const h = state?.challenge, fx = h?.active;
  if (fx?.kind !== 'phantom' || fx.hitId !== state.hitId || state.phase !== 'rally' || !state.shuttle.active) return [];
  const age = state.time - fx.at;
  if (age < 0 || age >= fx.fadeAt) return [];
  const point = sampleShuttleFlight(fx.launch, age);
  const spread = Math.sin(Math.min(1, age / fx.fadeAt) * Math.PI / 2);
  const opacity = .48 * Math.min(1, (fx.fadeAt - age) / .16);
  return [-1, 1, 2].map((lane, index) => ({ x: point.x + lane * .62 * spread,
    y: Math.max(.12, point.y + (index - 1) * .22 * spread), z: point.z + (index - 1) * .38 * spread, opacity }));
}
