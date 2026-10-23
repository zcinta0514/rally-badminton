import { pathToFileURL } from 'node:url';
import path from 'node:path';
import * as currentGame from '../shared/game.js';

const dt = 1 / 120;
const round = value => typeof value === 'number' ? Math.round(value * 10000) / 10000 : value;

export function shotFixture(game, { type = 'clear', serving = false, side = 0, role = 'balanced' } = {}) {
  const state = game.createMatch({ roles: [role, role], seed: 41 });
  if (!serving) {
    state.phase = 'rally';
    Object.assign(state.players[side], { x: 0, z: (side === 0 ? 1 : -1) * 5.2 });
    Object.assign(state.shuttle, { x: 0, y: 2.6, z: state.players[side].z,
      vx: 0, vy: 0, vz: 0, active: true, lastHit: 1 - side });
  }
  const request = { shot: type, aim: 0, aimDepth: 0, charge: .3 };
  return { state, request, target: game.getShotTarget(state, side, request) };
}

export function receiveFixture(game, { type = 'drop', startZ = 4.8, startX = 0, side = 0 } = {}) {
  const state = game.createMatch({ seed: 41 });
  const sign = side === 0 ? 1 : -1, hitter = 1 - side;
  state.phase = 'rally';
  state.lastShot = type;
  Object.assign(state.players[side], { x: startX * sign, z: startZ * sign });
  Object.assign(state.players[hitter], { x: 0, z: -sign * 4.8 });
  Object.assign(state.shuttle, { x: 0, y: type === 'smash' ? 3.05 : 2.6, z: -sign * 4.8,
    vx: 0, vy: 0, vz: 0, active: true, lastHit: side });
  const target = game.getShotTarget(state, hitter, { shot: type, charge: .3 });
  Object.assign(state.shuttle, { vx: target.vx, vy: target.vy, vz: target.vz, lastHit: hitter });
  return { state, target };
}

// One released shot only. The movement direction and press time are fixed,
// without automatic pursuit or repeated retries; both receive identical input.
export function runReceive(game, { type = 'drop', startZ = 4.8, startX = 0, reaction = .16,
  pressAt = .42, shot = 'clear', side = 0, moving = true, frame = dt } = {}) {
  const { state, target } = receiveFixture(game, { type, startZ, startX, side });
  const landing = game.predictLanding(state), sign = side === 0 ? 1 : -1;
  let pressed = false, firstEligible = null, eligibleFrames = 0, minDistance = Infinity, contact = null;
  for (let tick = 0; tick < Math.ceil(2 / frame) && state.phase === 'rally'; tick++) {
    const time = tick * frame, input = {};
    if (moving && time >= reaction && state.players[side].z * sign > 1.6) input.z = -sign;
    if (!pressed && time + 1e-9 >= pressAt) { input.shot = shot; pressed = true; }
    const available = game.getShotAvailability(state, side, { shot });
    if (available.canHit) { firstEligible ??= state.time; eligibleFrames++; }
    if (state.shuttle.z * sign > 0 && state.shuttle.y > .2 && state.shuttle.y < 3.25)
      minDistance = Math.min(minDistance, available.distance);
    const inputs = [{}, {}]; inputs[side] = input;
    game.stepMatch(state, inputs, frame);
    if (state.lastShotInfo?.side === side) { contact = state.lastShotInfo; break; }
  }
  return { received: !!contact, failure: contact ? null : firstEligible === null ? 'not-in-reach' : 'missed-window',
    input: { type, startZ, startX, reaction, pressAt, shot, side, moving, frame },
    incomingFlight: round(target.duration), incomingLanding: { x: round(landing.x), z: round(landing.z) },
    firstEligible: round(firstEligible), eligibleWindow: round(eligibleFrames * frame), minDistance: round(minDistance),
    contactAt: round(contact?.at ?? null), contactHeight: round(contact?.contact.y ?? null),
    quality: contact?.quality ?? null, returnLanding: contact ? game.predictLanding(state) : null,
    player: { x: round(state.players[side].x), z: round(state.players[side].z),
      speed: round(Math.hypot(state.players[side].vx, state.players[side].vz)) },
    score: state.score };
}

export function measureMovement(game, role = 'balanced') {
  const make = () => { const s = game.createMatch({ roles: [role, role] }); s.players[0].z = 5; return s; };
  const start = make();
  let firstMotion = null, fullSpeed = null;
  for (let tick = 0; tick < 60; tick++) {
    game.stepMatch(start, [{ z: -1 }, {}], dt);
    if (Math.abs(start.players[0].vz) > 0) firstMotion ??= (tick + 1) * dt;
    if (Math.abs(start.players[0].vz) >= game.ROLES[role].speed * .99) { fullSpeed = (tick + 1) * dt; break; }
  }
  const reverse = make(); reverse.players[0].vz = game.ROLES[role].speed; reverse.players[0].z = 3;
  let reverseZero = null, reverseFull = null;
  for (let tick = 0; tick < 100; tick++) {
    game.stepMatch(reverse, [{ z: -1 }, {}], dt);
    if (reverse.players[0].vz <= 0) reverseZero ??= (tick + 1) * dt;
    if (reverse.players[0].vz <= -game.ROLES[role].speed * .99) { reverseFull = (tick + 1) * dt; break; }
  }
  const stop = make(); stop.players[0].vz = -game.ROLES[role].speed; const origin = stop.players[0].z;
  for (let tick = 0; tick < 100 && stop.players[0].vz !== 0; tick++) game.stepMatch(stop, [{}, {}], dt);
  return { role, topSpeed: game.ROLES[role].speed, firstMotion: round(firstMotion), fullSpeed: round(fullSpeed),
    reverseZero: round(reverseZero), reverseFull: round(reverseFull), stopDistance: round(origin - stop.players[0].z) };
}

export function measurePace(game = currentGame) {
  const flights = [];
  for (const role of Object.keys(game.ROLES)) for (const [type, serving] of [['clear', true], ['clear', false], ['drop', false], ['smash', false]]) {
    const { state, target } = shotFixture(game, { type, serving, role });
    Object.assign(state.shuttle, { vx: target.vx, vy: target.vy, vz: target.vz, active: true, lastHit: 0 });
    const landing = game.predictLanding(state);
    flights.push({ role, type, serving, duration: round(target.duration),
      initialVelocity: { vx: round(target.vx), vy: round(target.vy), vz: round(target.vz) },
      apex: round(state.shuttle.y + Math.max(0, target.vy) ** 2 / (2 * 9.81)),
      netHeight: round(target.netHeight), x: round(landing.x), z: round(landing.z), event: landing.event });
  }
  return { rulesVersion: game.RULES_VERSION, flights, movement: Object.keys(game.ROLES).map(role => measureMovement(game, role)),
    receives: {
      dropTimely: runReceive(game),
      dropScramble: runReceive(game, { reaction: .55, pressAt: .82 }),
      dropLate: runReceive(game, { reaction: .66, pressAt: .9 }),
      smashPositioned: runReceive(game, { type: 'smash', startZ: 3.6, moving: false, pressAt: .24 }),
      smashEarly: runReceive(game, { type: 'smash', startZ: 4.8, moving: false, pressAt: 0 }),
      smashMisplaced: runReceive(game, { type: 'smash', startZ: 6.3, startX: 2.2, moving: false, pressAt: .24 }),
    } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const game = process.argv[2] ? await import(pathToFileURL(path.resolve(process.argv[2])).href) : currentGame;
  console.log(JSON.stringify(measurePace(game), null, 2));
}
