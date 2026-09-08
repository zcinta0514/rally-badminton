import { isExcitingPoint } from './arena-feedback.js';

// Keep URLs relative to the module so hosted subpaths and offline builds agree.
export const ARENA_AUDIO_SAMPLES = Object.freeze({
  hit: [new URL('./audio/hit-1.wav', import.meta.url), new URL('./audio/hit-2.wav', import.meta.url)],
  smash: [new URL('./audio/smash-1.wav', import.meta.url)],
  squeak: [new URL('./audio/squeak-1.wav', import.meta.url), new URL('./audio/squeak-2.wav', import.meta.url)],
  foot: [new URL('./audio/step-1.wav', import.meta.url)],
  applause: [new URL('./audio/applause.wav', import.meta.url)],
  cheer: [new URL('./audio/cheer.wav', import.meta.url)],
});

const movingPhase = phase => phase === 'serve' || phase === 'rally';
const endingPhase = phase => ['point', 'intermission', 'over'].includes(phase);
const audiblePhase = phase => movingPhase(phase) || endingPhase(phase);
const grounded = player => !(player.action?.jumpHeight > .04);
const fresh = (at, time, dt, ageLimit) => Number.isFinite(at)
  ? time - at >= -.02 && time - at <= ageLimit : dt > 0 && dt <= .25;

// Audio follows confirmed simulation events, never button presses or previews.
// The caller resets memory for a new match. Old network snapshots must never
// lower its time/ID high-water marks and make an already-heard event new again.
export function collectArenaSounds(state, memory) {
  if (!state) { for (const key of Object.keys(memory)) delete memory[key]; return []; }
  const time = state.time;
  if (!Number.isFinite(time) || !Array.isArray(state.players)) return [];
  const initialized = memory.hit !== undefined, dt = time - memory.time;
  if (initialized && (dt < 0 || state.hitId < memory.hit || state.pointId < memory.point)) return [];
  const events = [], moving = movingPhase(state.phase), samePoint = state.pointId === memory.point;
  if (initialized && dt > 0 && audiblePhase(state.phase)) {
    if (state.hitId > memory.hit && fresh(state.lastShotInfo?.at, time, dt, .22)) {
      events.push({ type: 'hit', shot: state.lastShot });
    }
    if (state.pointId > memory.point && endingPhase(state.phase) && fresh(state.rallyEnd?.at, time, dt, .65)) {
      events.push({ type: 'score', exciting: isExcitingPoint(state) });
    }
  }
  if (!initialized) {
    memory.travel = state.players.map(() => 0);
    memory.lastFoot = state.players.map(() => -Infinity);
    memory.lastSqueak = state.players.map(() => -Infinity);
  }
  // A duplicate display frame has no movement. Phase/ID changes at frozen time
  // still enter memory so pause and countdown cannot replay contacts on resume.
  if (initialized && dt === 0 && state.phase === memory.phase && state.hitId === memory.hit && samePoint) return events;
  const continuous = initialized && dt > 0 && dt <= .25 && moving && memory.moving && samePoint;
  const positions = state.players.map((p, side) => {
    const current = { x: p.x, z: p.z, vx: p.vx || 0, vz: p.vz || 0, grounded: grounded(p) };
    const previous = memory.positions?.[side];
    const distance = previous ? Math.hypot(p.x - previous.x, p.z - previous.z) : 0;
    const speed = Math.hypot(current.vx, current.vz), before = previous ? Math.hypot(previous.vx, previous.vz) : 0;
    const serveLock = state.phase === 'serve' && p.pendingShot?.contactAt !== undefined;
    const plausible = distance <= Math.max(.16, Math.max(speed, before) * dt * 1.8 + .05);
    if (!continuous || !current.grounded || !previous?.grounded || !plausible || serveLock) {
      memory.travel[side] = 0; return current;
    }
    const loss = before - speed;
    const cosine = before * speed > .01 ? (previous.vx * current.vx + previous.vz * current.vz) / (before * speed) : 1;
    const sideways = before > 0 ? Math.abs(previous.vx * current.vz - previous.vz * current.vx) / before / dt : 0;
    const braking = loss >= Math.max(.08, 12 * dt);
    const turning = speed >= 1.6 && cosine < .97 && sideways >= 12;
    if (before >= 2 && (braking || turning) && time - memory.lastSqueak[side] >= .3) {
      events.push({ type: 'squeak', side }); memory.lastSqueak[side] = time;
      memory.travel[side] = 0; memory.lastFoot[side] = time;
    } else if (speed > .45) {
      memory.travel[side] += distance;
      if (memory.travel[side] >= .65 && time - memory.lastFoot[side] >= .24) {
        events.push({ type: 'foot', side }); memory.lastFoot[side] = time;
        memory.travel[side] %= .65;
      }
    } else memory.travel[side] = 0;
    return current;
  });
  Object.assign(memory, { hit: state.hitId, point: state.pointId, time, positions, moving, phase: state.phase });
  return events;
}

const MAX_VOICES = 12;
const MASTER_GAIN = .6;

export class ArenaAudio {
  constructor(options = {}) {
    this.enabled = true; this.visible = true; this.active = false;
    this.memory = {}; this.context = null; this.master = null; this.voices = new Set();
    this.samples = new Map(); this.loading = null; this.loaded = false; this.suppressNext = false;
    this.AudioContext = options.AudioContext === undefined ? globalThis.AudioContext || globalThis.webkitAudioContext : options.AudioContext;
    this.fetch = options.fetch === undefined ? globalThis.fetch?.bind(globalThis) : options.fetch;
    this.random = options.random || Math.random;
  }

  unlock() {
    if (!this.enabled || !this.AudioContext) return Promise.resolve();
    if (this.context?.state === 'running' && this.loaded) return this.loading;
    try {
      if (!this.context) {
        const ctx = new this.AudioContext();
        this.master = ctx.createGain(); this.master.gain.value = this.visible && this.active ? MASTER_GAIN : 0;
        this.master.connect(ctx.destination); this.context = ctx;
      }
      // Resume synchronously inside the phone gesture; fetching must not delay it.
      const shouldResume = this.context.state === 'suspended' || this.context.state === 'interrupted';
      const resumed = shouldResume ? Promise.resolve(this.context.resume()).catch(() => {}) : Promise.resolve();
      if (!this.loading) this.loading = this.preload();
      return Promise.allSettled([resumed, this.loading]).then(() => {});
    } catch { return Promise.resolve(); } // Sound failures never stop a match.
  }

  async preload() {
    const ctx = this.context;
    await Promise.allSettled(Object.entries(ARENA_AUDIO_SAMPLES).map(async ([kind, urls]) => {
      const decoded = await Promise.allSettled(urls.map(async url => {
        if (!this.fetch) throw new Error('Audio fetch unavailable');
        const response = await this.fetch(url);
        if (!response.ok) throw new Error('Audio sample unavailable');
        return await ctx.decodeAudioData(await response.arrayBuffer());
      }));
      this.samples.set(kind, decoded.filter(result => result.status === 'fulfilled').map(result => result.value));
    }));
    this.loaded = true;
  }

  syncGain() {
    if (!this.context || !this.master) return;
    try {
      const at = this.context.currentTime, gain = this.master.gain;
      gain.cancelScheduledValues(at);
      gain.setValueAtTime(this.enabled && this.visible && this.active ? MASTER_GAIN : 0, at);
    } catch { /* A closed or unavailable audio device is nonfatal. */ }
  }

  setEnabled(value) {
    value = !!value;
    if (this.enabled !== value) this.suppressNext = true;
    this.enabled = value;
    if (!value) this.stopVoices();
    this.syncGain();
    if (value) void this.unlock();
  }

  setActive(value) {
    value = !!value;
    if (this.active === value) return;
    this.active = value;
    if (!value) this.stopVoices();
    this.syncGain();
  }

  setVisible(value) {
    value = !!value;
    if (this.visible === value) return;
    this.suppressNext = true;
    this.visible = value;
    if (!value) { this.stopVoices(); this.setActive(false); }
    this.syncGain();
  }

  stopVoices(group) {
    for (const voice of this.voices) {
      if (group && voice.group !== group) continue;
      try { voice.source.stop(this.context.currentTime); } catch { /* Already ended. */ }
      voice.cleanup();
    }
  }

  playBuffer(buffer, { duration, volume, group = 'court', rate = 1, frequency } = {}) {
    const ctx = this.context;
    if (!this.enabled || !this.visible || !this.active || ctx?.state !== 'running' || !buffer) return;
    const nodes = [];
    let voice;
    const cleanup = () => {
      for (const node of nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
      if (voice) this.voices.delete(voice);
    };
    try {
      while (this.voices.size >= MAX_VOICES) {
        const oldest = this.voices.values().next().value;
        try { oldest.source.stop(ctx.currentTime); } catch { /* Already ended. */ }
        oldest.cleanup();
      }
      const source = ctx.createBufferSource(); nodes.push(source);
      const gain = ctx.createGain(); nodes.push(gain);
      source.buffer = buffer; source.playbackRate.value = rate;
      let output = source;
      if (frequency) {
        const filter = ctx.createBiquadFilter(); nodes.push(filter);
        filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .65;
        source.connect(filter); output = filter;
      }
      output.connect(gain); gain.connect(this.master);
      const at = ctx.currentTime, length = Math.max(.01, Math.min(duration, buffer.duration / rate));
      const attack = group === 'reaction' ? .025 : .002;
      const fade = Math.min(length * .45, group === 'reaction' ? .24 : .035);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.linearRampToValueAtTime(volume, at + Math.min(attack, length * .15));
      gain.gain.setValueAtTime(volume, at + Math.max(attack, length - fade));
      gain.gain.exponentialRampToValueAtTime(.0001, at + length);
      voice = { source, group, cleanup }; this.voices.add(voice); source.onended = cleanup;
      source.start(at); source.stop(at + length);
    } catch { cleanup(); }
  }

  sample(kind, options) {
    const buffers = this.samples.get(kind) || [];
    if (buffers.length) {
      const buffer = buffers[Math.min(buffers.length - 1, Math.floor(this.random() * buffers.length))];
      this.playBuffer(buffer, { rate: .98 + this.random() * .04, ...options });
    } else if (this.loaded && options.group !== 'reaction') {
      // Only unavailable contact/shoe samples use quiet noise. Never fake a crowd
      // with air noise, and never queue old events while samples are downloading.
      this.burst(kind === 'foot' ? 900 : kind === 'squeak' ? 2200 : 1800,
        Math.min(options.duration, .1), options.volume * .4);
    }
  }

  burst(frequency, duration, volume) {
    if (!this.context || !this.loaded) return;
    try {
      if (!this.noise) {
        this.noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * .15), this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = this.random() * 2 - 1;
      }
      this.playBuffer(this.noise, { duration, volume, frequency });
    } catch { /* Quiet fallback is optional. */ }
  }

  hit(shot) {
    this.sample(shot === 'smash' ? 'smash' : 'hit', {
      duration: shot === 'smash' ? .2 : shot === 'drop' ? .1 : .15,
      volume: shot === 'smash' ? .75 : shot === 'drop' ? .28 : .5,
    });
  }

  update(state, visible = true) {
    this.setVisible(visible);
    const events = collectArenaSounds(state, this.memory);
    const suppress = this.suppressNext; this.suppressNext = false;
    this.setActive(visible && !!state && audiblePhase(state.phase));
    if (state?.phase === 'serve' || state?.phase === 'rally') this.stopVoices('reaction');
    if (!visible || !this.enabled || !this.active || suppress) return;
    for (const event of events) {
      if (event.type === 'hit') this.hit(event.shot);
      if (event.type === 'foot') this.sample('foot', { duration: .12, volume: .1 });
      if (event.type === 'squeak') this.sample('squeak', { duration: .23, volume: .16 });
      if (event.type === 'score') {
        this.stopVoices('reaction');
        this.sample(event.exciting ? 'cheer' : 'applause', {
          group: 'reaction', duration: event.exciting ? 1.1 : .85, volume: event.exciting ? .35 : .2,
        });
      }
    }
  }

  reset() {
    this.memory = {}; this.suppressNext = false;
    this.stopVoices(); this.setActive(false);
  }
}
