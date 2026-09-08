import { createMatch, stepMatch, pauseMatch, resumeMatch, finishMatch, ROLES } from '../shared/game.js';

const STEP_MS = 1000 / 60;
const MAX_CATCHUP_MS = 500;
const INPUT_TIMEOUT_MS = 250;
const SHOT_INTERVAL_MS = 100;
const SHOTS = new Set(['clear', 'drop', 'smash']);
const MESSAGES = new Set(['input', 'ping', 'pause', 'suspend', 'resume', 'rematch', 'leave']);
const clamp = (value, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
const validSlot = slot => slot === 0 || slot === 1;
const scoreWinner = state => state.score[0] === state.score[1] ? null : state.score[0] > state.score[1] ? 0 : 1;
const clone = value => structuredClone(value);

function profileOf(profile) {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  const name = typeof source.name === 'string' ? Array.from(source.name
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()).slice(0, 16).join('') : '';
  return { name: name || '球友',
    role: typeof source.role === 'string' && Object.hasOwn(ROLES, source.role) ? source.role : 'balanced',
    connected: true,
    playerId: typeof source.playerId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(source.playerId) ? source.playerId : null };
}

function newSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** A browser-hosted authority; the transport owns its clock timer and peer connections. */
export class PeerMatch {
  constructor({ code, host, target = 5, ruleset = 'quick', send, now = () => performance.now(),
    seed = () => Math.floor(Math.random() * 0xffffffff) + 1, sessionId } = {}) {
    this.code = typeof code === 'string' ? code.trim().toUpperCase() : '';
    this.sessionId = typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 128 ? sessionId : newSessionId();
    this.ruleset = ruleset === 'standard21' ? 'standard21' : 'quick';
    this.target = this.ruleset === 'standard21' ? 21 : [5, 11, 21].includes(target) ? target : 5;
    this.players = [profileOf(host), null];
    this.state = null;
    this.abandoned = false;
    this.send = send;
    this.now = now;
    this.seed = seed;
    this.lastTick = now();
    this.accumulator = 0;
    this.tickCount = 0;
    this.snapshotSeq = 0;
    this.matchId = 1;
    this.inputs = [{}, {}];
    this.lastInput = [-Infinity, -Infinity];
    this.lastShot = [-Infinity, -Infinity];
    this.resumeReady = new Set();
    this.rematch = new Set();
    this.closed = false;
    this.ticking = false;
  }

  emit(slot, message) {
    if (!this.closed && this.players[slot]?.connected) this.send(slot, clone(message));
  }

  announce() {
    if (this.closed) return;
    for (let slot = 0; slot < 2; slot++) this.emit(slot, {
      type: 'room', code: this.code, slot, token: null, target: this.target,
      ruleset: this.ruleset, players: this.players, sessionId: this.sessionId,
    });
  }

  join(guest) {
    if (this.closed) throw new Error('房间已关闭，请重新约战');
    if (!this.players[0]?.connected) throw new Error('房主已离开，房间已结束');
    if (this.players[1] || this.state) throw new Error('房间已满或比赛已开始');
    this.players[1] = profileOf(guest);
    this.startMatch();
    this.announce();
    this.broadcast();
    return true;
  }

  startMatch() {
    this.abandoned = false;
    this.state = createMatch({ target: this.target, ruleset: this.ruleset,
      roles: this.players.map(player => player.role), seed: this.seed() });
    this.inputs = [{}, {}];
    this.lastInput = [-Infinity, -Infinity];
    this.lastShot = [-Infinity, -Infinity];
    this.resumeReady.clear();
    this.rematch.clear();
    this.lastTick = Math.max(this.lastTick, this.now());
    this.accumulator = 0;
    this.tickCount = 0;
  }

  broadcast() {
    if (this.closed || !this.state) return;
    const message = { type: 'state', state: this.state, seq: ++this.snapshotSeq, matchId: this.matchId,
      serverTime: this.lastTick - this.accumulator, leaderboard: null, sessionId: this.sessionId, abandoned: this.abandoned };
    for (let slot = 0; slot < 2; slot++) this.emit(slot, message);
  }

  readiness(type, ready) {
    const message = { type, ready: [...ready].sort() };
    for (let slot = 0; slot < 2; slot++) this.emit(slot, message);
  }

  receive(slot, message) {
    if (this.closed || !validSlot(slot) || !this.players[slot]?.connected || !message ||
      typeof message !== 'object' || Array.isArray(message) || !MESSAGES.has(message.type)) return;
    this.tick();
    if (message.type === 'ping') {
      if (Number.isFinite(message.at)) this.emit(slot, { type: 'pong', at: message.at });
      return;
    }
    if (message.type === 'leave') { this.depart(slot, true); return; }
    const state = this.state;
    if (!state) return;
    if (message.type === 'input') {
      if (!['serve', 'rally'].includes(state.phase)) return;
      let x = clamp(message.x, -1, 1), z = clamp(message.z, -1, 1);
      const length = Math.hypot(x, z);
      if (length > 1) { x /= length; z /= length; }
      const previous = this.inputs[slot], now = this.lastTick;
      let shot = previous.shot || null;
      let aim = shot ? previous.aim : clamp(message.aim, -1, 1);
      let aimDepth = shot ? previous.aimDepth : clamp(message.aimDepth, -1, 1);
      let charge = shot ? previous.charge : clamp(message.charge, 0, 1);
      if (!shot && SHOTS.has(message.shot) && now - this.lastShot[slot] >= SHOT_INTERVAL_MS) {
        shot = message.shot; aim = clamp(message.aim, -1, 1);
        aimDepth = clamp(message.aimDepth, -1, 1); charge = clamp(message.charge, 0, 1);
        this.lastShot[slot] = now;
      }
      this.inputs[slot] = { x, z, aim, aimDepth, charge, shot,
        prepare: SHOTS.has(message.prepare) ? message.prepare : null };
      this.lastInput[slot] = now;
    } else if (message.type === 'pause') {
      if (!pauseMatch(state, slot)) {
        this.emit(slot, { type: 'error', message: '本局暂停已用过，或当前不能暂停' }); return;
      }
      this.resumeReady.clear(); this.inputs = [{}, {}];
      this.readiness('resumeReady', this.resumeReady); this.broadcast();
    } else if (message.type === 'suspend') {
      this.freeze(slot); this.broadcast();
    } else if (message.type === 'resume') {
      if (state.phase !== 'paused') {
        this.emit(slot, { type: 'error', message: '当前不是暂停状态' }); return;
      }
      if (!this.players.every(player => player?.connected)) {
        this.emit(slot, { type: 'error', message: '对方已断开，请重新约战' }); return;
      }
      this.resumeReady.add(slot); this.readiness('resumeReady', this.resumeReady);
      if (this.resumeReady.size === 2) resumeMatch(state);
      this.inputs = [{}, {}]; this.broadcast();
    } else if (message.type === 'rematch' && state.phase === 'over') {
      if (!this.players.every(player => player?.connected)) {
        this.emit(slot, { type: 'error', message: '对方已离开，请重新约战' }); return;
      }
      this.rematch.add(slot); this.readiness('rematch', this.rematch);
      if (this.rematch.size === 2) {
        this.matchId++; this.startMatch();
        this.readiness('resumeReady', this.resumeReady); this.broadcast();
      }
    }
  }

  freeze(slot) {
    this.resumeReady.clear(); this.inputs = [{}, {}];
    this.readiness('resumeReady', this.resumeReady);
    const state = this.state;
    if (!state || state.phase === 'over' || state.phase === 'paused') return;
    if (state.phase === 'countdown') {
      state.phase = 'paused'; state.timer = state.pause.remaining;
      state.message = '比赛暂停 · 等待双方重新准备';
    } else if (!pauseMatch(state, slot)) {
      finishMatch(state, scoreWinner(state), '暂停次数已用完，本局按当前比分结束');
    }
  }

  depart(slot, leaving) {
    if (this.closed || !validSlot(slot) || !this.players[slot]?.connected) return;
    if (leaving) this.players[slot] = null;
    else this.players[slot].connected = false;
    this.inputs = [{}, {}]; this.resumeReady.clear(); this.rematch.clear();
    if (this.state && this.state.phase !== 'over') {
      this.abandoned = true;
      finishMatch(this.state, null, leaving ? '球友已离开，本局结束' : '球友连接已断开，本局结束，请重新约战');
    }
    this.announce(); this.broadcast();
  }

  disconnect(slot) {
    if (this.closed || !validSlot(slot) || !this.players[slot]?.connected) return;
    this.tick(); this.depart(slot, false);
  }

  tick() {
    if (this.closed || this.ticking) return;
    this.ticking = true;
    try {
      const reading = this.now();
      const now = Number.isFinite(reading) ? Math.max(this.lastTick, reading) : this.lastTick;
      const elapsed = now - this.lastTick;
      this.lastTick = now;
      if (elapsed > MAX_CATCHUP_MS) {
        // A background phone must not replay minutes of unobserved gameplay on wake.
        this.accumulator = 0;
        if (this.state && this.state.phase !== 'over') { this.freeze(0); this.broadcast(); }
        return;
      }
      this.accumulator += elapsed;
      for (let slot = 0; slot < 2; slot++) {
        if (now - this.lastInput[slot] > INPUT_TIMEOUT_MS) this.inputs[slot] = {};
      }
      let snapshotDue = false;
      while (this.accumulator + 1e-6 >= STEP_MS) {
        this.accumulator = Math.max(0, this.accumulator - STEP_MS);
        this.tickCount++;
        if (this.state) {
          stepMatch(this.state, this.inputs, STEP_MS / 1000);
          for (const input of this.inputs) input.shot = null;
        }
        if (this.tickCount % 3 === 0) snapshotDue = true;
      }
      // Coalesce missed frames into one current snapshot, including under short stalls.
      if (snapshotDue) this.broadcast();
    } finally { this.ticking = false; }
  }

  close() {
    if (this.closed) return;
    this.closed = true; this.send = null; this.state = null; this.players = [null, null];
    this.inputs = [{}, {}]; this.resumeReady.clear(); this.rematch.clear(); this.accumulator = 0;
  }
}
