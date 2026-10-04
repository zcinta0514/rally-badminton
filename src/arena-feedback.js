import { getScoringRules } from '../shared/game.js';
// Shared presentation rules for the crowd's audible and visible reactions.
export function isExcitingPoint(state) {
  const end = state?.rallyEnd;
  return !!end && end.kind === 'in' && (end.winner === 0 || end.winner === 1) &&
    end.winner === end.hitSide && (state.lastShot === 'smash' || state.rally >= 8);
}

export const REACTION_SECONDS = Object.freeze({ point: .6, highlight: 1.2, game: 2, match: 3 });
export function pointGrade(state) {
  if (!state?.rallyEnd) return null;
  if (Object.hasOwn(REACTION_SECONDS, state.rallyEnd.grade)) return state.rallyEnd.grade;
  if (state.phase === 'over' && state.endReason === 'scored') return 'match';
  if (state.phase === 'intermission') return 'game';
  return isExcitingPoint(state) ? 'highlight' : 'point';
}
export function matchPressure(state) {
  const rule = getScoringRules(state);
  return [0, 1].map(side => {
    const next = state.score[side] + 1;
    const gamePoint = next >= rule.target && (next - state.score[1 - side] >= rule.winBy || next >= rule.cap);
    return !gamePoint ? null : state.ruleset !== 'standard21' || state.games[side] >= 1 ? 'match' : 'game';
  });
}

/** One presentation clock for spectators, including frozen final scores. */
export class ArenaFeedbackClock {
  constructor() { this.reset(); }
  reset() { this.point = null; this.time = null; this.reaction = null; }
  step(state, dt, { enabled = true, hidden = false } = {}) {
    if (!state || !Number.isFinite(state.time)) { this.reset(); return { reaction: null, tension: 0 }; }
    const initial = this.point === null;
    const older = !initial && (state.pointId < this.point || state.time < this.time);
    if (older) { this.reaction = null; return { reaction: null, tension: 0 }; }
    const newPoint = !initial && state.pointId > this.point;
    const span = state.time - this.time;
    this.point = state.pointId; this.time = state.time;
    if (!enabled || hidden || ['serve', 'rally', 'paused', 'countdown'].includes(state.phase)) this.reaction = null;
    else if (newPoint) {
      const at = state.rallyEnd?.at, age = state.time - at;
      const fresh = Number.isFinite(at) ? age >= -.02 && age <= .65 : span > 0 && span <= .25;
      const grade = pointGrade(state);
      this.reaction = fresh && state.rallyEnd?.id === state.pointId && grade
        ? { id: state.pointId, grade, winner: state.rallyEnd.winner, age: 0, duration: REACTION_SECONDS[grade] } : null;
    }
    if (this.reaction) {
      this.reaction.age += Math.max(0, Math.min(.06, Number.isFinite(dt) ? dt : 0));
      if (this.reaction.age >= this.reaction.duration) this.reaction = null;
    }
    const tension = enabled && !hidden && state.phase === 'rally' ? state.rally >= 12 ? 2 : state.rally >= 8 ? 1 : 0 : 0;
    return { reaction: this.reaction, tension };
  }
}
