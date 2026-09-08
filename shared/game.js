import { contactQuality, contactDrift } from './shot-quality.js';

/** Shared, serializable rules. Coordinates are metres; side 0 plays at positive z. */
export const COURT = Object.freeze({ halfWidth: 2.59, halfLength: 6.7, netHeight: 1.52 });
export const ROLES = Object.freeze({
  balanced: Object.freeze({ label: '均衡', speed: 4.6, power: 1, maxStamina: 100, recovery: 11 }),
  swift: Object.freeze({ label: '灵巧', speed: 5.2, power: 0.92, maxStamina: 92, recovery: 12 }),
  power: Object.freeze({ label: '力量', speed: 4.15, power: 1.16, maxStamina: 110, recovery: 9.5 }),
});

const TUNING = {
  gravity: 9.81, playerMargin: 0.16, netMargin: 0.54,
  acceleration: 23, braking: 28, runCost: 8.5,
  reach: 1.45, minHitHeight: 0.28, maxHitHeight: 3.25,
  smashHeight: 1.65, shotBuffer: 0.44, swingTime: 0.42,
  pointWait: 1.4, pauseLimit: 30, resumeCountdown: 2,
};
const SHOTS = new Set(['clear', 'drop', 'smash']);
const AI = {
  easy: { reaction: 0.22, error: 1.45, pace: 0.85 },
  medium: { reaction: 0.13, error: 0.28, pace: 0.94 },
  hard: { reaction: 0.065, error: 0.12, pace: 1 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const direction = side => side === 0 ? 1 : -1;
const roleOf = role => Object.hasOwn(ROLES, role) ? role : 'balanced';
const difficultyOf = value => value === 'normal' ? 'medium' : Object.hasOwn(AI, value) ? value : 'easy';
const shotName = shot => ({ clear: '高远球', drop: '吊球', smash: '杀球' })[shot];
function random(state) {
  state._rng = (Math.imul(state._rng, 1664525) + 1013904223) >>> 0;
  return state._rng / 4294967296;
}
function inputOf(input) {
  const source = input || {};
  let x = finite(source.x), z = finite(source.z);
  const length = Math.hypot(x, z);
  if (length > 1) { x /= length; z /= length; }
  return { x, z, shot: SHOTS.has(source.shot) ? source.shot : null, prepare: SHOTS.has(source.prepare) ? source.prepare : null,
    aim: clamp(finite(source.aim), -1, 1), aimDepth: clamp(finite(source.aimDepth), -1, 1), charge: clamp(finite(source.charge), 0, 1) };
}

export function createMatch({ target = 5, roles = ['balanced', 'balanced'], difficulty = 'easy', seed = 1, ruleset = 'quick' } = {}) {
  ruleset = ruleset === 'standard21' ? 'standard21' : 'quick';
  const state = {
    phase: 'serve', time: 0, timer: 0, target: ruleset === 'standard21' ? 21 : [5, 11, 21].includes(target) ? target : 5,
    ruleset, games: [0, 0], gameNumber: 1, gameScores: [],
    sideChange: { id: 0, at: 0, reason: null, ends: [1, -1] }, _deciderChanged: false,
    score: [0, 0], server: 0, winner: null, endReason: null, message: '你来发球 · 点击任意击球键',
    rally: 0, hitId: 0, pointId: 0, rallyEnd: null, lastShot: 'clear', lastShotInfo: null, difficulty: difficultyOf(difficulty),
    players: [0, 1].map(side => {
      const role = roleOf(roles?.[side]);
      return { x: 0, z: direction(side) * 3.8, vx: 0, vz: 0, role,
        stamina: ROLES[role].maxStamina, swing: 0, lastShot: 'clear', cooldown: 0, pendingShot: null, action: null, actionId: 0 };
    }),
    shuttle: { x: 0, y: 1.1, z: 3.4, vx: 0, vy: 0, vz: 0, active: false, lastHit: null },
    pause: { by: null, remaining: TUNING.pauseLimit, used: [0, 0], previousPhase: null },
    _rng: (finite(seed, 1) >>> 0) || 1, _serveAge: 0, _savedTimer: 0,
    _ai: [null, null], service: null,
  };
  startServe(state);
  return state;
}

function attachServe(state) {
  const player = state.players[state.server];
  Object.assign(state.shuttle, { x: player.x, y: 1.08,
    z: player.z - direction(state.server) * 0.32, vx: 0, vy: 0, vz: 0,
    active: false, lastHit: null });
}
function startServe(state) {
  state.phase = 'serve'; state.timer = 0; state.rally = 0; state._serveAge = 0;
  state.rallyEnd = null;
  state.message = `${state.server === 0 ? '近场' : '远场'}发球 · 点击击球键`;
  const sign = direction(state.server) * (state.score[state.server] % 2 ? -1 : 1);
  state.service = { side: state.server, court: state.score[state.server] % 2 ? 'left' : 'right',
    sourceSign: sign, active: false,
    targetBox: { minX: sign > 0 ? -COURT.halfWidth : 0, maxX: sign > 0 ? 0 : COURT.halfWidth,
      minZ: state.server === 0 ? -COURT.halfLength : 1.98, maxZ: state.server === 0 ? -1.98 : COURT.halfLength } };
  for (let side = 0; side < 2; side++) {
    Object.assign(state.players[side], { x: (side === state.server ? sign : -sign) * 0.85,
      z: direction(side) * 3.8, vx: 0, vz: 0,
      swing: 0, cooldown: 0, pendingShot: null, action: null });
  }
  attachServe(state);
}

export function finishMatch(state, winner, reason = '本局结束', endReason = 'interrupted') {
  if (state.phase === 'over') return state;
  state.phase = 'over'; state.winner = winner === 0 || winner === 1 ? winner : null;
  state.endReason = endReason; state.message = reason; state.timer = 0; state.shuttle.active = false;
  for (const player of state.players) {
    player.vx = 0; player.vz = 0; player.pendingShot = null;
    if (player.action?.stage === 'prepare' || player.action?.stage === 'windup') player.action = null;
  }
  return state;
}
function awardPoint(state, winner, reason, impact) {
  if (state.phase !== 'rally') return;
  state.score[winner]++; state.pointId++; state.server = winner;
  state.rallyEnd = { id: state.pointId, ...impact, winner, duration: TUNING.pointWait };
  state.shuttle.active = false; state.timer = TUNING.pointWait;
  state.message = `${reason} · ${winner === 0 ? '近场' : '远场'}得分`;
  for (const player of state.players) {
    player.pendingShot = null; player.vx = 0; player.vz = 0;
    if (player.action?.stage === 'prepare' || player.action?.stage === 'windup') player.action = null;
  }
  // Scoring snapshot: BWF Laws, 26 April 2025, sections 7 and 8. Court coordinates
  // stay player-relative after changing physical ends; breaks are shortened for play.
  const wonGame = state.score[winner] >= state.target && (state.ruleset !== 'standard21'
    || state.score[winner] - state.score[1 - winner] >= 2 || state.score[winner] === 30);
  if (wonGame && state.ruleset === 'standard21') {
    state.games[winner]++; state.gameScores.push([...state.score]);
    if (state.games[winner] >= 2) finishMatch(state, winner, `${winner === 0 ? '近场' : '远场'}获胜 · 局数 ${state.games[0]} : ${state.games[1]}`, 'scored');
    else {
      state.phase = 'intermission'; state.timer = 4;
      changeEnds(state, '局间换边');
      state.message = `本局 ${state.score[0]} : ${state.score[1]} · 局间休息，4 秒后换边继续`;
    }
  } else if (wonGame) finishMatch(state, winner, `${winner === 0 ? '近场' : '远场'}获胜 · ${state.score[0]} : ${state.score[1]}`, 'scored');
  else {
    state.phase = 'point';
    if (state.ruleset === 'standard21' && state.gameNumber === 3 && !state._deciderChanged && state.score[winner] === 11) {
      state._deciderChanged = true; changeEnds(state, '决胜局 11 分换边');
      state.message += ' · 决胜局换边';
    }
  }
}

function changeEnds(state, reason) {
  state.sideChange = { id: state.sideChange.id + 1, at: state.time, reason, ends: state.sideChange.ends.map(end => -end) };
}

export function pauseMatch(state, side) {
  if ((side !== 0 && side !== 1) || !['serve', 'rally', 'point', 'intermission'].includes(state.phase) || state.pause.used[side] >= 1) return false;
  state.pause.by = side; state.pause.previousPhase = state.phase;
  state.pause.remaining = TUNING.pauseLimit; state.pause.used[side]++;
  state._savedTimer = state.timer; state.phase = 'paused'; state.timer = TUNING.pauseLimit;
  state.message = '比赛暂停 · 30 秒后按当前比分结算';
  for (const player of state.players) {
    player.pendingShot = null;
    if (player.action?.stage === 'prepare' || player.action?.stage === 'windup') player.action = null;
  }
  return true;
}
export function resumeMatch(state) {
  if (state.phase !== 'paused') return false;
  state.phase = 'countdown'; state.timer = TUNING.resumeCountdown;
  state.message = '准备继续';
  return true;
}

function movePlayer(player, input, side, dt) {
  const role = ROLES[player.role];
  const effort = Math.hypot(input.x, input.z);
  const fatigue = 0.65 + 0.35 * clamp(player.stamina / (role.maxStamina * 0.4), 0, 1);
  const targetX = input.x * role.speed * fatigue, targetZ = input.z * role.speed * fatigue;
  const dx = targetX - player.vx, dz = targetZ - player.vz, difference = Math.hypot(dx, dz);
  const change = Math.min(1, (effort > 0.01 ? TUNING.acceleration : TUNING.braking) * dt / (difference || 1));
  player.vx += dx * change; player.vz += dz * change;
  const nextX = player.x + player.vx * dt, nextZ = player.z + player.vz * dt;
  player.x = clamp(nextX, -COURT.halfWidth + TUNING.playerMargin, COURT.halfWidth - TUNING.playerMargin);
  player.z = direction(side) * clamp(nextZ * direction(side), TUNING.netMargin, COURT.halfLength - TUNING.playerMargin);
  if (nextX !== player.x) player.vx = 0;
  if (nextZ !== player.z) player.vz = 0;
  const moving = Math.hypot(player.vx, player.vz) / role.speed;
  const recovery = effort > 0.15 ? role.recovery * 0.1 : role.recovery;
  player.stamina = clamp(player.stamina + (recovery - TUNING.runCost * moving) * dt, 0, role.maxStamina);
}

function flightPoint(ball, time) {
  return { x: ball.x + ball.vx * time, y: ball.y + ball.vy * time - TUNING.gravity * time * time / 2,
    z: ball.z + ball.vz * time, time };
}
function serviceFault(state, point) {
  if (!state.service?.active || state.shuttle.lastHit !== state.service.side) return false;
  const box = state.service.targetBox;
  return point.x < box.minX || point.x > box.maxX || point.z < box.minZ || point.z > box.maxZ;
}

/** Exact first flight-ending event, seconds from now; does not mutate state. */
export function predictLanding(state) {
  const ball = state.shuttle;
  if (!ball?.active || ball.lastHit === null) return null;
  const disc = ball.vy * ball.vy + 2 * TUNING.gravity * Math.max(0, ball.y);
  const time = Math.max(0, (ball.vy + Math.sqrt(disc)) / TUNING.gravity);
  const netTime = ball.vz ? -ball.z / ball.vz : -1;
  if (netTime > 0 && netTime <= time) {
    const net = flightPoint(ball, netTime);
    if (net.y <= COURT.netHeight) return { ...net, z: 0, y: Math.max(0, net.y),
      event: 'net', out: false, side: null, winner: 1 - ball.lastHit };
  }
  const point = { ...flightPoint(ball, time), y: 0 };
  const out = Math.abs(point.x) > COURT.halfWidth || Math.abs(point.z) > COURT.halfLength;
  const fault = serviceFault(state, point), side = point.z >= 0 ? 0 : 1;
  return { ...point, event: 'landing', out, serviceFault: fault, side, winner: out || fault ? 1 - ball.lastHit : 1 - side };
}

function minimumNetDuration(ball, z, margin) {
  const f = Math.abs(ball.z) / Math.abs(z - ball.z);
  if (!(f > 0 && f < 1)) return 0;
  return Math.sqrt(Math.max(0, 2 * (COURT.netHeight + margin - ball.y * (1 - f)) / (TUNING.gravity * f * (1 - f))));
}

function shotDepth(type, charge, aimDepth, serving) {
  const normal = serving ? (type === 'drop' ? 2.35 + charge * 0.4 : 5.65 + charge * 0.5)
    : type === 'drop' ? 1.35 + charge * 0.25 : type === 'smash' ? 4.45 + charge * 0.5 : 5.45 + charge * 0.55;
  const [near, deep] = serving ? (type === 'drop' ? [2.1, 3.7] : [3.5, 6.35])
    : type === 'drop' ? [0.7, 3] : type === 'smash' ? [1.8, 6.2] : [3.5, 6.25];
  // Depth is relative to the opponent's court for either player. Neutral retains
  // each shot's original length; dragging adjusts within its tactical range.
  return aimDepth < 0 ? normal * (1 + aimDepth) - near * aimDepth : normal * (1 - aimDepth) + deep * aimDepth;
}

/** Preview uses exactly the same target and launch solution as actual contact. */
export function getShotTarget(state, side, request = {}) {
  if (side !== 0 && side !== 1) return null;
  const input = inputOf(request), ball = state.shuttle, player = state.players[side], role = ROLES[player.role];
  const serving = state.phase === 'serve' && state.server === side;
  const requested = input.shot || input.prepare || 'clear';
  const type = requested === 'smash' && serving ? 'clear' : requested;
  const fallbackReason = type !== requested ? '发球采用合法下手高远球' : '';
  let aimX = input.aim * (COURT.halfWidth - 0.3);
  const aimZ = -direction(side) * shotDepth(type, input.charge, input.aimDepth, serving);
  if (serving) {
    const sign = direction(side) * (state.score[side] % 2 ? -1 : 1);
    aimX = -sign * 0.85 + input.aim * 0.55;
  }
  const quality = contactQuality({player, ball, role, ...input, shot: type, serving});
  const drift = contactDrift({quality, player, ball, role, aimX, aimDepth: input.aimDepth, side, shot: type, charge: input.charge});
  const distance = Math.hypot(aimX - ball.x, aimZ - ball.z);
  const minDuration = minimumNetDuration(ball, aimZ, type === 'smash' ? 0.12 : type === 'drop' ? 0.18 : 0.28);
  let duration = type === 'clear' ? 1.55 + distance * 0.035 : type === 'drop' ? 0.85 + distance * 0.02 : (0.49 + distance * 0.012) / role.power / (1 + input.charge * 0.12);
  if (type === 'smash') {
    const downwardLimit = Math.sqrt(2 * Math.max(0.01, ball.y) / TUNING.gravity) * 0.998;
    // A deliberately shallow/low smash remains a downward attack. When there is
    // no feasible net-clearance interval the normal net collision decides it.
    duration = Math.min(Math.max(duration, minDuration), downwardLimit);
  } else duration = Math.max(duration, minDuration);
  const vx = (aimX + drift.x - ball.x) / duration, vz = (aimZ + drift.z - ball.z) / duration;
  const vy = (TUNING.gravity * duration * duration / 2 - ball.y) / duration - drift.verticalLoss;
  duration = (vy + Math.sqrt(vy * vy + 2 * TUNING.gravity * Math.max(0, ball.y))) / TUNING.gravity;
  const x = quality.risk === 0 ? aimX : ball.x + vx * duration;
  const z = quality.risk === 0 ? aimZ : ball.z + vz * duration;
  const netTime = vz ? -ball.z / vz : 0;
  const netHeight = ball.y + vy * netTime - TUNING.gravity * netTime * netTime / 2;
  const smashViable = type === 'smash' && !serving && ball.y >= TUNING.smashHeight
    && player.stamina >= 18 * (1 + input.charge * 0.25) && netHeight > COURT.netHeight + 0.02;
  if (!serving && netHeight <= COURT.netHeight) {
    quality.risk = Math.max(quality.risk, 0.8); quality.score = 1 - quality.risk;
    quality.reason = type === 'smash' ? `下压角度或触点不利，存在下网风险 · ${quality.reason}` : `击球不稳，存在下网风险 · ${quality.reason}`;
  }
  quality.spread = Math.max(quality.spread, Math.hypot(x - aimX, z - aimZ));
  return { x, y: 0, z, aimX, aimZ, quality, type, requested, fallbackReason, duration, vx, vy, vz,
    netHeight, smashViable, serving };
}

/** The same eligibility gate used for real contact, never a future promise. */
export function getShotAvailability(state, side, request = {}) {
  const player = state.players?.[side], ball = state.shuttle;
  if (!player || (side !== 0 && side !== 1)) return { canHit: false, canClear: false, canDrop: false, canSmash: false, reason: '无效球员', reasonCode: 'invalid' };
  const serving = state.phase === 'serve' && state.server === side;
  const distance = Math.hypot(ball.x - player.x, ball.z - player.z);
  let reason = '', reasonCode = '';
  if (!(state.phase === 'rally' && ball.active) && !serving) { reason = '等待对方发球或比赛继续'; reasonCode = 'inactive'; }
  else if (!serving && ball.lastHit !== 1 - side) { reason = '等待对手回球'; reasonCode = 'turn'; }
  else if (!serving && ball.z * direction(side) <= 0.07) { reason = '来球尚未进入己方半场'; reasonCode = 'half'; }
  else if (player.cooldown > 0) { reason = '挥拍恢复中'; reasonCode = 'cooldown'; }
  else if (!serving && distance > TUNING.reach) { reason = '靠近来球后击球'; reasonCode = 'reach'; }
  else if (!serving && (ball.y < TUNING.minHitHeight || ball.y > TUNING.maxHitHeight)) { reason = ball.y > TUNING.maxHitHeight ? '等待来球下降' : '来球过低'; reasonCode = 'height'; }
  const canHit = !reasonCode;
  const smash = getShotTarget(state, side, { ...request, shot: 'smash' });
  const canSmash = canHit && smash.smashViable;
  if (canHit) reason = canSmash ? '可击球 · 可以下压杀球' : serving ? '右手低位发球，落向对角发球区' : smash.quality.reason;
  return { canHit, canClear: canHit, canDrop: canHit, canSmash, reason, reasonCode,
    distance, reach: TUNING.reach, minHeight: TUNING.minHitHeight, maxHeight: TUNING.maxHitHeight,
    smashMinHeight: TUNING.smashHeight, cooldown: player.cooldown, stamina: player.stamina, serving };
}

export function getInterceptAdvice(state, side, request = {}) {
  const available = getShotAvailability(state, side, request), landing = predictLanding(state);
  const base = { canHit: available.canHit, canSmash: available.canSmash, futureCanSmash: false, landing, point: null, reason: available.reason };
  if (available.canHit) return { ...base, status: 'ready', point: { x: state.shuttle.x, y: state.shuttle.y, z: state.shuttle.z, time: 0 } };
  if (!landing || state.phase !== 'rally' || state.shuttle.lastHit === side || !state.players[side]) return { ...base, status: 'inactive' };
  if (landing.event === 'net' || landing.out || landing.serviceFault) return { ...base, status: 'out', reason: landing.event === 'net' ? '来球将触网' : '预计出界，可观察落点' };
  const player = state.players[side], role = ROLES[player.role];
  const fatigue = 0.65 + 0.35 * clamp(player.stamina / (role.maxStamina * 0.4), 0, 1);
  let nearest = null;
  for (let time = 0.035; time < landing.time; time += 0.035) {
    const point = flightPoint(state.shuttle, time);
    if (point.z * direction(side) <= 0.07 || point.y < TUNING.minHitHeight || point.y > TUNING.maxHitHeight) continue;
    const x = clamp(point.x, -COURT.halfWidth + TUNING.playerMargin, COURT.halfWidth - TUNING.playerMargin);
    const z = direction(side) * clamp(point.z * direction(side), TUNING.netMargin, COURT.halfLength - TUNING.playerMargin);
    const travel = Math.hypot(x - player.x, z - player.z);
    nearest = point;
    if (player.cooldown <= time && travel <= TUNING.reach + role.speed * fatigue * Math.max(0, time - 0.06)) {
      const players = [...state.players];
      players[side] = { ...player, x, z, cooldown: 0 };
      const futureState = { ...state, players, shuttle: { ...state.shuttle, ...point,
        vy: state.shuttle.vy - TUNING.gravity * time } };
      const futureCanSmash = getShotAvailability(futureState, side, request).canSmash;
      return { ...base, status: 'approach', point, futureCanSmash, reason: '移动到接球圈，等来球进入可击范围' };
    }
  }
  return { ...base, status: 'unreachable', point: nearest, reason: '距离较远，尽快跑位' };
}

function playShot(state, side, request, serving = false) {
  const player = state.players[side], ball = state.shuttle;
  const target = getShotTarget(state, side, request), type = target.type;
  const contact = { x: ball.x, y: ball.y, z: ball.z };
  ball.vx = target.vx; ball.vy = target.vy; ball.vz = target.vz;
  ball.active = true; ball.lastHit = side;
  if (state.service) state.service.active = serving;
  player.stamina = Math.max(0, player.stamina - ({ clear: 4, drop: 6, smash: 18 })[type] * (1 + request.charge * 0.25));
  player.swing = TUNING.swingTime; player.cooldown = TUNING.swingTime;
  player.pendingShot = null; player.lastShot = type;
  if (player.action) Object.assign(player.action, { type, stage: 'contact', contact, quality: target.quality,
    contactAt: state.time, endsAt: state.time + TUNING.swingTime });
  state.phase = 'rally'; state.hitId++; state.rally++; state.lastShot = type;
  state.lastShotInfo = {hitId: state.hitId, side, at: state.time, type, requested: target.requested,
    aimX: target.aimX, aimZ: target.aimZ, x: target.x, z: target.z, quality: target.quality};
  state.message = target.fallbackReason || `${shotName(type)} · ${state.rally} 拍${target.quality.risk >= 0.16 ? ` · ${target.quality.reason}` : ''}`;
}

function integrateShuttle(state, dt) {
  const ball = state.shuttle, event = predictLanding(state);
  if (event && event.time <= dt + 1e-9) {
    // stepLive has already advanced time by dt; retain the exact collision instant
    // and incoming velocity for rendering after the authoritative rally ends.
    const impact = {
      kind: event.event === 'net' ? 'net' : event.serviceFault ? 'serviceFault' : event.out ? 'out' : 'in',
      at: state.time - dt + event.time,
      x: event.x, y: event.y, z: event.z,
      vx: ball.vx, vy: ball.vy - TUNING.gravity * event.time, vz: ball.vz,
      hitSide: ball.lastHit, hitId: state.hitId,
    };
    Object.assign(ball, { x: event.x, y: event.y, z: event.z, vy: ball.vy - TUNING.gravity * event.time });
    awardPoint(state, event.winner, event.event === 'net' ? '未过网' : event.serviceFault ? '发球未落入对角发球区' : event.out ? '出界' : '落地', impact);
    return;
  }
  const point = flightPoint(ball, dt);
  Object.assign(ball, { x: point.x, y: point.y, z: point.z, vy: ball.vy - TUNING.gravity * dt });
}

function actionFor(state, side, request, stage, lead) {
  const player = state.players[side], ball = state.shuttle;
  const contact = state.phase === 'serve' ? { x: ball.x, y: ball.y, z: ball.z } : flightPoint(ball, lead);
  const type = request.shot || request.prepare || 'clear';
  const dx = contact.x - player.x, dz = contact.z - player.z;
  const reachScale = Math.min(0.62, Math.max(0, (Math.hypot(dx, dz) - 0.45) / (Math.hypot(dx, dz) || 1)));
  return { id: ++player.actionId, type, stage, startedAt: state.time,
    contactAt: state.time + lead, endsAt: state.time + lead + TUNING.swingTime,
    contact: { x: contact.x, y: contact.y, z: contact.z }, origin: { x: player.x, z: player.z },
    jumpHeight: type === 'smash' ? clamp((contact.y - 2.35) * 0.65, 0, 0.65) : 0,
    reach: { x: dx * reachScale, z: dz * reachScale }, serving: state.phase === 'serve' };
}

function updateAction(state, player) {
  const action = player.action;
  if (!action || action.stage === 'prepare' || action.stage === 'windup') return;
  const after = state.time - action.contactAt;
  if (state.time >= action.endsAt) player.action = null;
  else action.stage = after < 0.045 ? 'contact' : after < 0.18 ? 'followthrough' : 'recovery';
}

function attemptShot(state, side) {
  const player = state.players[side], pending = player.pendingShot;
  if (!pending) return;
  const available = getShotAvailability(state, side, pending);
  if (pending.contactAt !== undefined) {
    if (state.time + 1e-8 >= pending.contactAt) {
      if (available.canHit) playShot(state, side, pending, state.phase === 'serve');
      else { delete pending.contactAt; player.action = null; }
    }
    return;
  }
  let lead = pending.shot === 'smash' && state.shuttle.y > 2.7 ? 0.14 : 0.055;
  if (state.phase === 'rally') {
    const ball = state.shuttle;
    const untilLow = (ball.vy + Math.sqrt(Math.max(0, ball.vy * ball.vy + 2 * TUNING.gravity * (ball.y - TUNING.minHitHeight)))) / TUNING.gravity;
    lead = Math.min(lead, Math.max(0.006, untilLow * 0.45));
    // Windup may start just before entry into reach/height, but real contact must
    // still pass the live eligibility gate. This allows a jump before a fast ball.
    for (let tries = 0; tries < 4; tries++) {
      const point = flightPoint(ball, lead);
      const predicted = { ...state, shuttle: { ...ball, ...point, vy: ball.vy - TUNING.gravity * lead } };
      const future = getShotAvailability(predicted, side, pending);
      if (!available.canHit && !future.canHit) return;
      if (future.canHit && (pending.shot !== 'smash' || !available.canSmash || future.canSmash)) break;
      lead *= 0.5;
    }
  } else if (!available.canHit) return;
  player.action = actionFor(state, side, pending, 'windup', lead);
  pending.contactAt = player.action.contactAt;
  pending.remaining = Math.max(pending.remaining, lead + 0.035);
}

function stepLive(state, inputs, dt, firstSlice) {
  state.time += dt;
  for (let side = 0; side < 2; side++) {
    const player = state.players[side];
    player.swing = Math.max(0, player.swing - dt);
    player.cooldown = Math.max(0, player.cooldown - dt);
    updateAction(state, player);
    if (player.pendingShot) {
      player.pendingShot.remaining -= dt;
      if (player.pendingShot.remaining <= 0) {
        if (player.pendingShot.shot === 'smash' && state.phase === 'rally' && state.shuttle.lastHit !== side) {
          state.message = '未接到球 · 先跑位，等球下降再击球';
        }
        player.pendingShot = null;
        if (player.action?.stage === 'windup') player.action = null;
      }
    }
    if (state.phase === 'serve' || state.phase === 'rally') {
      if (state.phase === 'serve' && state.players[state.server].pendingShot?.contactAt !== undefined) {
        player.vx = 0; player.vz = 0;
      } else movePlayer(player, inputs[side], side, dt);
      if (state.phase === 'serve') {
        const sign = state.service.sourceSign * (side === state.server ? 1 : -1);
        player.x = sign * clamp(player.x * sign, 0.22, COURT.halfWidth - TUNING.playerMargin);
        player.z = direction(side) * clamp(player.z * direction(side), 2.3, COURT.halfLength - TUNING.playerMargin);
      }
      if (firstSlice && inputs[side].shot && player.pendingShot?.contactAt === undefined) player.pendingShot = { ...inputs[side], remaining: TUNING.shotBuffer };
      if (inputs[side].prepare && !player.pendingShot && player.cooldown <= 0) {
        const startedAt = player.action?.stage === 'prepare' ? player.action.startedAt : state.time;
        const id = player.action?.stage === 'prepare' ? player.action.id : null;
        player.action = actionFor(state, side, inputs[side], 'prepare', 0.18);
        player.action.startedAt = startedAt;
        if (id !== null) { player.action.id = id; player.actionId--; }
      } else if (!inputs[side].prepare && player.action?.stage === 'prepare' && !player.pendingShot) player.action = null;
    } else player.stamina = Math.min(ROLES[player.role].maxStamina, player.stamina + ROLES[player.role].recovery * dt);
  }
  if (state.phase === 'point' || state.phase === 'intermission') {
    state.timer = Math.max(0, state.timer - dt);
    if (state.timer <= 0.00001) {
      if (state.phase === 'intermission') { state.score = [0, 0]; state.gameNumber++; }
      startServe(state);
    }
    return;
  }
  if (state.phase === 'serve') {
    state._serveAge += dt; attachServe(state);
    attemptShot(state, state.server);
    return;
  }
  // Test both ends of each short physics slice so a moving shuttle cannot
  // tunnel through a valid, buffered racket contact.
  for (let side = 0; side < 2; side++) {
    attemptShot(state, side);
  }
  integrateShuttle(state, dt);
  if (state.phase === 'rally') for (let side = 0; side < 2; side++) {
    attemptShot(state, side);
  }
}

export function stepMatch(state, inputs = [{}, {}], dt = 1 / 60) {
  dt = Math.max(0, finite(dt));
  if (dt === 0 || state.phase === 'over') return state;
  if (state.phase === 'paused') {
    state.pause.remaining = Math.max(0, state.pause.remaining - dt); state.timer = state.pause.remaining;
    if (state.pause.remaining <= 0.00001) {
      const winner = state.score[0] === state.score[1] ? null : state.score[0] > state.score[1] ? 0 : 1;
      finishMatch(state, winner, `暂停超时 · ${winner === null ? '平分，本局不计胜负' : `${winner === 0 ? '近场' : '远场'}领先获胜`}`, 'pause-timeout');
    }
    return state;
  }
  if (state.phase === 'countdown') {
    state.timer = Math.max(0, state.timer - dt);
    if (state.timer <= 0.00001) {
      state.phase = state.pause.previousPhase || 'serve'; state.timer = state._savedTimer;
      state.message = state.phase === 'serve' ? '比赛继续 · 点击击球键发球' : '比赛继续';
    }
    return state;
  }
  const normalized = [inputOf(inputs?.[0]), inputOf(inputs?.[1])];
  // A stalled tab must not leap through a full rally when it wakes up.
  let remaining = Math.min(dt, 0.25), firstSlice = true;
  while (remaining > 0.000001 && state.phase !== 'over') {
    const slice = Math.min(remaining, 1 / 120);
    stepLive(state, normalized, slice, firstSlice);
    firstSlice = false; remaining -= slice;
  }
  return state;
}

function moveToward(player, x, z, pace) {
  const dx = x - player.x, dz = z - player.z, distance = Math.hypot(dx, dz);
  const speed = Math.min(pace, distance * 2.2);
  return distance < 0.07 ? { x: 0, z: 0 } : { x: dx / distance * speed, z: dz / distance * speed };
}

function chooseAIShot(state, side, level) {
  const roll = random(state), lineRoll = random(state) * 2 - 1;
  if (level === 'easy') return { shot: roll < 0.78 ? 'clear' : roll < 0.95 ? 'drop' : 'smash', aim: lineRoll * 0.36 };
  if (level === 'medium') return { shot: roll < 0.4 ? 'clear' : roll < 0.72 ? 'drop' : 'smash', aim: lineRoll * 0.95 };
  const opponent = state.players[1 - side], ball = state.shuttle;
  const openSide = Math.abs(opponent.x) > 0.25 ? -Math.sign(opponent.x) : Math.sign(lineRoll) || 1;
  const aim = openSide * (0.74 + Math.abs(lineRoll) * 0.2);
  // Attack front/back space, but keep a random alternative to avoid a rigid
  // perfect counter. A smash also requires a future high contact on our side.
  if (Math.abs(opponent.z) > 4.25 && roll < 0.83) return { shot: 'drop', aim };
  if (Math.abs(opponent.z) < 2.7 && roll < 0.83) return { shot: 'clear', aim };
  const bestHeight = Math.min(3.05, ball.y + Math.max(0, ball.vy) ** 2 / (2 * TUNING.gravity));
  const discriminant = ball.vy * ball.vy + 2 * TUNING.gravity * (ball.y - bestHeight);
  const contactTime = discriminant >= 0 ? (ball.vy + Math.sqrt(discriminant)) / TUNING.gravity : -1;
  const contactDepth = (ball.z + ball.vz * contactTime) * direction(side);
  const highChance = contactTime >= 0 && contactDepth > 0.5 && contactDepth < 6.4 && state.players[side].stamina >= 18;
  return { shot: highChance && roll < 0.72 ? 'smash' : roll < 0.86 ? 'clear' : 'drop', aim };
}

export function aiInput(state, side, difficulty = 'easy') {
  if ((side !== 0 && side !== 1) || !['serve', 'rally'].includes(state.phase)) return { x: 0, z: 0, shot: null, aim: 0, charge: 0 };
  const level = difficultyOf(difficulty), config = AI[level], player = state.players[side], ball = state.shuttle;
  const output = { x: 0, z: 0, shot: null, aim: 0, charge: 0.3 };
  if (state.phase === 'serve') {
    if (state.server === side && state._serveAge > 0.6 + config.reaction) {
      output.shot = 'clear'; output.aim = (random(state) - 0.5) * (level === 'easy' ? 0.6 : 1.5);
    }
    return output;
  }
  if (ball.lastHit === side) return { ...output, ...moveToward(player, ball.x * 0.15, direction(side) * 3.55, config.pace * 0.72) };
  let memory = state._ai[side];
  if (!memory || memory.hitId !== state.hitId) {
    const decision = chooseAIShot(state, side, level);
    // Reaction delay and spatial prediction error remain difficulty-dependent.
    // Every reachable return is attempted; the common contact model causes errors.
    memory = state._ai[side] = { hitId: state.hitId, ready: state.time + config.reaction,
      errorX: (random(state) - 0.5) * config.error * 2, errorZ: (random(state) - 0.5) * config.error * 2,
      shot: decision.shot, aim: decision.aim };
  }
  if (state.time < memory.ready) return output;
  const contactHeight = memory.shot === 'smash' ? Math.min(3.05, ball.y + Math.max(0, ball.vy) ** 2 / (2 * TUNING.gravity)) : 1.2;
  const discriminant = ball.vy * ball.vy + 2 * TUNING.gravity * (ball.y - contactHeight);
  const contactTime = discriminant > 0 ? Math.max(0, (ball.vy + Math.sqrt(discriminant)) / TUNING.gravity) : 0;
  const targetX = clamp(ball.x + ball.vx * contactTime + memory.errorX, -COURT.halfWidth + 0.15, COURT.halfWidth - 0.15);
  const targetZ = direction(side) * clamp((ball.z + ball.vz * contactTime) * direction(side) + memory.errorZ, 0.7, COURT.halfLength - 0.25);
  Object.assign(output, moveToward(player, targetX, targetZ, config.pace));
  const horizontal = Math.hypot(ball.x - player.x, ball.z - player.z);
  if (memory.shot === 'smash' && contactTime < 0.4) output.prepare = 'smash';
  if (ball.z * direction(side) > 0.1 && ball.vy < 1.5 && horizontal < TUNING.reach + 0.15
    && ball.y <= (memory.shot === 'smash' ? 4.35 : 1.9)) {
    output.shot = memory.shot; output.aim = memory.aim;
  }
  return output;
}
