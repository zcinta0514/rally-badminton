import { separateTeammates, contactOrder, doublesAssignment } from './doubles.js';
import { NET_PHYSICS, resolveNetImpact } from './net-physics.js';
import { HELL, createHellChallenge, resetHellRally } from './hell-mode.js';
import { contactQuality, contactDrift } from './shot-quality.js';
import { SHUTTLE_FLIGHT, VERTICAL_DRAG, verticalLaunch, timeToHeight, flightApex, verticalFlight, sampleShuttleFlight, horizontalLaunch, timeToShuttleZ, horizontalTimeFraction } from './shuttle-flight.js';
import { staminaEffects, movementStaminaRate, shotStaminaCost, STAMINA_TUNING } from './stamina.js';
export { staminaEffects, movementStaminaRate, shotStaminaCost } from './stamina.js';
export const RULES_VERSION = 25;
export const playerTeam = (state, slot) => Number.isInteger(slot) && slot >= 0 && slot < state.players.length ? slot % 2 : null;
const courtWidth = state => state.format === 'doubles' ? 3.05 : 2.59;
const serverSlot = state => state.format === 'doubles' ? state.serverPlayer : state.server;

/** Shared, serializable rules. Coordinates are metres; side 0 plays at positive z. */
export const COURT = Object.freeze({ halfWidth: 2.59, halfLength: 6.7, netHeight: 1.52 });
export const ROLES = Object.freeze({
  balanced: Object.freeze({ label: '均衡', speed: 4.6, acceleration: 1, braking: 1, power: 1,
    maxStamina: 100, recovery: 5.8, reachBonus: 0, runCost: 1, swingTime: 0.42, dropControl: 1,
    fatigue: Object.freeze({ onset: .55, speedFloor: .88, accelerationFloor: .8, controlWeight: .3 }),
    shotSpeed: Object.freeze({ clear: 1, drop: 1, smash: 1 }),
    shotDepth: Object.freeze({ clear: 1, drop: 1, smash: 1 }),
    shotCost: Object.freeze({ serve: 1, clear: 1, drop: 1, smash: 1 }) }),
  swift: Object.freeze({ label: '灵巧', speed: 5.35, acceleration: 1.15, braking: 1.15, power: 0.9,
    maxStamina: 112, recovery: 6.6, reachBonus: 0.1, runCost: .84, swingTime: 0.378, dropControl: 0.8,
    fatigue: Object.freeze({ onset: .45, speedFloor: .90, accelerationFloor: .85, controlWeight: .26 }),
    shotSpeed: Object.freeze({ clear: 1, drop: 1.08, smash: 0.97 }),
    shotDepth: Object.freeze({ clear: 0.97, drop: 0.94, smash: 0.97 }),
    shotCost: Object.freeze({ serve: .9, clear: .95, drop: .8, smash: .95 }) }),
  power: Object.freeze({ label: '力量', speed: 4.05, acceleration: 0.85, braking: 0.85, power: 1.12,
    maxStamina: 92, recovery: 5.2, reachBonus: 0, runCost: 1.05, swingTime: 0.47, dropControl: 1,
    fatigue: Object.freeze({ onset: .6, speedFloor: .85, accelerationFloor: .75, controlWeight: .36 }),
    shotSpeed: Object.freeze({ clear: 1.04, drop: 0.95, smash: 1.08 }),
    shotDepth: Object.freeze({ clear: 1.07, drop: 0.96, smash: 1.06 }),
    shotCost: Object.freeze({ serve: 1, clear: .95, drop: .9, smash: 1.2 }) }),
});

const TUNING = {
  gravity: 9.81, playerMargin: 0.16, netMargin: 0.54,
  acceleration: 12, braking: 18,
  reach: 1.45, minHitHeight: 0.22, maxHitHeight: 3.25,
  smashHeight: 1.65, shotBuffer: 0.54, swingTime: 0.42,
  pointWait: 1.4, pauseLimit: 30, resumeCountdown: 2,
};
const SHOTS = new Set(['clear', 'drop', 'smash']);
const AI = {
  easy: { reaction: 0.40, error: 1.6, pace: 0.80, serveDelay: 0.72 },
  medium: { reaction: 0.17, error: 0.55, pace: 0.93, serveDelay: 0.54 },
  hard: { reaction: 0.065, error: 0.12, pace: 1, serveDelay: 0.42 },
};
const PLAYER_ASSIST = {
  none: { reachBonus: 0, lowHeightBonus: 0, highHeightBonus: 0, inputBuffer: 0 },
  beginner: { reachBonus: 0.17, lowHeightBonus: 0.06, highHeightBonus: 0.1, inputBuffer: 0.1 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const direction = side => side % 2 === 0 ? 1 : -1;
const roleOf = role => Object.hasOwn(ROLES, role) ? role : 'balanced';
const difficultyOf = value => value === 'normal' ? 'medium' : Object.hasOwn(AI, value) ? value : 'easy';
const assistLevelOf = value => Object.hasOwn(PLAYER_ASSIST, value) ? value : 'none';
export const getDifficultyProfile = value => ({ ...AI[difficultyOf(value)] });
export const getPlayerRole = player => player.cup?.role ?? ROLES[player.role];

// Shot weights affect choices only among legal candidates. Depth offsets are metres.
const CUP_TACTICS = {
  '后场重杀': { smash: 1.35, clear: .2, drop: -.35, depth: .24 },
  '快速突击': { smash: .75, clear: -.35, drop: .35, depth: -.12 },
  '拉吊控制': { smash: -.6, clear: .45, drop: .7, depth: 0 },
  '防守反击': { smash: .15, clear: .85, drop: -.15, depth: .38 },
  '抢网变速': { smash: .05, clear: -.3, drop: 1.12, depth: -.4 },
};

function cupPlayer(opponent) {
  const base = ROLES[roleOf(opponent.role)];
  const stat = key => clamp(finite(opponent[key], 65), 0, 100);
  const stature = (clamp(finite(opponent.height, 177), 152, 204) - 177) / 100;
  const control = stat('control');
  const difficulty = AI[difficultyOf(opponent.difficulty)];
  return {
    tactics: CUP_TACTICS[opponent.style], role: { ...base,
      speed: base.speed * (.84 + .24 * stat('speed') / 100),
      power: base.power * (.84 + .28 * stat('power') / 100),
      reachBonus: base.reachBonus + stature * .68,
      dropControl: base.dropControl * (1.2 - .34 * control / 100),
    },
    ai: { ...difficulty, reaction: difficulty.reaction * (1.3 - .46 * control / 100),
      error: difficulty.error * (1.42 - .67 * control / 100) },
  };
}
const shotName = shot => ({ clear: '高远球', drop: '吊球', smash: '杀球' })[shot];
function random(state) {
  state._rng = (Math.imul(state._rng, 1664525) + 1013904223) >>> 0;
  return state._rng / 4294967296;
}
function assistFor(state, side) {
  const level = state?.assist?.side === side ? assistLevelOf(state.assist.level) : 'none';
  return { level, ...PLAYER_ASSIST[level] };
}
function aiHistoryFor(state, side) {
  if (!Array.isArray(state._aiHistory)) state._aiHistory = [[], []];
  if (!Array.isArray(state._aiHistory[side])) state._aiHistory[side] = [];
  return state._aiHistory[side];
}
function inputOf(input) {
  const source = input || {};
  let x = finite(source.x), z = finite(source.z);
  const length = Math.hypot(x, z);
  if (length > 1) { x /= length; z /= length; }
  return { x, z, shot: SHOTS.has(source.shot) ? source.shot : null, prepare: SHOTS.has(source.prepare) ? source.prepare : null,
    aim: clamp(finite(source.aim), -1, 1), aimDepth: clamp(finite(source.aimDepth), -1, 1), charge: clamp(finite(source.charge), 0, 1) };
}

const SCORING_RULES = Object.freeze({
  5: Object.freeze({ target: 5, winBy: 2, cap: 10 }),
  10: Object.freeze({ target: 10, winBy: 2, cap: 15 }),
  11: Object.freeze({ target: 11, winBy: 2, cap: 20 }),
  15: Object.freeze({ target: 15, winBy: 2, cap: 21 }),
  21: Object.freeze({ target: 21, winBy: 2, cap: 30 }),
});

export const CUP_TARGETS = Object.freeze([5, 15, 21]);

export function getCupScoringRules(target) {
  return SCORING_RULES[CUP_TARGETS.includes(target) ? target : 5];
}

/** Shared by scoring and rule hints; target stays fixed throughout deuce. */
export function getScoringRules({ ruleset = 'quick', target = 5, players } = {}) {
  if (players?.[1]?.cup) return getCupScoringRules(target);
  return SCORING_RULES[ruleset === 'standard21' ? 21 : [5, 10, 11, 21].includes(target) ? target : 5];
}

export function createMatch({ target = 5, roles = ['balanced', 'balanced'], difficulty = 'easy', seed = 1, ruleset = 'quick',
  humanSlots = [], playerAssist = 'none', assistSide = 0, netDragSide = null, trainingServer = null, challenge = null, cupOpponent = null, format = 'singles', teammateDifficulty = 'medium' } = {}) {
  ruleset = challenge === 'hell' ? 'quick' : ruleset === 'standard21' ? 'standard21' : 'quick';
  playerAssist = assistLevelOf(playerAssist);
  assistSide = assistSide === 0 || assistSide === 1 ? assistSide : 0;
  const state = {
    rulesVersion: RULES_VERSION, format: format === 'doubles' ? 'doubles' : 'singles', teammateDifficulty: difficultyOf(teammateDifficulty),
    ...([0, 1].includes(trainingServer) ? { trainingServer } : {}),
    serverPlayer: 0, receiverPlayer: 1, servicePositions: [0, 0, 1, 1], _contactTie: 0,
    ...(challenge === 'hell' ? { challenge: createHellChallenge(seed) } : {}),
    ...((netDragSide === 0 || netDragSide === 1) ? { netDragSide } : {}),
    phase: 'serve', time: 0, timer: 0, target,
    ruleset, games: [0, 0], gameNumber: 1, gameScores: [],
    sideChange: { id: 0, at: 0, reason: null, ends: [1, -1] }, _deciderChanged: false,
    score: [0, 0], server: 0, winner: null, endReason: null, message: '你来发球 · 点击任意击球键',
    rally: 0, hitId: 0, pointId: 0, rallyEnd: null, netContactId: 0, netContacts: [], lastShot: 'clear', lastShotInfo: null, difficulty: difficultyOf(difficulty),
    players: (format === 'doubles' ? [0, 1, 2, 3] : [0, 1]).map(side => {
      const cup = side === 1 && format === 'singles' && !challenge && trainingServer === null && cupOpponent
        ? cupPlayer(cupOpponent) : null;
      const role = roleOf(cup ? cupOpponent.role : roles?.[side]);
      return { ...(cup ? { cup } : {}), humanControlled: humanSlots.includes(side), x: 0, z: direction(side) * 3.8, vx: 0, vz: 0, role,
        stamina: ROLES[role].maxStamina, staminaRate: 0, recoveryWait: 0, staminaStatus: 'idle',
        swing: 0, lastShot: 'clear', cooldown: 0, pendingShot: null, action: null, actionId: 0, shotRecovery: null };
    }),
    shuttle: { x: 0, y: 1.1, z: 3.4, vx: 0, vy: 0, vz: 0, active: false, lastHit: null, lastHitPlayer: null },
    pause: { by: null, remaining: TUNING.pauseLimit, used: [0, 0], previousPhase: null },
    _rng: (finite(seed, 1) >>> 0) || 1, _serveAge: 0, _savedTimer: 0,
    assist: { level: playerAssist, side: playerAssist === 'none' ? null : assistSide },
    _ai: [null, null], _aiHistory: [[], []], service: null,
  };
  if (state.players[1].cup) state.ruleset = 'quick';
  state.target = getScoringRules(state).target;
  startServe(state);
  return state;
}

function attachServe(state) {
  const player = state.players[serverSlot(state)];
  Object.assign(state.shuttle, { x: player.x, y: 1.08,
    z: player.z - direction(state.server) * 0.32, vx: 0, vy: 0, vz: 0,
    active: false, lastHit: null, lastHitPlayer: null });
}
function startServe(state) {
  if (state.challenge) resetHellRally(state.challenge);
  if (state.trainingServer != null) state.server = state.trainingServer;
  if (state.challenge || state.trainingServer != null) {
    for (const p of state.players) p.stamina = getPlayerRole(p).maxStamina;
  }
  // Earned once after an actual scored rally, never by waiting to serve.
  // The bounded allowance is identical for both sides and follows role recovery.
  if (['point', 'intermission'].includes(state.phase) && state.rallyEnd?.id === state.pointId && state.pointId > 0) {
    for (const player of state.players) {
      const role = getPlayerRole(player);
      player.stamina = Math.min(role.maxStamina, player.stamina + role.recovery * STAMINA_TUNING.pointRecoverySeconds);
    }
  }
  state.phase = 'serve'; state.timer = 0; state.rally = 0; state._serveAge = 0;
  state.rallyEnd = null; state.netContacts = [];
  state.message = `${state.server === 0 ? '近场' : '远场'}发球 · 点击击球键`;
  if (state.format === 'doubles') {
    const parity = state.score[state.server] % 2;
    state.serverPlayer = state.players.findIndex((_, slot) => slot % 2 === state.server && state.servicePositions[slot] === parity);
    state.receiverPlayer = state.players.findIndex((_, slot) => slot % 2 !== state.server && state.servicePositions[slot] === parity);
  } else { state.serverPlayer = state.server; state.receiverPlayer = 1 - state.server; }
  const sign = direction(state.server) * (state.score[state.server] % 2 ? -1 : 1);
  state.service = { side: state.server, court: state.score[state.server] % 2 ? 'left' : 'right',
    sourceSign: sign, active: false,
    targetBox: { minX: sign > 0 ? -courtWidth(state) : 0, maxX: sign > 0 ? 0 : courtWidth(state),
      minZ: state.server === 0 ? -(state.format === 'doubles' ? 5.94 : COURT.halfLength) : 1.98, maxZ: state.server === 0 ? -1.98 : (state.format === 'doubles' ? 5.94 : COURT.halfLength) } };
  for (let side = 0; side < state.players.length; side++) {
    Object.assign(state.players[side], { x: (state.format === 'doubles' ? direction(side) * (state.servicePositions[side] ? -1 : 1) : (side === state.server ? sign : -sign)) * 0.85,
      z: direction(side) * 3.8, vx: 0, vz: 0,
      swing: 0, cooldown: 0, pendingShot: null, action: null, recoveryWait: 0, staminaRate: 0, staminaStatus: 'idle', shotRecovery: null });
  }
  attachServe(state);
}

export function finishMatch(state, winner, reason = '本局结束', endReason = 'interrupted') {
  if (state.phase === 'over') return state;
  state.phase = 'over'; state.winner = winner === 0 || winner === 1 ? winner : null;
  state.endReason = endReason; state.message = reason; state.timer = 0; state.shuttle.active = false;
  for (const player of state.players) {
    player.vx = 0; player.vz = 0; player.pendingShot = null; player.shotRecovery = null;
    if (player.action?.stage === 'prepare' || player.action?.stage === 'windup') player.action = null;
  }
  return state;
}
function awardPoint(state, winner, reason, impact) {
  if (state.phase !== 'rally') return;
  if (state.format === 'doubles' && state.server === winner) {
    for (let slot = winner; slot < 4; slot += 2) state.servicePositions[slot] = 1 - state.servicePositions[slot];
  }
  state.score[winner]++; state.pointId++; state.server = state.trainingServer ?? winner;
  state.rallyEnd = { id: state.pointId, ...impact, winner, duration: TUNING.pointWait };
  state.shuttle.active = false; state.timer = TUNING.pointWait;
  state.message = `${reason} · ${winner === 0 ? '近场' : '远场'}得分`;
  for (const player of state.players) {
    player.pendingShot = null; player.vx = 0; player.vz = 0; player.shotRecovery = null;
    if (player.action?.stage === 'prepare' || player.action?.stage === 'windup') player.action = null;
  }
  // Standard21 retains the 26 April 2025 BWF scoring snapshot (sections 7 and 8).
  // Quick games also require two clear points, with a cap for each target.
  // Court coordinates stay player-relative; standard breaks are shortened for play.
  const scoring = getScoringRules(state);
  const wonGame = state.challenge ? state.score[winner] >= HELL.targets[winner]
    : state.trainingServer == null && state.score[winner] >= scoring.target
      && (state.score[winner] - state.score[1 - winner] >= scoring.winBy || state.score[winner] >= scoring.cap);
  if (state.challenge) { state.challenge.active = null; state.challenge.warning = null; state.challenge.rescue = null; }
  state.rallyEnd.grade = wonGame ? state.ruleset === 'standard21' && state.games[winner] < 1 ? 'game' : 'match'
    : impact.kind === 'in' && winner === impact.hitSide && (state.lastShot === 'smash' || state.rally >= 8) ? 'highlight' : 'point';
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
  side = playerTeam(state, side);
  if ((side !== 0 && side !== 1) || !['serve', 'rally', 'point', 'intermission'].includes(state.phase) || state.pause.used[side] >= 1) return false;
  for (const p of state.players) { p.recoveryWait = 0; p.staminaRate = 0; p.staminaStatus = 'idle'; }
  state.pause.by = side; state.pause.previousPhase = state.phase;
  state.pause.remaining = TUNING.pauseLimit; state.pause.used[side]++;
  state._savedTimer = state.timer; state.phase = 'paused'; state.timer = TUNING.pauseLimit;
  state.message = '比赛暂停 · 30 秒后按当前比分结算';
  for (const player of state.players) {
    player.pendingShot = null; player.shotRecovery = null;
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

export function movePlayer(player, input, side, dt, state) {
  const role = state.challenge?.bossSide === side ? ROLES.swift : getPlayerRole(player);
  const effort = Math.hypot(input.x, input.z);
  const fatigue = staminaEffects(player, role);
  const h = state.challenge?.bossSide === side ? state.challenge : null;
  const moveScale = !h ? 1 : state.time < h.recoverUntil ? (h.rescue?.hit ? 0 : HELL.recoveryMoveScale) : 1;
  // Retreating while facing the net is slower than a forward approach.
  const footwork = 1 - .14 * Math.max(0,input.z * direction(side));
  const targetX = input.x * role.speed * fatigue.speedScale * moveScale * footwork, targetZ = input.z * role.speed * fatigue.speedScale * moveScale * footwork;
  const dx = targetX - player.vx, dz = targetZ - player.vz, difference = Math.hypot(dx, dz);
  const reversing = player.vx * targetX + player.vz * targetZ < 0;
  // Brake the existing velocity first when changing direction; top speed and
  // fatigue limits stay role-dependent. A swing never locks rally movement.
  const accelerating = effort > .01 && !reversing;
  const change = Math.min(1, (accelerating ? TUNING.acceleration * role.acceleration : TUNING.braking * role.braking) *
    (effort > .01 && !reversing ? fatigue.accelerationScale : 1) * dt / (difference || 1));
  player.vx += dx * change; player.vz += dz * change;
  const nextX = player.x + player.vx * dt, nextZ = player.z + player.vz * dt;
  player.x = clamp(nextX, -courtWidth(state) + TUNING.playerMargin, courtWidth(state) - TUNING.playerMargin);
  player.z = direction(side) * clamp(nextZ * direction(side), TUNING.netMargin, COURT.halfLength - TUNING.playerMargin);
  if (nextX !== player.x) player.vx = 0;
  if (nextZ !== player.z) player.vz = 0;
}

function flightPoint(ball, time) {
  return { ...sampleShuttleFlight(ball, time), time };
}
function liveFlightPoint(ball, time) {
  const contact = netCrossing(ball);
  const point = contact?.netImpact?.crosses && time >= contact.time
    ? sampleShuttleFlight(afterNet(contact, ball), time - contact.time) : sampleShuttleFlight(ball, time);
  return { ...point, time };
}
function serviceFault(state, point) {
  if (!state.service?.active || state.shuttle.lastHit !== state.service.side) return false;
  const box = state.service.targetBox;
  return point.x < box.minX || point.x > box.maxX || point.z < box.minZ || point.z > box.maxZ;
}

// Detect the physical net separately from scoring: a tape graze may continue.
function netCrossing(ball) {
  const time = timeToShuttleZ(ball, 0);
  if (!(time > 1e-9)) return null;
  const point = sampleShuttleFlight(ball, time);
  if (Math.abs(point.x) > NET_PHYSICS.halfWidth + NET_PHYSICS.corkRadius) return null;
  const contact = { ...point, time, z: 0, kind: 'net', hitSide: ball.lastHit };
  const netImpact = resolveNetImpact(contact);
  if (netImpact) return { ...contact, netImpact };
  // Passing beneath the net is a fault, but cannot shake strands it never hit.
  if (point.y < NET_PHYSICS.bottom - NET_PHYSICS.corkRadius) return { ...contact, netImpact: null };
  return null;
}
function afterNet(contact, ball) {
  const v = contact.netImpact.rebound;
  return { ...ball, x: contact.x, y: contact.y, z: 0, vx: v.x, vy: v.y, vz: v.z };
}

/** Exact first scoring event; includes the changed flight after a tape graze. */
export function predictLanding(state) {
  let ball = state.shuttle;
  if (!ball?.active || ball.lastHit === null) return null;
  let offset = 0;
  const contact = netCrossing(ball);
  const floorTime = timeToHeight(ball);
  if (contact && contact.time <= floorTime) {
    if (!contact.netImpact?.crosses) return { ...contact, y: Math.max(0, contact.y),
      event: 'net', out: false, side: null, winner: 1 - ball.lastHit };
    offset = contact.time; ball = afterNet(contact, ball);
  }
  const time = Math.max(0,timeToHeight(ball));
  const point = { ...flightPoint(ball, time), time: time + offset, y: 0 };
  const out = Math.abs(point.x) > courtWidth(state) || Math.abs(point.z) > COURT.halfLength;
  const fault = serviceFault(state, point), side = point.z >= 0 ? 0 : 1;
  return { ...point, event: 'landing', out, serviceFault: fault, side, winner: out || fault ? 1 - ball.lastHit : 1 - side };
}

function minimumNetDuration(ball, x, z, margin) {
  const fraction = Math.abs(ball.z) / Math.abs(z - ball.z);
  const f = horizontalTimeFraction(Math.hypot(x - ball.x, z - ball.z), fraction);
  if (!(f > 0 && f < 1)) return 0;
  return Math.sqrt(Math.max(0, 2 * (COURT.netHeight + margin - ball.y * (1 - f)) / (TUNING.gravity * f * (1 - f))));
}

function shotDepth(type, charge, aimDepth, serving, role) {
  const normal = serving ? (type === 'drop' ? 2.35 + charge * 0.4 : 5.65 + charge * 0.5)
    : type === 'drop' ? 1.35 + charge * 0.25 : type === 'smash' ? 4.45 + charge * 0.5 : 5.45 + charge * 0.55;
  const [near, deep] = serving ? (type === 'drop' ? [2.1, 3.7] : [3.5, 6.35])
    : type === 'drop' ? [0.7, 3] : type === 'smash' ? [1.8, 6.2] : [3.5, 6.25];
  // Depth is relative to the opponent's court for either player. Neutral retains
  // each shot's original length; dragging adjusts within its tactical range.
  const depth = aimDepth < 0 ? normal * (1 + aimDepth) - near * aimDepth : normal * (1 - aimDepth) + deep * aimDepth;
  return serving ? depth : depth * (role?.shotDepth?.[type] || 1);
}

/** Preview uses exactly the same target and launch solution as actual contact. */
export function getShotTarget(state, side, request = {}, { netDrag = state?.netDragSide === side } = {}) {
  if (playerTeam(state, side) === null) return null;
  const input = inputOf(request), ball = state.shuttle, player = state.players[side], role = state.challenge?.bossSide === side ? ROLES.power : getPlayerRole(player), assist = assistFor(state, side);
  const serving = state.phase === 'serve' && serverSlot(state) === side;
  const requested = input.shot || input.prepare || 'clear';
  const type = requested === 'smash' && serving ? 'clear' : requested;
  const fallbackReason = type !== requested ? '发球采用合法下手高远球' : '';
  let aimX = input.aim * (courtWidth(state) - 0.3);
  // Opt-in local playtest: preserve neutral, sideways and backward drags.
  // Forward drag continuously extends the front-court drop into a lift.
  const lift = netDrag && !serving && type === 'drop'
    && ball.z * direction(side) > 0 && ball.z * direction(side) <= 2.2
    && ball.y <= 1.9 ? Math.max(0, input.aimDepth) : 0;
  const normalDepth = Math.min(serving && state.format === 'doubles' ? 5.7 : Infinity, shotDepth(type, input.charge, input.aimDepth, serving, role));
  const liftDepth = shotDepth(type, input.charge, 0, false, role);
  let aimZ = -direction(side) * (lift > 0 ? liftDepth + (6.05 - liftDepth) * lift : normalDepth);
  // In the last fifth of the reserve a high overhead loses its downward angle.
  // Low contacts still carry the usual risk of driving the shuttle into the net.
  const weakSmash = type === 'smash' ? clamp(1 - player.stamina / (.2 * role.maxStamina), 0, 1)
    * clamp((ball.y - 1.4) / .7, 0, 1) : 0;
  const drag = type === 'smash' ? SHUTTLE_FLIGHT.smashDrag : SHUTTLE_FLIGHT.drag;
  const verticalDrag = type === 'smash' ? 0 : VERTICAL_DRAG;
  if (type === 'smash' && ball.z * direction(side) > 0) {
    // Only high/forward contacts can land a straight smash near the net.
    // Limit depth instead of extending flight into a slow floating arc.
    const net = COURT.netHeight + .12;
    const lineDepth = Math.abs(ball.z) * net / Math.max(.01, ball.y - net);
    const safeDepth = Math.max(Math.abs(aimZ), Math.min(6.2, lineDepth));
    // The last part of a forward drag deliberately spends net clearance.
    // Preserve this choice: collision, not random chance, determines the miss.
    const netPressure = clamp((-input.aimDepth - .6) / .4, 0, 1);
    const depth = safeDepth + (Math.abs(aimZ) - safeDepth) * netPressure;
    aimZ = -direction(side) * (depth + (Math.max(depth, 5.7) - depth) * weakSmash);
  }
  if (serving) {
    const sign = direction(side) * (state.score[playerTeam(state, side)] % 2 ? -1 : 1);
    aimX = -sign * 0.85 + input.aim * 0.55;
  }
  const quality = contactQuality({player, ball, role, ...input, shot: type, serving, assist: assist.level});
  const blockingSmash = player.humanControlled && type === 'drop' && state.phase === 'rally'
    && state.lastShot === 'smash' && ball.lastHit === 1 - playerTeam(state, side);
  const expertBlock = blockingSmash && state.format === 'singles' && state.difficulty === 'hard'
    && !state.challenge && !state.training && !state.players[1 - side].humanControlled;
  // Off-balance contact cannot absorb all the pace of a heavy smash.
  let looseBlock = 0;
  if (expertBlock && lift === 0) {
    const incomingSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
    const pace = clamp((incomingSpeed - 9) / 11, 0, 1);
    looseBlock = pace * Math.max(quality.factors.movement, quality.factors.stretch);
    aimZ -= direction(side) * .95 * looseBlock;
  }
  const overheadClear = type === 'clear' && !serving
    ? clamp((ball.y - 1.5) / .9, 0, 1) * clamp(1 - quality.risk * 3, 0, 1) * (1 + Math.min(0, input.aimDepth))
    : 0;
  if (overheadClear > 0) {
    const room = Math.max(0, COURT.halfLength - .18 - Math.abs(aimZ));
    aimZ -= direction(side) * Math.min(.22, room) * overheadClear;
  }
  const drift = contactDrift({quality, player, ball, role, aimX, aimDepth: input.aimDepth, side: playerTeam(state, side), shot: type, charge: input.charge});
  const distance = Math.hypot(aimX - ball.x, aimZ - ball.z);
  const minDuration = minimumNetDuration(ball, aimX, aimZ, type === 'smash' ? 0.12 : type === 'drop' ? 0.18 : 0.28);
  const shotSpeed = role.shotSpeed?.[type] || 1;
  // Overhead clears pressure the rear court; extra charge flattens the arc.
  // Low defensive lifts and high serves retain recovery time and net clearance.
  // Keep ordinary attacks readable; the final charge segment supplies the heavy-smash burst.
  const clearTime = serving ? 1.65 + distance * .058
    : 1.55 + distance * .043 - .14 * overheadClear - input.charge * .28 + .24 * clamp((2.1 - ball.y) / 1.7, 0, 1);
  let duration = type === 'clear' ? clearTime / shotSpeed
    : type === 'drop' ? (0.68 + distance * 0.025) / shotSpeed
      : (0.35 + distance * 0.0135) / role.power / shotSpeed / (1 + input.charge ** 1.6 * 0.30);
  if (lift > 0) duration += lift * .65;
  if (type === 'smash') {
    const downwardLimit = Math.sqrt(2 * Math.max(0.01, ball.y) / TUNING.gravity) * 0.998;
    // Never slow a smash to manufacture clearance; low contacts can hit the net.
    const rearDepth = clamp((Math.abs(ball.z) - 3.8) / 1.4, 0, 1);
    duration = Math.min(duration + .024 * rearDepth, downwardLimit);
    duration += (downwardLimit + .25 - duration) * weakSmash;
  } else duration = Math.max(duration, minDuration);
  if (verticalDrag) {
    // Only raise an arc when the requested flight would hit the net; do not
    // apply this clearance assistance to the smash.
    const fraction=horizontalTimeFraction(distance,Math.abs(ball.z)/Math.abs(aimZ-ball.z),drag);
    const clearance=t=>verticalFlight(ball.y,verticalLaunch(ball.y,0,t,verticalDrag),t*fraction,verticalDrag).y;
    const margin=type==='drop'?.12:.28;
    if(fraction>0&&fraction<1&&clearance(duration)<COURT.netHeight+margin) {
      let lo=duration,hi=Math.max(2.8,duration);
      for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(clearance(mid)<COURT.netHeight+margin)lo=mid;else hi=mid;}
      duration=hi;
    }
  }
  duration += .10 * looseBlock;
  let { vx, vz } = horizontalLaunch(ball, { x: aimX + drift.x, z: aimZ + drift.z }, duration, drag);
  // A late ankle-height lift cannot retain the launch energy of a balanced
  // overhead clear. This depends on contact state, never a random miss.
  if(type==='clear'&&!serving) {
    const energy=1-.62*quality.factors.lowContact*quality.factors.lateContact*(assist.level==='beginner'?.72:1);
    vx*=energy;vz*=energy;
  }
  // Give low, late player blocks a little more lift without correcting their aim.
  const closeLift = expertBlock ? .30 * (1 - quality.factors.stretch) * quality.factors.lowContact : 0;
  const blockLift = blockingSmash ? (.22 + closeLift) * quality.factors.lateContact : 0;
  const vy = verticalLaunch(ball.y,0,duration,verticalDrag) - Math.max(0, drift.verticalLoss - blockLift);
  duration = timeToHeight({...ball,vy,verticalDrag});
  const endpoint = flightPoint({ ...ball, vx, vy, vz, drag, verticalDrag }, duration);
  const x = quality.risk === 0 ? aimX : endpoint.x;
  const z = quality.risk === 0 ? aimZ : endpoint.z;
  const netTime = timeToShuttleZ({ ...ball, vx, vy, vz, drag, verticalDrag }, 0);
  const netHeight = verticalFlight(ball.y,vy,netTime,verticalDrag).y;
  const smashViable = type === 'smash' && !serving && ball.y >= TUNING.smashHeight
    && player.stamina >= shotStaminaCost(role, type, input.charge) && netHeight > COURT.netHeight + 0.02;
  if (!serving && netHeight <= COURT.netHeight) {
    quality.risk = Math.max(quality.risk, 0.8); quality.score = 1 - quality.risk;
    quality.reasonCode = 'net-risk';
    quality.reason = type === 'smash' ? `下压角度或触点不利，存在下网风险 · ${quality.reason}` : `击球不稳，存在下网风险 · ${quality.reason}`;
  }
  quality.spread = Math.max(quality.spread, Math.hypot(x - aimX, z - aimZ));
  return { x, y: 0, z, aimX, aimZ, quality, type, requested, fallbackReason, duration, vx, vy, vz, drag, verticalDrag,
    netHeight, smashViable, serving, assist: assist.level };
}

/** The same eligibility gate used for real contact, never a future promise. */
export function getShotAvailability(state, side, request = {}) {
  const player = state.players?.[side], ball = state.shuttle, role = player ? getPlayerRole(player) : ROLES.balanced;
  if (!player || (playerTeam(state, side) === null)) return { canHit: false, canClear: false, canDrop: false, canSmash: false, reason: '无效球员', reasonCode: 'invalid' };
  const assist = assistFor(state, side);
  const serving = state.phase === 'serve' && serverSlot(state) === side;
  const distance = Math.hypot(ball.x - player.x, ball.z - player.z);
  let reason = '', reasonCode = '';
  if (!(state.phase === 'rally' && ball.active) && !serving) { reason = '等待对方发球或比赛继续'; reasonCode = 'inactive'; }
  else if (!serving && ball.lastHit !== 1 - playerTeam(state, side)) { reason = '等待对手回球'; reasonCode = 'turn'; }
  else if (!serving && state.format === 'doubles' && state.service?.active && side !== state.receiverPlayer) { reason = '等待指定接发球员'; reasonCode = 'receiver'; }
  else if (!serving && ball.z * direction(side) <= 0.07) { reason = '来球尚未进入己方半场'; reasonCode = 'half'; }
  else if (player.cooldown > 0) { reason = '挥拍恢复中'; reasonCode = 'cooldown'; }
  else if (!serving && distance > TUNING.reach + role.reachBonus + assist.reachBonus) { reason = '靠近来球后击球'; reasonCode = 'reach'; }
  else if (!serving && (ball.y < TUNING.minHitHeight - assist.lowHeightBonus || ball.y > TUNING.maxHitHeight + assist.highHeightBonus)) { reason = ball.y > TUNING.maxHitHeight + assist.highHeightBonus ? '等待来球下降' : '来球过低'; reasonCode = 'height'; }
  const canHit = !reasonCode;
  const smash = getShotTarget(state, side, { ...request, shot: 'smash' });
  const canSmash = canHit && smash.smashViable;
  if (canHit) reason = canSmash ? '可击球 · 可以下压杀球' : serving ? '右手低位发球，落向对角发球区' : smash.quality.reason;
  return { canHit, canClear: canHit, canDrop: canHit, canSmash, reason, reasonCode,
    distance, reach: TUNING.reach + role.reachBonus + assist.reachBonus, minHeight: TUNING.minHitHeight - assist.lowHeightBonus,
    maxHeight: TUNING.maxHitHeight + assist.highHeightBonus, smashMinHeight: TUNING.smashHeight,
    cooldown: player.cooldown, stamina: player.stamina, serving, assist: assist.level };
}

export function getInterceptAdvice(state, side, request = {}) {
  const available = getShotAvailability(state, side, request), landing = predictLanding(state);
  const base = { canHit: available.canHit, canSmash: available.canSmash, futureCanSmash: false, landing, point: null, reason: available.reason };
  if (available.canHit) return { ...base, status: 'ready', point: { x: state.shuttle.x, y: state.shuttle.y, z: state.shuttle.z, time: 0 } };
  if (available.reasonCode === 'receiver') return { ...base, status: 'inactive' };
  if (!landing || state.phase !== 'rally' || state.shuttle.lastHit === playerTeam(state, side) || !state.players[side]) return { ...base, status: 'inactive' };
  if (landing.event === 'net' || landing.out || landing.serviceFault) return { ...base, status: 'out', reason: landing.event === 'net' ? '来球将触网' : '预计出界，可观察落点' };
  const player = state.players[side], role = state.challenge?.bossSide === side ? ROLES.swift : getPlayerRole(player), assist = assistFor(state, side);
  const fatigue = staminaEffects(player, role);
  let nearest = null;
  for (let time = 0.035; time < landing.time; time += 0.035) {
    const point = liveFlightPoint(state.shuttle, time);
    if (point.z * direction(side) <= 0.07 || point.y < TUNING.minHitHeight - assist.lowHeightBonus || point.y > TUNING.maxHitHeight + assist.highHeightBonus) continue;
    const x = clamp(point.x, -courtWidth(state) + TUNING.playerMargin, courtWidth(state) - TUNING.playerMargin);
    const z = direction(side) * clamp(point.z * direction(side), TUNING.netMargin, COURT.halfLength - TUNING.playerMargin);
    const travel = Math.hypot(x - player.x, z - player.z);
    nearest = point;
    const dx=x-player.x,dz=z-player.z,seconds=Math.max(0,time-.06);
    const speed=role.speed*fatigue.speedScale*(1-.14*Math.max(0,dz*direction(side)/(travel||1)));
    const initial=Math.max(-speed,Math.min(speed,(player.vx*dx+player.vz*dz)/(travel||1)));
    const braking=initial<0?Math.min(seconds,-initial/(TUNING.braking*role.braking)):0;
    const forwardTime=seconds-braking,start=Math.max(0,initial);
    const acceleration=TUNING.acceleration*role.acceleration*fatigue.accelerationScale;
    const accelerating=Math.min(forwardTime,(speed-start)/acceleration);
    const running=initial*braking+.5*TUNING.braking*role.braking*braking**2
      +start*accelerating+.5*acceleration*accelerating**2+speed*(forwardTime-accelerating);
    if (player.cooldown <= time && travel <= TUNING.reach + role.reachBonus + assist.reachBonus + running) {
      const players = [...state.players];
      players[side] = { ...player, x, z, cooldown: 0 };
      const futureState = { ...state, players, shuttle: { ...state.shuttle, ...point,
        vy: point.vy } };
      const futureCanSmash = getShotAvailability(futureState, side, request).canSmash;
      return { ...base, status: 'approach', point, futureCanSmash, reason: '移动到接球圈，等来球进入可击范围' };
    }
  }
  return { ...base, status: 'unreachable', point: nearest, reason: '距离较远，尽快跑位' };
}

function playShot(state, side, request, serving = false) {
  const player = state.players[side], ball = state.shuttle, role = getPlayerRole(player);
  let target = getShotTarget(state, side, request);
  const h = state.challenge, boss = h?.bossSide === side;
  let skill = null;
  if (!serving && boss) {
    if (h.rescue && !h.rescue.hit) {
      skill = 'rescue';
      target = getShotTarget(state, side, { shot: 'clear', aim: request.aim, aimDepth: -.15, charge: 0 });
      h.rescue.hit = true; h.rescue.contact = { x: ball.x, y: ball.y, z: ball.z };
      h.rescue.hitAt = state.time; h.recoverUntil = h.rescue.endsAt;
      h.warning = null;
    } else if (h.warning && state.time - h.warning.at >= HELL.chargeTime && target.type === 'smash' && target.smashViable) {
      skill = 'cannon'; h.warning = null;
      h.recoverUntil = state.time + HELL.recovery;
    } else if (!(state._ai[side]?.playDeep && state._ai[side].hitId === state.hitId && target.type === 'clear')) {
      const opponent = state.players[1 - side];
      // Situational variations retain readable phantom trails and real contact.
      skill = state._ai[side]?.wideDrop || opponent.z > 4.2 ? 'netDrop'
        : Math.abs(opponent.vx) > 1.8 && ball.y > 1.2 ? 'drive' : 'phantom';
      h.warning = null;
      target = getShotTarget(state, side, { ...request, shot: 'drop',
        aimDepth: skill === 'netDrop' ? -1 : skill === 'drive' ? 1 : .65, charge: .2 });
    }
  }
  const type = target.type;
  if (skill === 'rescue' || skill === 'drive') {
    const duration = skill === 'rescue' ? Math.max(1.25, target.duration * .85)
      : Math.max(.48, minimumNetDuration(ball, target.aimX, target.aimZ, .14), target.duration * (skill === 'drive' ? .9 : .82));
    const launch = horizontalLaunch(ball, { x: target.aimX, z: target.aimZ }, duration, target.drag);
    target = { ...target, ...launch, vy: verticalLaunch(ball.y,0,duration,target.verticalDrag), duration };
  }
  const contact = { x: ball.x, y: ball.y, z: ball.z };
  ball.vx = target.vx; ball.vy = target.vy; ball.vz = target.vz; ball.drag = target.drag; ball.verticalDrag = target.verticalDrag;
  ball.active = true; ball.lastHit = playerTeam(state, side); ball.lastHitPlayer = side;
  if (state.service) state.service.active = serving;
  const staminaBefore = player.stamina;
  player.stamina = Math.max(0, player.stamina - shotStaminaCost(role, type, request.charge, serving));
  player.swing = role.swingTime; player.cooldown = role.swingTime;
  player.pendingShot = null; player.lastShot = type;
  if (skill === 'rescue') player.cooldown = Math.max(0, h.recoverUntil - state.time);
  const rest = !serving && STAMINA_TUNING.shotRecovery[type];
  player.shotRecovery = rest ? { type, expiresAt: state.time + rest.duration, remaining: rest.budget } : null;
  if (player.action) Object.assign(player.action, { type, stage: 'contact', contact, quality: target.quality,
    contactAt: state.time, endsAt: state.time + role.swingTime, swingTime: role.swingTime });
  state.phase = 'rally'; state.hitId++; state.rally++; state.lastShot = type;
  if (h) {
    h.active = null;
    if (skill) {
      h.counts[skill]++;
      const netTime = timeToShuttleZ(ball, 0);
      h.active = { kind: skill, at: state.time, hitId: state.hitId, launch: { ...ball },
        fadeAt: Math.max(.005, Math.min(.65, netTime * .86)) };
    }
  }
  state.lastShotInfo = {hitId: state.hitId, side: playerTeam(state, side), playerSlot: side, at: state.time, type, requested: target.requested,
    aimX: target.aimX, aimZ: target.aimZ, x: target.x, z: target.z, quality: target.quality,
    serving, contact, outgoing: { vx: ball.vx, vy: ball.vy, vz: ball.vz, drag: ball.drag, verticalDrag: ball.verticalDrag }, charge: request.charge, staminaBefore, staminaAfter: player.stamina, ...(skill ? { skill } : {})};
  state.message = target.fallbackReason || `${shotName(type)} · ${state.rally} 拍${target.quality.risk >= 0.16 ? ` · ${target.quality.reason}` : ''}`;
}

export function integrateShuttle(state, dt, onImpact = awardPoint) {
  const ball = state.shuttle;
  const contact = netCrossing(ball);
  const ending = predictLanding(state);
  if (contact && contact.netImpact && contact.time <= dt + 1e-9 && contact.time <= ending.time + 1e-9) {
    const event = { ...contact, id: ++state.netContactId, hitId: state.hitId,
      at: state.time - dt + contact.time };
    state.netContacts = [...(state.netContacts || []).filter(e => event.at - e.at < NET_PHYSICS.duration), event].slice(-8);
    if (contact.netImpact.crosses) {
      Object.assign(ball, afterNet(contact, ball));
      // Consume the remainder of this same slice, including a very close floor.
      integrateShuttle(state, Math.max(0, dt - contact.time), onImpact);
      return;
    }
  }
  if (ending && ending.time <= dt + 1e-9) {
    const impact = { ...sampleShuttleFlight(ball, ending.time),
      kind: ending.event === 'net' ? 'net' : ending.serviceFault ? 'serviceFault' : ending.out ? 'out' : 'in',
      at: state.time - dt + ending.time, x: ending.x, y: ending.y, z: ending.z,
      hitSide: ball.lastHit, hitId: state.hitId,
      ...(ending.event === 'net' ? { netImpact: contact?.netImpact || null } : {}) };
    Object.assign(ball, sampleShuttleFlight(ball, ending.time), { x: ending.x, y: ending.y, z: ending.z });
    onImpact(state, ending.winner, ending.event === 'net' ? '未过网' : ending.serviceFault ? '发球未落入对角发球区' : ending.out ? '出界' : '落地', impact);
    return;
  }
  Object.assign(ball, sampleShuttleFlight(ball, dt));
}

function actionFor(state, side, request, stage, lead) {
  const player = state.players[side], ball = state.shuttle, role = getPlayerRole(player);
  const contact = state.phase === 'serve' ? { x: ball.x, y: ball.y, z: ball.z } : liveFlightPoint(ball, lead);
  const type = request.shot || request.prepare || 'clear';
  const dx = contact.x - player.x, dz = contact.z - player.z;
  const reachScale = Math.min(0.62, Math.max(0, (Math.hypot(dx, dz) - 0.45) / (Math.hypot(dx, dz) || 1)));
  return { id: ++player.actionId, type, stage, startedAt: state.time,
    contactAt: state.time + lead, endsAt: state.time + lead + role.swingTime, swingTime: role.swingTime,
    contact: { x: contact.x, y: contact.y, z: contact.z }, origin: { x: player.x, z: player.z },
    jumpHeight: type === 'smash' ? clamp((contact.y - 2.35) * 0.65, 0, 0.65) : 0,
    reach: { x: dx * reachScale, z: dz * reachScale }, serving: state.phase === 'serve' };
}

function updateAction(state, player) {
  const action = player.action;
  if (!action || action.stage === 'prepare' || action.stage === 'windup') return;
  const after = state.time - action.contactAt, swingTime = action.swingTime || TUNING.swingTime;
  if (state.time >= action.endsAt) player.action = null;
  else action.stage = after < swingTime * 0.11 ? 'contact' : after < swingTime * 0.43 ? 'followthrough' : 'recovery';
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
    const untilLow = Math.max(0,timeToHeight(ball,TUNING.minHitHeight));
    lead = Math.min(lead, Math.max(0.006, untilLow * 0.45));
    // Windup may start just before entry into reach/height, but real contact must
    // still pass the live eligibility gate. This allows a jump before a fast ball.
    for (let tries = 0; tries < 4; tries++) {
      const point = liveFlightPoint(ball, lead);
      const predicted = { ...state, shuttle: { ...ball, ...point, vy: point.vy } };
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
  const start = state.time, phase = state.phase, hitId = state.hitId, pointId = state.pointId;
  const previous = state.players.map(p => ({ x: p.x, z: p.z, action: p.action ? { ...p.action } : null, cooldown: p.cooldown }));
  const speeds = state.players.map(() => 0);
  try {
  state.time += dt;
  const paper = state.challenge?.paper;
  if (paper && phase === 'rally' && state.shuttle.active && paper.count < paper.limit && pointId >= paper.nextPoint) {
    paper.liveTime += dt;
    if (paper.liveTime >= paper.delay) {
      paper.count++;
      paper.at = state.time;
      paper.side *= -1;
      paper.nextPoint = pointId + 1;
    }
  }
  if (state.challenge?.rescue && state.time >= state.challenge.rescue.endsAt) state.challenge.rescue = null;
  for (let side = 0; side < state.players.length; side++) {
    const player = state.players[side];
    player.swing = Math.max(0, player.swing - dt);
    player.cooldown = Math.max(0, player.cooldown - dt);
    updateAction(state, player);
    if (player.pendingShot) {
      player.pendingShot.remaining -= dt;
      if (player.pendingShot.remaining <= 0) {
        if (player.pendingShot.shot === 'smash' && state.phase === 'rally' && state.shuttle.lastHit !== playerTeam(state, side)) {
          state.message = '未接到球 · 先跑位，等球下降再击球';
        }
        player.pendingShot = null;
        if (player.action?.stage === 'windup') player.action = null;
      }
    }
    if (state.phase === 'serve' || state.phase === 'rally') {
      if (state.phase === 'serve' && state.players[serverSlot(state)].pendingShot?.contactAt !== undefined) {
        player.vx = 0; player.vz = 0;
      } else {
        const h = state.challenge?.bossSide === side ? state.challenge : null;
        if (h?.rescue) {
          const dive = h.rescue, age = state.time - dive.at;
          const t = clamp((age - HELL.divePrepare) / HELL.diveTime, 0, 1);
          const slide = clamp((age - HELL.divePrepare - HELL.diveTime) / .14, 0, 1);
          const easeSlide = 1 - (1 - slide) ** 2;
          const oldX = player.x, oldZ = player.z;
          player.x = dive.from.x + (dive.to.x - dive.from.x) * t + (dive.slideTo.x - dive.to.x) * easeSlide;
          player.z = dive.from.z + (dive.to.z - dive.from.z) * t + (dive.slideTo.z - dive.to.z) * easeSlide;
          player.vx = (player.x - oldX) / dt; player.vz = (player.z - oldZ) / dt;
          if (!dive.hit && age >= HELL.divePrepare && age < HELL.divePrepare + HELL.diveTime + .06)
            player.pendingShot ??= { shot: 'clear', aim: dive.aim, aimDepth: -.15, charge: 0, remaining: .3 };
          if (age >= HELL.divePrepare + HELL.diveTime + .06) player.pendingShot = null;
        }
        else movePlayer(player, inputs[side], side, dt, state);
      }
      if (state.phase === 'serve') {
        const sign = state.format === 'doubles' ? direction(side) * (state.servicePositions[side] ? -1 : 1) : state.service.sourceSign * (side === state.server ? 1 : -1);
        player.x = sign * clamp(player.x * sign, 0.22, courtWidth(state) - TUNING.playerMargin);
        player.z = direction(side) * clamp(player.z * direction(side), 2.3, COURT.halfLength - TUNING.playerMargin);
      }
      speeds[side] = Math.hypot(player.vx, player.vz);
      if (firstSlice && inputs[side].shot && player.pendingShot?.contactAt === undefined) {
        const assist = assistFor(state, side);
        player.pendingShot = { ...inputs[side], remaining: TUNING.shotBuffer + assist.inputBuffer };
      }
      if (inputs[side].prepare && !player.pendingShot && player.cooldown <= 0) {
        const startedAt = player.action?.stage === 'prepare' ? player.action.startedAt : state.time;
        const id = player.action?.stage === 'prepare' ? player.action.id : null;
        player.action = actionFor(state, side, inputs[side], 'prepare', 0.18);
        player.action.startedAt = startedAt;
        if (id !== null) { player.action.id = id; player.actionId--; }
      } else if (!inputs[side].prepare && player.action?.stage === 'prepare' && !player.pendingShot) player.action = null;
    }
  }
  separateTeammates(state, previous);
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
    attemptShot(state, serverSlot(state));
    return;
  }
  // Ball and match clock must describe the same instant at contact. The prior
  // slice already checked its endpoint; do not launch and then advance a new
  // fast shot through a slice whose time was counted before that contact.
  integrateShuttle(state, dt);
  if (state.phase === 'rally') for (const side of contactOrder(state)) {
    const before = state.hitId;
    attemptShot(state, side);
    if (state.format === 'doubles' && state.hitId !== before) { const team=playerTeam(state,side);state._contactTieByTeam??=[state._contactTie,state._contactTie];state._contactTieByTeam[team]++;break; }
  }
  } finally {
    const liveDt = state.pointId !== pointId ? clamp(state.rallyEnd.at - start, 0, dt) : dt;
    for (let side = 0; side < state.players.length; side++) {
      const player = state.players[side], role = getPlayerRole(player);
      const moving = speeds[side] / role.speed, effort = Math.max(moving, Math.hypot(inputs[side].x, inputs[side].z));
      const blockedUntil = Math.max(start + previous[side].cooldown, previous[side].action?.endsAt || start,
        (previous[side].action?.jump?.landAt || start - .24) + .24);
      const action = player.action;
      const blocked = phase !== 'rally' || effort >= .4 || inputs[side].prepare ||
        ['prepare', 'windup', 'contact', 'followthrough'].includes(action?.stage) ||
        (action && action.startedAt >= start - 1e-8) || ['prepare', 'windup'].includes(previous[side].action?.stage);
      let recovery = 0, eligible = 0;
      if (blocked) player.recoveryWait = 0;
      else {
        eligible = Math.max(0, start + liveDt - Math.max(start, blockedUntil));
        if (eligible < liveDt - 1e-9) player.recoveryWait = 0;
        const beforeWait = player.recoveryWait || 0;
        player.recoveryWait = Math.min(.35, beforeWait + eligible);
        const recovering = Math.max(0, eligible - Math.max(0, .35 - beforeWait));
        const t = clamp((effort - .1) / .3, 0, 1);
        recovery = role.recovery * (1 - t * t * (3 - 2 * t)) * recovering;
        const rest = player.shotRecovery;
        if (rest && state.shuttle.lastHit === playerTeam(state, side)) {
          const duration = Math.max(0, Math.min(start + liveDt, rest.expiresAt) - (start + liveDt - recovering));
          const tuning = STAMINA_TUNING.shotRecovery[rest.type];
          const extra = Math.min(rest.remaining, role.recovery * tuning.boost * (1 - t * t * (3 - 2 * t)) * duration);
          recovery += extra; rest.remaining -= extra;
        }
      }
      if (player.shotRecovery && (player.shotRecovery.expiresAt <= start + liveDt || state.shuttle.lastHit !== playerTeam(state, side) || phase !== 'rally')) player.shotRecovery = null;
      const drain = ['serve', 'rally'].includes(phase) ? movementStaminaRate(role, speeds[side]) * liveDt : 0;
      const before = player.stamina;
      player.stamina = clamp(before + recovery - drain, 0, role.maxStamina);
      player.staminaRate = liveDt > 0 ? (player.stamina - before) / liveDt : 0;
      player.staminaStatus = player.staminaRate > .001 ? 'recovering' : player.staminaRate < -.001 ? 'draining' :
        !blocked && eligible > 0 && player.recoveryWait < .35 ? 'waiting' : 'idle';
      if (state.hitId !== hitId && state.lastShotInfo?.playerSlot === side) {
        state.lastShotInfo.staminaBefore = clamp(state.lastShotInfo.staminaBefore + recovery - drain, 0, role.maxStamina);
        state.lastShotInfo.staminaAfter = player.stamina;
        player.staminaStatus = 'draining';
      }
      if (state.lastShotInfo?.playerSlot === side && state.time - state.lastShotInfo.at < .18) player.staminaStatus = 'draining';
      if (state.challenge?.bossSide === side) {
        player.stamina = role.maxStamina; player.staminaRate = 0; player.staminaStatus = 'infinite';
        if (state.lastShotInfo?.playerSlot === side) state.lastShotInfo.staminaAfter = role.maxStamina;
      }
      if (state.phase !== 'rally' && state.challenge?.bossSide !== side) { player.recoveryWait = 0; player.staminaRate = 0; player.staminaStatus = 'idle'; }
    }
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
  const normalized = state.players.map((_, slot) => inputOf(inputs?.[slot]));
  // A stalled tab must not leap through a full rally when it wakes up.
  let remaining = Math.min(dt, 0.25), firstSlice = true;
  while (remaining > 0.000001 && state.phase !== 'over') {
    let slice = Math.min(remaining, 1 / 120);
    for (const player of state.players) {
      const untilContact = player.pendingShot?.contactAt - state.time;
      if (untilContact > 1e-7) slice = Math.min(slice, untilContact);
    }
    stepLive(state, normalized, slice, firstSlice);
    firstSlice = false; remaining -= slice;
  }
  return state;
}

function moveToward(player, x, z, pace) {
  const dx = x - player.x, dz = z - player.z, distance = Math.hypot(dx, dz);
  const speed = Math.min(1, pace, distance * 2.2);
  return distance < 0.07 ? { x: 0, z: 0 } : { x: dx / distance * speed, z: dz / distance * speed };
}

function smashOpportunity(state, side) {
  const ball = state.shuttle;
  const bestHeight = Math.min(3.05, flightApex(ball).y);
  const contactTime = timeToHeight(ball,bestHeight);
  const contactDepth = liveFlightPoint(ball, Math.max(0, contactTime)).z * direction(side);
  return { contactTime, highChance: contactTime >= 0 && contactDepth > 0.5 && contactDepth < 6.4 };
}

function repeatPenalty(history, candidate) {
  let penalty = 0;
  for (let index = Math.max(0, history.length - 3); index < history.length; index++) {
    const previous = history[index];
    if (previous.shot === candidate.shot) penalty += 0.22;
    if (previous.shot === candidate.shot && Math.sign(previous.aim) === Math.sign(candidate.aim) &&
        Math.abs(previous.aim - candidate.aim) < 0.28 && Math.sign(previous.aimDepth) === Math.sign(candidate.aimDepth) &&
        Math.abs(previous.aimDepth - candidate.aimDepth) < 0.3) penalty += 0.42;
  }
  return penalty;
}

// Learn only from consecutive contacts in this point. Keep six recent replies
// per shot family and lane so an opponent can establish or abandon a pattern.
function shotLane(type, x) {
  return type + (x < -.65 ? 'Left' : x > .65 ? 'Right' : 'Middle');
}

function observeReplies(state, side) {
  const hit = state.lastShotInfo;
  if (!hit || hit.hitId !== state.hitId) return;
  state._scouting ??= {};
  const book = state._scouting[side] ??= { lanes: {}, lastHit: -1 };
  if (book.lastHit === hit.hitId) return;
  book.lastHit = hit.hitId;
  if (state.challenge?.bossSide === side && hit.side !== playerTeam(state, side)) {
    const deepCorner = !hit.serving && Math.abs(hit.x) > 1.25 && Math.abs(hit.z) > 4.5;
    const lane = deepCorner ? Math.sign(hit.x) : 0;
    book.switches = lane && book.lastCorner === -lane ? Math.min(3, (book.switches || 0) + 1) : 0;
    book.lastCorner = lane;
  }
  const setup = book.setup;
  book.setup = null;
  if (hit.serving) return;
  if (hit.playerSlot === side) {
    book.setup = { key: shotLane(hit.type, hit.x), hitId: hit.hitId, point: state.pointId };
  } else if (hit.side !== playerTeam(state, side) && setup?.hitId === hit.hitId - 1 && setup.point === state.pointId) {
    const replies = book.lanes[setup.key] ??= [];
    replies.push({ x: hit.x, depth: Math.abs(hit.z), attack: hit.type === 'smash',
      shortLift: hit.type === 'clear' && Math.abs(hit.z) < 5.2 });
    if (replies.length > 6) replies.shift();
  }
}

function setupValue(state, side, candidate) {
  const key = shotLane(candidate.shot, candidate.aim * (courtWidth(state) - .3));
  const replies = state._scouting?.[side]?.lanes[key] || [];
  const value = replies.reduce((sum, r) => sum + (r.shortLift ? 1.8 : r.attack ? -2.8 : 0), 0);
  return value / (2 + replies.length);
}

function recoveryPosition(state, side, level) {
  let x = state.shuttle.x * .15;
  let depth = level === 'hard' && !state.challenge ? 2.95 : 3.55;
  const book = level === 'hard' && state._scouting?.[side];
  const replies = book?.setup && book.lanes[book.setup.key];
  if (replies?.length) {
    // Opposite replies cancel out. A single observation barely moves the base.
    const weight = 1 / (3 + replies.length);
    const baseX = x, baseDepth = depth;
    for (const reply of replies) {
      x += .85 * weight * (clamp(reply.x, -2.3, 2.3) - baseX);
      depth += weight * (clamp(reply.depth, 1.4, 5.5) - baseDepth);
    }
  }
  if (book?.switches && state.challenge?.bossSide === side) {
    // Shade the opposite rear corner. A change of length immediately clears this read.
    x = x * .45 - book.lastCorner * Math.min(.9, book.switches * .35);
    depth = Math.max(depth, 3.95 + .16 * book.switches);
  }
  depth += state.players[side].cup?.tactics?.depth ?? 0;
  return { x, z: direction(side) * depth };
}

function chooseCandidate(state, side, level, candidates) {
  const history = aiHistoryFor(state, side);
  const temperature = level === 'hard' ? 0.72 : 0.9;
  const player = state.players[side];
  const reservePressure = clamp(1 - player.stamina / (2 * shotStaminaCost(getPlayerRole(player), 'smash')), 0, 1);
  // Fatigue shifts preference toward economical returns without banning attacks.
  const coverage = candidate => {
    if(state.format!=='doubles')return 0;
    const target=getShotTarget(state,side,candidate),opponents=state.players.filter((_,slot)=>playerTeam(state,slot)!==playerTeam(state,side));
    // Reward space according to the nearer defender, never just one opponent.
    return 2.5*Math.min(...opponents.map(p=>Math.hypot(target.aimX-p.x,target.aimZ-p.z)/(getPlayerRole(p).speed*staminaEffects(p,getPlayerRole(p)).speedScale)));
  };
  // On an overhead, pressure the space beyond the receiver's current motion.
  // Faster attacking shots leave less time to recover than a high clear.
  const pressure = candidate => {
    if (state.challenge || state.format === 'doubles' || state.lastShot !== 'clear' || state.shuttle.vy <= 0) return 0;
    const opponent = state.players[1 - side];
    const targetX = candidate.aim * (courtWidth(state) - .3);
    const depth = shotDepth(candidate.shot, candidate.charge ?? .3, candidate.aimDepth, false, getPlayerRole(player));
    const distance = Math.hypot(targetX - opponent.x - opponent.vx * .18,
      -direction(side) * depth - opponent.z - opponent.vz * .18);
    const urgency = candidate.shot === 'smash' ? 1.8 : candidate.shot === 'drop' ? 1.15 : .8;
    return (level === 'hard' ? 1.7 : 1) * distance / getPlayerRole(opponent).speed * urgency;
  };
  const scored = candidates.map(candidate => ({ ...candidate, score: candidate.score + (player.cup?.tactics?.[candidate.shot] ?? 0) + coverage(candidate) + (1 - reservePressure) * pressure(candidate)
    + (level === 'hard' ? setupValue(state, side, candidate) : 0) - repeatPenalty(history, candidate)
    - reservePressure * (candidate.shot === 'smash' ? 1.2 : candidate.shot === 'clear' ? .3 : 0) }));
  const best = Math.max(...scored.map(candidate => candidate.score));
  const viable = scored.filter(candidate => candidate.score > -5);
  const weighted = viable.map(candidate => ({ candidate, weight: Math.exp((candidate.score - best) / temperature) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = random(state) * total;
  let selected = weighted.at(-1)?.candidate || viable[0];
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) { selected = item.candidate; break; }
  }
  history.push({ shot: selected.shot, aim: selected.aim, aimDepth: selected.aimDepth });
  if (history.length > 6) history.shift();
  return { shot: selected.shot, aim: selected.aim, aimDepth: selected.aimDepth, charge: selected.charge ?? .3 };
}

function chooseAIShot(state, side, level) {
  const roll = random(state), lineRoll = random(state) * 2 - 1;
  const opponent = state.players[1 - playerTeam(state, side)];
  const opponentDepth = Math.abs(opponent.z);
  const { highChance, contactTime } = smashOpportunity(state, side);
  const lowReturn = state.lastShot === 'smash' || state.lastShot === 'drop' || !highChance;
  if (level === 'easy') {
    const tactics = state.players[side].cup?.tactics;
    const shot = roll < .74 + .14 * (tactics?.clear ?? 0) ? 'clear'
      : roll < .96 - .13 * (tactics?.smash ?? 0) || lowReturn ? 'drop' : 'smash';
    // A loose midcourt lift stays playable and gives the receiver an attack.
    const feed = shot === 'clear' && roll < .34;
    const selected = { shot, aim: lineRoll * (feed ? .14 : .28),
      aimDepth: (random(state) - .5) * .25 - (feed ? .73 : 0) };
    const history = aiHistoryFor(state, side); history.push(selected); if (history.length > 6) history.shift();
    return selected;
  }
  if (lowReturn) {
    // A block and a lift are both legal low-contact returns. Favor the space
    // left by the attacker; never turn a low defensive contact into a smash.
    const open = Math.abs(opponent.x) > .25 ? -Math.sign(opponent.x) : Math.sign(lineRoll) || 1;
    const width = level === 'hard' ? .72 : .48;
    const read = level === 'hard' ? 1 : .45;
    const frontSpace = clamp((opponentDepth - 3.2) / 1.5, -1, 1) * read;
    return chooseCandidate(state, side, level, [
      {shot:'drop',aim:open*width,aimDepth:-.15,charge:.05,score:2.3+frontSpace},
      {shot:'drop',aim:-open*width*.65,aimDepth:.1,charge:.12,score:1.6+frontSpace*.6},
      {shot:'clear',aim:open*width,aimDepth:.45,charge:.25,score:2.3-frontSpace},
      {shot:'clear',aim:-open*width*.8,aimDepth:.65,charge:.35,score:1.7-frontSpace*.6},
    ]);
  }
  if (level === 'medium') {
    // Doubles already scores space against both defenders in chooseCandidate.
    const singles = state.format !== 'doubles';
    const depthRead = singles ? clamp((opponentDepth - 3.3) / 1.6, -1, 1) : 0;
    const line = singles && Math.abs(opponent.x) > .85 && roll < .7
      ? -Math.sign(opponent.x) * (.5 + .45 * Math.abs(lineRoll)) : lineRoll;
    return chooseCandidate(state, side, level, [
      { shot: 'clear', aim: line * 0.72, aimDepth: .3 + (random(state) - 0.5) * 0.3, charge:.45, score: 2.1 - .95 * depthRead },
      { shot: 'drop', aim: line * 0.82, aimDepth: -0.25 + (random(state) - 0.5) * 0.25, score: 1.9 + .95 * depthRead },
      { shot: 'smash', aim: line * 0.9, aimDepth: 0.2 + (random(state) - 0.5) * 0.3, score: 1.7 },
    ]);
  }
  const openSide = Math.abs(opponent.x) > 0.25 ? -Math.sign(opponent.x) : Math.sign(lineRoll) || 1;
  const alternateSide = -openSide;
  const pressure = openSide * (0.72 + Math.abs(lineRoll) * 0.2);
  const alternate = alternateSide * (0.42 + Math.abs(lineRoll) * 0.36);
  const smashScore = highChance ? opponentDepth > 4.25 ? 2.3 : opponentDepth < 2.7 ? 2.2 : 3.35 : -10;
  const dropScore = opponentDepth > 4.25 ? 3.5 : opponentDepth < 2.7 ? 1.65 : 2.35;
  const clearScore = opponentDepth < 2.7 ? 3.9 : opponentDepth > 4.25 ? 1.65 : 2.45;
  const canPress = !state.challenge && state.format !== 'doubles' && highChance && contactTime > .4;
  const attacker = state.players[side];
  // A moving defender has to brake before covering the other lane.
  const commitment = Math.hypot(opponent.vx, opponent.vz) / getPlayerRole(opponent).speed;
  const reserve = attacker.stamina / (2 * shotStaminaCost(getPlayerRole(attacker), 'smash'));
  const attackBonus = canPress ? 2.2 * clamp(reserve + commitment, 0, 1) : 0;
  const shortLift = !state.challenge && state.lastShotInfo?.type === 'clear' && !state.lastShotInfo.serving
    && Math.abs(state.lastShotInfo.z) < 5.2;
  const candidates = [
    { shot: 'drop', aim: pressure, aimDepth: -0.32 + (random(state) - 0.5) * 0.18, score: dropScore },
    { shot: 'clear', aim: pressure, aimDepth: 0.55 + (random(state) - 0.5) * 0.2, charge:.7, score: clearScore },
    { shot: 'smash', aim: pressure, aimDepth: 0.05 + random(state) * 0.68, charge:canPress ? .65+random(state)*.1 : .25+random(state)*.5, score: smashScore + attackBonus + (shortLift ? 1.6 : 0) },
    { shot: 'clear', aim: alternate, aimDepth: 0.35 + (random(state) - 0.5) * 0.25, charge:.15, score: 1.6 },
    { shot: 'drop', aim: alternate, aimDepth: -0.08 + (random(state) - 0.5) * 0.35, score: 1.55 },
  ];
  if(state.format==='doubles')candidates.push(
    {shot:'drop',aim:0,aimDepth:-.2,score:dropScore},
    {shot:'clear',aim:0,aimDepth:.25,score:clearScore},
    {shot:'smash',aim:0,aimDepth:.15,score:smashScore});
  return chooseCandidate(state, side, level, candidates);
}

// Estimate running reach with a short preparation allowance and a 20 cm
// contact margin. Save the dive when ordinary footwork has a viable contact.
// Existing speed avoids needless dives while already approaching the ball.
function canRunToIncoming(player, ball, landingTime) {
  const role = ROLES.swift, speed = role.speed;
  const acceleration = TUNING.acceleration * role.acceleration;
  const initial = Math.min(speed, Math.hypot(player.vx, player.vz));
  const toTop = (speed - initial) / acceleration;
  for (let t = 0; t < landingTime; t += .025) {
    const point = liveFlightPoint(ball, t);
    if (point.y < TUNING.minHitHeight || point.y > TUNING.maxHitHeight || point.z >= -.07 || player.cooldown > t) continue;
    const runTime = Math.max(0, t - .09);
    const accelerating = Math.min(runTime, toTop);
    const travel = initial * accelerating + .5 * acceleration * accelerating ** 2 + speed * Math.max(0, runTime - toTop);
    if (Math.hypot(point.x-player.x, point.z-player.z) <= TUNING.reach + role.reachBonus + travel - .5) return true;
  }
  return false;
}

/** inputs is an optional sparse array of observed HUMAN controls, indexed by player slot. */
export function aiInput(state, side, difficulty = 'easy', inputs = null) {
  if ((playerTeam(state, side) === null) || !['serve', 'rally'].includes(state.phase)) return { x: 0, z: 0, shot: null, aim: 0, aimDepth: 0, charge: 0 };
  const h = state.challenge?.bossSide === side ? state.challenge : null;
  const level = h ? 'hard' : difficultyOf(difficulty), config = h ? { ...AI.hard, reaction: HELL.reaction, error: HELL.error } : (state.players[side].cup?.ai ?? AI[level]), player = state.players[side], ball = state.shuttle, role = getPlayerRole(player);
  const output = { x: 0, z: 0, shot: null, aim: 0, aimDepth: 0, charge: 0.3 };
  if (state.phase === 'serve') {
    if (serverSlot(state) === side && state._serveAge > config.serveDelay + config.reaction) {
      let serve = state._ai[side];
      if (serve?.servePointId !== state.pointId) {
        const short = random(state) < (h ? .40 : level === 'hard' ? .72 : level === 'medium' ? .48 : .22);
        serve = state._ai[side] = {servePointId:state.pointId,shot:short?'drop':'clear',
          aim:(random(state)-.5)*(level==='easy'?.5:1.4),
          aimDepth:short?-.65: .2+random(state)*.35,charge:short?.05:.35};
      }
      output.shot=serve.shot;output.aim=serve.aim;output.aimDepth=serve.aimDepth;output.charge=serve.charge;
    }
    return output;
  }
  if (level === 'hard') observeReplies(state, side);
  if (state.format === 'doubles') {
    const assignment = doublesAssignment(state, side, config, inputs, getInterceptAdvice, level);
    if (assignment) return { ...output, ...assignment };
  }
  if (h?.rescue) return output;
  if (ball.lastHit === playerTeam(state, side)) {
    const base = recoveryPosition(state, side, level);
    const regroupPace = !h && player.stamina < role.maxStamina * .45 ? .20 : config.pace * (level === 'hard' ? .9 : .72);
    return { ...output, ...moveToward(player, base.x, base.z, regroupPace) };
  }
  let memory = state._ai[side];
  if (!memory || memory.hitId !== state.hitId) {
    const decision = chooseAIShot(state, side, level);
    // Phantom returns use a low contact and a flatter arc so all four balls
    // remain readable in the regular phone camera.
    if (h && !smashOpportunity(state, side).highChance) decision.shot = 'drop';
    // Reaction delay and spatial prediction error remain difficulty-dependent.
    // Every reachable return is attempted; the common contact model causes errors.
    memory = state._ai[side] = { hitId: state.hitId, ready: state.format === 'doubles' ? state.time : state.time + config.reaction,
      errorX: (random(state) - 0.5) * config.error * 2, errorZ: (random(state) - 0.5) * config.error * 2,
      shot: decision.shot, aim: decision.aim, aimDepth: decision.aimDepth, charge: decision.charge ?? .3 };
  }
  if (state.time < memory.ready) return output;
  // Defend attacks at a low contact, preserving the chosen block/lift and line.
  const defendingSmash = !h && level !== 'easy' && state.lastShot === 'smash';
  output.charge = memory.charge;
  // Read the receiver once near overhead preparation, after they have had
  // time to move following the lift. Store the habit across points in this match.
  const readLift = level === 'hard' && state.format === 'singles' && state.lastShot === 'clear'
    && !h?.warning && !memory.readReceiver;
  const chance = readLift || h ? smashOpportunity(state, side) : null;
  if (readLift && chance.highChance && chance.contactTime <= .55) {
    memory.readReceiver = true;
    const habits = state._netRush ??= [0, 0];
    const receiver = state.players[1 - side];
    const depth = Math.abs(receiver.z);
    const projectedDepth = depth + Math.sign(receiver.z) * receiver.vz * .18;
    const forward = depth < 2.5 || (depth < 3.2 && projectedDepth < 2.5);
    const openLane = Math.abs(receiver.x) > .4 ? -Math.sign(receiver.x) : Math.sign(memory.aim) || 1;
    const deepChance = habits[side] ? (Math.abs(receiver.x) > .65 ? .84 : .94) : .70;
    if (forward && random(state) < deepChance) {
      memory.playDeep = true;
      memory.shot = 'clear';
      memory.aim = openLane * (.6 + random(state) * .28);
      memory.aimDepth = .62 + random(state) * .3;
      memory.charge = random(state) < .55 ? .84 : .16;
    } else if ((forward && Math.abs(receiver.x) > .65 || !forward && depth > 4.2 && habits[side] > 0)
        && random(state) < .7) {
      // Use the opposite forecourt when the receiver guards a sideline or retreats.
      memory.wideDrop = true;
      memory.shot = 'drop';
      memory.aim = openLane * .94;
      memory.aimDepth = -.65;
      memory.charge = .12;
    }
    output.charge = memory.charge;
    habits[side] = clamp(habits[side] + (forward ? 1 : -1), 0, 3);
  }
  if (h && state.time >= h.recoverUntil) {
    const landing = predictLanding(state);
    const legal = landing && landing.event === 'landing' && !landing.out && !landing.serviceFault && landing.side === side;
    const distance = Math.hypot(ball.x - player.x, ball.z - player.z);
    const diveContact = liveFlightPoint(ball, Math.min(HELL.divePrepare + HELL.diveTime, landing?.time * .7 || 0));
    if (legal && state.time >= h.nextDiveAt && landing.time < .95 && landing.time > HELL.divePrepare + .12
        && diveContact.y < 1.45 && distance > TUNING.reach + .2
        && !canRunToIncoming(player, ball, landing.time)
        && Math.hypot(diveContact.x-player.x,diveContact.z-player.z) > .5
        && Math.hypot(landing.x - player.x, landing.z - player.z) < HELL.diveSpeed * HELL.diveTime
        && !h.warning && !h.active && player.cooldown <= 0) {
      const point = diveContact;
      h.nextDiveAt = state.time + HELL.diveInterval;
      h.rescueUses++; h.rescue = { aim: memory.aim, at: state.time, endsAt: state.time + HELL.diveDuration,
        point, from: { x: player.x, z: player.z },
        to: { x: clamp(point.x, -courtWidth(state) + .16, courtWidth(state) - .16),
          z: direction(side) * clamp(point.z * direction(side), .54, COURT.halfLength - .16) }, hit: false };
      const dive = h.rescue, dx = dive.to.x - dive.from.x, dz = dive.to.z - dive.from.z, distance = Math.hypot(dx, dz);
      dive.slideTo = { x: clamp(dive.to.x + dx / distance * .2, -courtWidth(state) + .16, courtWidth(state) - .16),
        z: direction(side) * clamp((dive.to.z + dz / distance * .2) * direction(side), .54, COURT.halfLength - .16) };
      h.recoverUntil = dive.endsAt;
      return output;
    }
    if (!h.warning && !memory.playDeep && !memory.wideDrop && !(readLift && chance.contactTime > .55)) {
      if (chance.highChance && chance.contactTime >= HELL.chargeTime && chance.contactTime < 1.4) {
        h.warning = { at: state.time, hitId: state.hitId, aim: memory.aim, aimDepth: .35 };
        memory.shot = 'smash'; memory.aimDepth = .35;
      }
    }
  }
  if (h?.warning && h.warning.hitId !== state.hitId) h.warning = null;
  const overhead = (!h || memory.playDeep || memory.wideDrop) && !defendingSmash && flightApex(ball).y >= 2.8;
  const contactHeight = memory.shot === 'smash' ? Math.min(3.05, flightApex(ball).y) : defendingSmash ? 1.65 : overhead ? 2.65 : 1.2;
  const contactTime = Math.max(0,timeToHeight(ball,contactHeight));
  const contactPoint = liveFlightPoint(ball, contactTime);
  const targetX = clamp(contactPoint.x + memory.errorX, -courtWidth(state) + 0.15, courtWidth(state) - 0.15);
  const targetZ = direction(side) * clamp(contactPoint.z * direction(side) + memory.errorZ, 0.7, COURT.halfLength - 0.25);
  Object.assign(output, moveToward(player, targetX, targetZ, config.pace));
  const horizontal = Math.hypot(ball.x - player.x, ball.z - player.z);
  if (memory.shot === 'smash' && contactTime < 0.4) output.prepare = 'smash';
  if (!state.challenge && state.format === 'singles' && side === 1 && level !== 'hard'
      && memory.shot === 'smash' && contactTime < .4) {
    state.smashWarning = { hitId: state.hitId, aim: memory.aim };
  }
  if (ball.z * direction(side) > 0.1 && ball.vy < 1.5 && horizontal < TUNING.reach + role.reachBonus + 0.15
    && ball.y <= (memory.shot === 'smash' ? 4.35 : overhead ? 2.9 : 1.9)) {
    // Commit at swing preparation, once the receiver has had time to move.
    if (h && !memory.readReceiver && !h.warning && memory.shot !== 'smash') {
      memory.readReceiver = true;
      const receiver = state.players[1 - side];
      const depth = Math.abs(receiver.z);
      const advancing = depth < 3.2 && depth + Math.sign(receiver.z) * receiver.vz * .18 < 2.5;
      const contact = liveFlightPoint(ball, .06);
      const balanced = contact.y >= 1.2
        && Math.hypot(contact.x - player.x, contact.z - player.z) <= TUNING.reach;
      if ((balanced || contact.y >= .95 && horizontal < TUNING.reach) && (depth < 2.5 || advancing) && random(state) < .90) {
        const openLane = Math.abs(receiver.x) > .4 ? -Math.sign(receiver.x) : Math.sign(memory.aim) || 1;
        memory.aim = openLane * .82;
        memory.wideDrop = balanced && Math.abs(receiver.x) > 1 && random(state) < .25;
        memory.playDeep = !memory.wideDrop;
        memory.shot = memory.playDeep ? 'clear' : 'drop';
        memory.aimDepth = memory.playDeep ? .72 : -.65;
        memory.charge = output.charge = .2;
      }
    }
    output.shot = memory.shot; output.aim = memory.aim; output.aimDepth = memory.aimDepth;
  }
  if (defendingSmash && level === 'hard' && memory.shot === 'clear' && !output.shot) {
    // Buffer within the normal player input window. Actual contact still uses
    // the same reach, height, windup and cooldown checks as human input.
    const point = liveFlightPoint(ball, .1);
    if (point.z * direction(side) > .1 && point.y >= TUNING.minHitHeight && point.y <= 2.8
        && Math.hypot(point.x - player.x, point.z - player.z) < TUNING.reach + role.reachBonus) {
      output.shot = memory.shot; output.aim = memory.aim; output.aimDepth = memory.aimDepth;
    }
  }
  if (!h && level !== 'easy' && output.shot === 'drop' && state.lastShot === 'smash') {
    // A stretched block can lose its small tape margin during the windup.
    // Use the visible flight and normal contact model to choose a safer lift.
    const contact = liveFlightPoint(ball, .07);
    const forecast = {...state, shuttle:contact, players:state.players.map((p,slot)=>slot===side
      ? {...p,x:p.x+p.vx*.07,z:p.z+p.vz*.07} : p)};
    const block = getShotTarget(forecast,side,output);
    if (contact.y < .65 || block.netHeight < COURT.netHeight + .04 || block.quality.risk > .4) {
      memory.shot=output.shot='clear';memory.aim=output.aim=clamp(memory.aim,-.55,.55);
      memory.aimDepth=output.aimDepth=.35;memory.charge=output.charge=.15;
    }
  }
  if (h?.warning) {
    output.aim = h.warning.aim; output.aimDepth = h.warning.aimDepth; output.prepare = 'smash';
    if (state.time - h.warning.at < HELL.chargeTime) output.shot = null;
    else if (getShotAvailability(state, side, { ...output, shot: 'smash' }).canSmash) output.shot = 'smash';
    else if (ball.y < 1.65 || state.time - h.warning.at > 1.6) {
      h.warning = null; memory.shot = 'clear'; output.shot = 'clear'; output.prepare = null;
    }
  }
  return output;
}
