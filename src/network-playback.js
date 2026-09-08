const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, alpha) => a + (b - a) * alpha;
const copy = value => structuredClone(value);
const EPSILON = 1e-7;
const frozenPhase = phase => phase === 'paused' || phase === 'countdown';
const gravity = 9.81; // Matches the shared ballistic simulation, in metres / second².

// Position + velocity interpolation preserves a parabola within one flight.
// Contact/landing anchors split it into separate curves at velocity changes.
function flightBetween(a, b, duration, alpha) {
  if (duration <= EPSILON) return { ...b };
  const t = clamp(alpha, 0, 1), t2 = t * t, t3 = t2 * t;
  const ball = { ...a };
  for (const [axis, velocity] of [['x', 'vx'], ['y', 'vy'], ['z', 'vz']]) {
    const va = a[velocity] || 0, vb = b[velocity] || 0;
    ball[axis] = (2 * t3 - 3 * t2 + 1) * a[axis] + (t3 - 2 * t2 + t) * va * duration
      + (-2 * t3 + 3 * t2) * b[axis] + (t3 - t2) * vb * duration;
    ball[velocity] = ((6 * t2 - 6 * t) * a[axis] + (3 * t2 - 4 * t + 1) * va * duration
      + (-6 * t2 + 6 * t) * b[axis] + (3 * t2 - 2 * t) * vb * duration) / duration;
  }
  return ball;
}

function contactBall(contact, end, duration) {
  // Derive launch velocity from exact authoritative contact and endpoint. This
  // also absorbs the physics slice in which a hit precedes shuttle integration.
  return { ...end, ...contact,
    vx: duration > EPSILON ? (end.x - contact.x) / duration : end.vx,
    vy: duration > EPSILON ? (end.y - contact.y) / duration + gravity * duration / 2 : end.vy,
    vz: duration > EPSILON ? (end.z - contact.z) / duration : end.vz,
  };
}

function actionAt(previous, next, time, switched) {
  let action = next && next.startedAt <= time + EPSILON ? next : switched ? null : previous;
  if (!action || time > action.endsAt + EPSILON) return null;
  action = copy(action);
  if (action.stage !== 'prepare') {
    const after = time - action.contactAt;
    action.stage = after < -EPSILON ? 'windup' : after < .045 ? 'contact' : after < .18 ? 'followthrough' : 'recovery';
  }
  return action;
}

function interpolate(a, b, alpha, packetSpanMs) {
  if (alpha >= 1 - EPSILON) return copy(b);
  const span = b.time - a.time;
  // Match time stops inside the final scoring slice; the network clock does
  // not. Do not stretch that last flight until the following packet timestamp.
  const time = b.phase === 'over' && a.phase !== 'over'
    ? Math.min(b.time, a.time + packetSpanMs * alpha / 1000) : mix(a.time, b.time, alpha);
  const motionAlpha = span > EPSILON ? clamp((time - a.time) / span, 0, 1) : alpha;
  const newHit = b.hitId !== a.hitId;
  const newPoint = b.pointId !== a.pointId;
  const hitAt = newHit && Number.isFinite(b.lastShotInfo?.at) ? b.lastShotInfo.at : Infinity;
  const rawPointAt = newPoint && Number.isFinite(b.rallyEnd?.at) ? b.rallyEnd.at : Infinity;
  const contact = newHit ? b.players[b.lastShotInfo?.side]?.action?.contact : null;
  const hitKnown = b.hitId === a.hitId + 1 && contact && hitAt >= a.time - EPSILON && hitAt <= b.time + EPSILON;
  // An immediate net fault can be timestamped earlier within the same physics
  // slice as its hit. Preserve the event payload, but never show a score first.
  const pointAt = hitKnown ? Math.max(hitAt, rawPointAt) : rawPointAt;
  const scored = newPoint && time + EPSILON >= pointAt;
  const hit = hitKnown && time + EPSILON >= hitAt;
  const resetServe = b.phase === 'serve' && a.phase !== 'serve';
  // Gaps covering several unobserved contacts cannot be reconstructed honestly.
  if ((newHit && !hitKnown) || resetServe) {
    const held = copy(a);
    if (resetServe) { held.time = time; held.timer = Math.max(0, a.timer - (time - a.time)); }
    return held;
  }
  let base = scored || hit ? b : a;
  const state = copy(base); state.time = time;
  if (hit && newPoint && !scored) {
    // A fast contact and net fault can share one 20 Hz packet. Reveal the hit
    // first; scoring and the existing cosmetic tail start at their own instant.
    for (const key of ['score', 'pointId', 'rallyEnd', 'server', 'winner', 'games', 'gameScores', 'sideChange']) state[key] = copy(a[key]);
    state.phase = 'rally'; state.message = a.message; state.timer = a.timer;
  }
  if (a.phase === b.phase) state.timer = mix(a.timer, b.timer, alpha);
  else if (scored && b.phase !== 'over') state.timer = b.timer + Math.max(0, b.time - time);
  state.pause.remaining = mix(a.pause.remaining, b.pause.remaining, alpha);
  state.players = a.players.map((previous, side) => {
    const next = b.players[side], player = copy(base.players[side]);
    for (const key of ['x', 'z', 'vx', 'vz', 'stamina', 'swing', 'cooldown']) player[key] = mix(previous[key], next[key], motionAlpha);
    player.action = actionAt(previous.action, next.action, time, base === b);
    return player;
  });
  if (scored) {
    state.shuttle = { ...state.shuttle, x: b.rallyEnd.x, y: b.rallyEnd.y, z: b.rallyEnd.z, active: false };
  } else if (hitKnown) {
    if (!hit) {
      if (a.shuttle.active) {
        const duration = hitAt - a.time;
        const endpoint = { ...a.shuttle, ...contact, vy: a.shuttle.vy - gravity * duration };
        state.shuttle = flightBetween(a.shuttle, endpoint, duration, (time - a.time) / duration);
      } else {
        state.shuttle = { ...a.shuttle };
        for (const key of ['x', 'y', 'z']) state.shuttle[key] = mix(a.shuttle[key], contact[key], clamp((time - a.time) / Math.max(EPSILON, hitAt - a.time), 0, 1));
      }
    } else {
      const endTime = newPoint ? pointAt : b.time;
      const endpoint = newPoint ? { ...b.shuttle, ...b.rallyEnd } : b.shuttle;
      const duration = endTime - hitAt, launch = contactBall(contact, endpoint, duration);
      state.shuttle = flightBetween(launch, endpoint, duration, (time - hitAt) / Math.max(EPSILON, duration));
      state.shuttle.active = true; state.shuttle.lastHit = b.lastShotInfo.side;
    }
  } else if (a.shuttle.active && newPoint) {
    const endpoint = { ...a.shuttle, ...b.rallyEnd };
    state.shuttle = flightBetween(a.shuttle, endpoint, pointAt - a.time, (time - a.time) / Math.max(EPSILON, pointAt - a.time));
  } else if (a.shuttle.active && b.shuttle.active && span > EPSILON) {
    state.shuttle = flightBetween(a.shuttle, b.shuttle, span, alpha);
  } else {
    state.shuttle = { ...state.shuttle };
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) state.shuttle[key] = mix(a.shuttle[key], b.shuttle[key], alpha);
  }
  return state;
}

/** Read-only visual playback, never a second rules simulation.
 * receive(snapshot, local performance.now(), {serverTime, seq, matchId});
 * sample(local performance.now()) returns one state for bodies, ball, UI/audio.
 * Retain the authoritative state separately for input/connection decisions.
 */
export class NetworkPlayback {
  constructor({ bufferMs = 60, minBufferMs = 50, maxBufferMs = 140 } = {}) {
    this.minBufferMs = clamp(minBufferMs, 0, 250);
    this.maxBufferMs = clamp(maxBufferMs, this.minBufferMs, 250);
    this.initialBufferMs = clamp(bufferMs, this.minBufferMs, this.maxBufferMs);
    this.reset();
  }

  reset() {
    this.frames = []; this.offsetSamples = []; this.clockOffset = null;
    this.lastFrame = null; this.playedAt = null; this.frozenState = null;
    this.lastDisplayed = null; this.pauseVisual = null;
    this.bufferMs = this.initialBufferMs; this.intervalMs = 50; this.jitterMs = 0;
    this.underruns = 0; this.underflow = false; this.received = 0;
  }

  receive(state, arrivalNow = performance.now(), metadata = {}) {
    if (!state?.players?.length || !state.shuttle || !Number.isFinite(state.time) || !Number.isFinite(arrivalNow)) return false;
    const serverTime = Number.isFinite(metadata.serverTime) ? metadata.serverTime : arrivalNow;
    const seq = Number.isFinite(metadata.seq) ? metadata.seq : null;
    const matchId = metadata.matchId ?? null;
    const previous = this.lastFrame;
    if (previous) {
      if (typeof matchId === 'number' && typeof previous.matchId === 'number' && matchId < previous.matchId) return false;
      if (seq !== null && previous.seq !== null && seq <= previous.seq && matchId === previous.matchId) return false;
      if (serverTime < previous.serverTime - EPSILON && matchId === previous.matchId) return false;
    }
    const restart = previous && (matchId !== previous.matchId || state.time < previous.state.time - EPSILON || state.pointId < previous.state.pointId);
    const phaseChange = previous && state.phase !== previous.state.phase;
    const immediate = phaseChange && (frozenPhase(state.phase) || frozenPhase(previous.state.phase)
      || (state.phase === 'over' && state.pointId === previous.state.pointId));
    const gap = previous && arrivalNow - previous.arrivalNow > 1000;
    const rebase = !previous || restart || immediate || gap || this.frozenState;
    const terminalHold = state.phase === 'over' && previous && state.pointId === previous.state.pointId;
    if (restart) { this.pauseVisual = null; this.lastDisplayed = null; }
    if (frozenPhase(state.phase) || terminalHold) {
      const shown = this.frozenState || this.lastDisplayed;
      const sameRally = shown && shown.pointId === state.pointId && !!shown.rallyEnd === !!state.rallyEnd;
      // Keep the complete pose/ball instant that was actually drawn. Timers and
      // control status remain authoritative. A newly scored point instead takes
      // the entire new frame, so an old flying ball cannot gain a new score tail.
      if (!this.pauseVisual && sameRally) this.pauseVisual = copy(shown);
      if (!sameRally) this.pauseVisual = null;
    } else this.pauseVisual = null;
    if (restart || gap || this.frozenState) {
      this.offsetSamples = []; this.clockOffset = null;
    }
    if (previous && !restart && !gap) {
      const sentInterval = serverTime - previous.serverTime;
      const arrivalInterval = arrivalNow - previous.arrivalNow;
      // Immediate control packets do not change the regular ~20 Hz cadence.
      if (sentInterval >= 20 && sentInterval <= 250) {
        this.intervalMs += (sentInterval - this.intervalMs) * .1;
        this.jitterMs += (Math.abs(arrivalInterval - sentInterval) - this.jitterMs) * .15;
        const target = clamp(this.intervalMs + 10 + this.jitterMs * 1.5, this.minBufferMs, this.maxBufferMs);
        this.bufferMs += (target - this.bufferMs) * (target > this.bufferMs ? .25 : .04);
      }
    }
    this.offsetSamples.push(arrivalNow - serverTime);
    if (this.offsetSamples.length > 60) this.offsetSamples.shift();
    const offset = Math.min(...this.offsetSamples);
    this.clockOffset = this.clockOffset === null ? offset : this.clockOffset + clamp(offset - this.clockOffset, -5, 1);
    const frame = { state: copy(state), serverTime, arrivalNow, seq, matchId };
    if (rebase) {
      this.frames = []; this.playedAt = serverTime; this.frozenState = null; this.underflow = false;
    }
    // Multiple packets may represent the exact same simulated instant.
    if (this.frames.at(-1)?.serverTime === serverTime) this.frames[this.frames.length - 1] = frame;
    else this.frames.push(frame);
    if (this.frames.length > 48) this.frames.shift();
    this.lastFrame = frame; this.received++;
    return true;
  }

  sample(now = performance.now()) {
    if (this.frozenState) return copy(this.frozenState);
    if (!this.frames.length) return null;
    const newest = this.frames.at(-1), oldest = this.frames[0];
    const desired = now - this.clockOffset - this.bufferMs;
    const starved = desired > newest.serverTime + EPSILON;
    if (starved && !this.underflow) this.underruns++;
    this.underflow = starved;
    const at = clamp(Math.max(this.playedAt ?? oldest.serverTime, desired), oldest.serverTime, newest.serverTime);
    this.playedAt = at;
    // Keep the preceding endpoint; discard history that cannot be revisited.
    while (this.frames.length > 2 && this.frames[1].serverTime <= at) this.frames.shift();
    const first = this.frames[0], next = this.frames[1];
    if (!next || at <= first.serverTime + EPSILON) return this.present(copy(first.state));
    const alpha = clamp((at - first.serverTime) / (next.serverTime - first.serverTime), 0, 1);
    return this.present(interpolate(first.state, next.state, alpha, next.serverTime - first.serverTime));
  }

  present(state) {
    if (this.pauseVisual && (frozenPhase(state.phase) || state.phase === 'over')) {
      for (const key of ['time', 'players', 'shuttle', 'hitId', 'rally', 'lastShot', 'lastShotInfo', 'rallyEnd']) state[key] = copy(this.pauseVisual[key]);
    }
    if (frozenPhase(state.phase) && this.lastFrame.state.phase === state.phase) {
      state.pause = copy(this.lastFrame.state.pause); state.timer = this.lastFrame.state.timer;
    }
    this.lastDisplayed = copy(state);
    return state;
  }

  freeze(now = performance.now()) {
    this.frozenState = this.sample(now);
    return this.frozenState ? copy(this.frozenState) : null;
  }

  metrics(now = performance.now()) {
    return { intervalMs: this.intervalMs, snapshotHz: 1000 / this.intervalMs,
      jitterMs: this.jitterMs, bufferMs: this.bufferMs,
      ageMs: this.lastFrame ? Math.max(0, now - this.lastFrame.arrivalNow) : null,
      bufferedSnapshots: this.frames.length, underruns: this.underruns,
      frozen: !!this.frozenState, received: this.received };
  }
}
