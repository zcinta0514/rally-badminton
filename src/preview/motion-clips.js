import { aiInput, createMatch, stepMatch } from '../../shared/game.js';
import { createTraining, stepTraining } from '../../shared/training.js';

export const FRAME_RATE = 120;
export const MOTION_CASES = {
  ready: '准备站姿', run: '侧移、制动与回位', footwork: '前后场跑动',
  jump: '腾空杀球', standing: '普通杀球', clear: '后场高远球', drop: '后场吊球',
  shortServe: '短发球', longServe: '长发球', cross: '网前勾对角', lift: '网前挑球',
  defense: '接杀挡网', feed: '教练喂球', rescue: '飞身救球',
};

function record(state, side) {
  return structuredClone({
    time: state.time, player: state.players[side], shuttle: state.shuttle, side,
    rescue: state.challenge?.bossSide === side ? state.challenge.rescue : null,
  });
}

function advanceFrame(state, side, input, step) {
  const duration = 1 / FRAME_RATE;
  const untilContact = state.players[side].pendingShot?.contactAt - state.time;
  // The rules may strike partway through a tick. Save that exact instant for
  // scrubbing, then consume the rest so neither rally nor playback drifts.
  if (untilContact > 1e-6 && untilContact < duration - 1e-6) {
    step(state, input, untilContact);
    const contact = record(state, side);
    step(state, input, duration - untilContact);
    return contact;
  }
  step(state, input, duration);
  return record(state, side);
}

function trainingClip(kind, hand) {
  const drill = kind === 'feed' ? 'lift' : kind;
  const slot = kind === 'feed' ? 1 : 0;
  const state = createTraining({ drill, line: hand === 'left' ? 'left' : 'right' });
  state.players[slot].hand = hand;
  const training = state.training;
  const shot = kind === 'lift' ? 'clear' : 'drop';
  const aim = (kind === 'cross' ? -.85 : .7) * training.lane;
  const frames = [];
  let released = false;
  for (let i = 0; i < FRAME_RATE * 3; ++i) {
    const age = state.time - training.feedAt;
    const ready = training.canHit && (kind === 'defense' || age >= .75);
    const input = { aim, aimDepth: kind === 'lift' ? .42 : -.35, charge: .25 };
    if (kind !== 'feed' && training.stage === 'feed' && !released) {
      if (ready) { input.shot = shot; released = true; }
      else if (age > (kind === 'defense' ? .15 : .52)) input.prepare = shot;
    }
    frames.push(advanceFrame(state, slot, input, stepTraining));
  }
  const impact = frames.findIndex(frame => frame.player.action?.stage === 'contact');
  return frames.slice(Math.max(0, impact - 54), impact + 110);
}

export function buildMotionClip(kind, hand = 'right') {
  if (!Object.hasOwn(MOTION_CASES, kind)) throw new Error('Unknown motion clip: ' + kind);
  if (['cross', 'lift', 'defense', 'feed'].includes(kind)) return trainingClip(kind, hand);

  const dive = kind === 'rescue';
  const moving = kind === 'run' || kind === 'footwork';
  const withoutShuttle = moving || kind === 'ready';
  const side = dive ? 1 : 0;
  const state = createMatch(dive ? {challenge:'hell'} : {});
  const player = state.players[side];
  player.hand = hand;
  const sign = hand === 'left' ? -1 : 1;
  const serve = kind === 'shortServe' || kind === 'longServe';
  const shot = kind === 'jump' || kind === 'standing' ? 'smash'
    : kind === 'drop' || kind === 'shortServe' ? 'drop' : 'clear';
  if (!serve) {
    state.phase = 'rally';
    state.service.active = false;
    Object.assign(player, { x: dive ? -1.8 * sign : 0, z: dive ? -3.8 : 3.8, vx:0, vz:0 });
    const height = dive ? 1.05 : kind === 'standing' ? 2.65 : kind === 'jump' ? 3.7 : 3.2;
    Object.assign(state.shuttle, {
      x: (dive ? 1 : .35) * sign, y: height, z: dive ? -3.8 : 3.6,
      vx:0, vy:dive ? -1 : -.2, vz:0, active: !withoutShuttle, lastHit:1-side,
    });
  }
  const frames = [];
  const count = moving ? 320 : dive ? 210 : 180;
  for (let i = 0; i < count; ++i) {
    let inputs;
    if (dive) inputs = [{}, aiInput(state, 1, 'hard')];
    else if (kind === 'ready') inputs = [{}, {}];
    else if (moving) {
      const travel = i >= 40 && i < 104 ? 1 : i >= 155 && i < 225 ? -1 : 0;
      const step = kind === 'run' ? {x:travel * sign} : {z:-travel};
      inputs = [step, {}];
    } else {
      const input = i === 30 ? { shot } : i > 0 && i < 30 ? { prepare: shot } : {};
      inputs = [{ ...input, charge:kind === 'longServe' ? 1 : .35 }, {}];
    }
    frames.push(advanceFrame(state, side, inputs, stepMatch));
  }
  return frames;
}
