import { isExcitingPoint, pointGrade } from './arena-feedback.js';
import { normalizeArenaPreferences } from './arena-preferences.js';

// Keep URLs relative to the module so hosted subpaths and offline builds agree.
export const ARENA_AUDIO_SAMPLES = Object.freeze({
  hit: ['hit-1', 'hit-2', 'hit-3', 'smash-1'].map(name => new URL('./audio/' + name + '.wav', import.meta.url)),
  smash: [new URL('./audio/smash-1.wav', import.meta.url)],
  foot: ['step-1', 'step-2', 'step-3', 'step-4'].map(name => new URL('./audio/' + name + '.wav', import.meta.url)),
  applause: ['applause', 'applause-2', 'applause-3'].map(name => new URL('./audio/' + name + '.wav', import.meta.url)),
  cheer: [new URL('./audio/cheer.wav', import.meta.url)],
  victory: [new URL('./audio/cheer-long.wav', import.meta.url)],
  finale: [new URL('./audio/finale-dad.wav', import.meta.url)],
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
      events.push({ type: 'hit', shot: state.lastShot, ...([0, 1].includes(state.lastShotInfo?.side) ? {
        side: state.lastShotInfo.side, id: state.hitId, serving: state.lastShotInfo.serving,
        position: state.lastShotInfo.contact, charge: state.lastShotInfo.charge || 0,
      } : {}) });
    }
    if (state.pointId > memory.point && endingPhase(state.phase) && fresh(state.rallyEnd?.at, time, dt, .65)) {
      events.push({ type: 'score', exciting: isExcitingPoint(state) });
      if (state.rallyEnd.grade) Object.assign(events.at(-1), { grade: pointGrade(state), id: state.pointId, side: state.rallyEnd.winner });
      if (Number.isFinite(state.rallyEnd.x)) events.push({ type: state.rallyEnd.kind === 'net' ? 'net' : 'floor', id: state.pointId, position: state.rallyEnd });
    }
    if (moving && state.phase === 'rally' && samePoint && state.rally >= 8 && (memory.rally || 0) < 8) events.push({ type: 'tension', level: 1, id: state.hitId });
    if (moving && state.phase === 'rally' && samePoint && state.rally >= 12 && (memory.rally || 0) < 12) events.push({ type: 'tension', level: 2, id: state.hitId });
  }
  if (!initialized) {
    memory.travel = state.players.map(() => 0);
    memory.lastFoot = state.players.map(() => -Infinity);
    memory.lastBrake = state.players.map(() => -Infinity);
  }
  // A duplicate display frame has no movement. Phase/ID changes at frozen time
  // still enter memory so pause and countdown cannot replay contacts on resume.
  if (initialized && dt === 0 && state.phase === memory.phase && state.hitId === memory.hit && samePoint) return events;
  const continuous = initialized && dt > 0 && dt <= .25 && moving && memory.moving && samePoint;
  const positions = state.players.map((p, side) => {
    const current = { x: p.x, z: p.z, vx: p.vx || 0, vz: p.vz || 0, grounded: grounded(p, time), actionId: p.action?.id };
    const previous = memory.positions?.[side];
    const distance = previous ? Math.hypot(p.x - previous.x, p.z - previous.z) : 0;
    const speed = Math.hypot(current.vx, current.vz), before = previous ? Math.hypot(previous.vx, previous.vz) : 0;
    const serveLock = state.phase === 'serve' && p.pendingShot?.contactAt !== undefined;
    const plausible = distance <= Math.max(.16, Math.max(speed, before) * dt * 1.8 + .05);
    if (continuous && plausible && !serveLock) {
      if (current.grounded && previous && !previous.grounded) events.push({ type: 'landing', side, position: current, id: p.actionId });
      if (p.action?.stage === 'windup' && p.action.id !== previous?.actionId && fresh(p.action.startedAt, time, dt, .22)) events.push({ type: 'swish', side, position: current, id: p.action.id });
      const turning = current.vx * previous?.vx + current.vz * previous?.vz < 0;
      if (current.grounded && previous?.grounded && before > 2.2 && (speed < 1 || turning) && time - memory.lastBrake[side] > .35) {
        events.push({ type: 'brake', side, position: current, id: state.hitId }); memory.lastBrake[side] = time;
      }
    }
    if (!continuous || !current.grounded || !previous?.grounded || !plausible || serveLock) {
      memory.travel[side] = 0; return current;
    }
    if (speed > .45) {
      memory.travel[side] += distance;
      if (memory.travel[side] >= .65 && time - memory.lastFoot[side] >= .24) {
        events.push({ type: 'foot', side, ...(Number.isFinite(p.actionId) ? { position: current, id: Math.round(time * 120) } : {}) }); memory.lastFoot[side] = time;
        memory.travel[side] %= .65;
      }
    } else memory.travel[side] = 0;
    return current;
  });
  Object.assign(memory, { hit: state.hitId, point: state.pointId, time, positions, moving, phase: state.phase, rally: state.rally });
  return events;
}

const MAX_VOICES = 12;

export class ArenaAudio {
  constructor(options = {}) {
    this.enabled = true; this.visible = true; this.active = false;
    this.memory = {}; this.context = null; this.master = null; this.voices = new Set();
    this.samples = new Map(); this.loading = null; this.loaded = false; this.suppressNext = false;
    this.AudioContext = options.AudioContext === undefined ? globalThis.AudioContext || globalThis.webkitAudioContext : options.AudioContext;
    this.fetch = options.fetch === undefined ? globalThis.fetch?.bind(globalThis) : options.fetch;
    this.random = options.random || Math.random;
    this.preferences = normalizeArenaPreferences(options.preferences);
    this.buses = {}; this.variants = new Map(); this.listener = null;
  }

  unlock() {
    if (!this.enabled || !this.AudioContext) return Promise.resolve();
    if (this.context?.state === 'running' && this.loaded) return this.loading;
    try {
      if (!this.context) {
        const ctx = new this.AudioContext();
        this.master = ctx.createGain(); this.master.gain.value = this.visible && this.active ? this.preferences.master : 0;
        this.master.connect(ctx.destination); this.context = ctx;
        for (const key of ['hits', 'movement', 'crowd', 'environment']) {
          const bus = ctx.createGain(); bus.gain.value = this.preferences[key]; bus.connect(this.master); this.buses[key] = bus;
        }
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
    const requests = new Map();
    await Promise.allSettled(Object.entries(ARENA_AUDIO_SAMPLES).map(async ([kind, urls]) => {
      const decoded = await Promise.allSettled(urls.map(async url => {
        if (!requests.has(url.href)) requests.set(url.href, (async () => {
          if (!this.fetch) throw new Error('Audio fetch unavailable');
          const response = await this.fetch(url); if (!response.ok) throw new Error('Audio sample unavailable');
          return ctx.decodeAudioData(await response.arrayBuffer());
        })());
        return requests.get(url.href);
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
      gain.setValueAtTime(this.enabled && this.visible && this.active ? this.preferences.master : 0, at);
    } catch { /* A closed or unavailable audio device is nonfatal. */ }
  }

  setPreferences(value) {
    this.preferences = normalizeArenaPreferences(value); this.syncGain();
    for (const [key, node] of Object.entries(this.buses)) {
      const at = this.context.currentTime; node.gain.cancelScheduledValues(at); node.gain.setValueAtTime(this.preferences[key], at);
    }
  }
  setListener(camera) { this.listener = camera ? { x: camera.x, z: camera.z } : null; }
  duckCrowd() {
    const at = this.context?.currentTime;
    for (const key of ['crowd', 'environment']) {
      const gain = this.buses[key]?.gain; if (!gain) continue;
      gain.cancelScheduledValues(at); gain.setValueAtTime(this.preferences[key] * .35, at);
      gain.linearRampToValueAtTime(this.preferences[key], at + .24);
    }
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

  playBuffer(buffer, { duration, volume, group = 'court', rate = 1, frequency, bus = 'hits', priority = 3, position } = {}) {
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
        const oldest = [...this.voices].sort((a, b) => a.priority - b.priority)[0];
        if (oldest.priority > priority) return;
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
      output.connect(gain);
      const listener = this.listener;
      if (position && listener && ctx.createStereoPanner) {
        const distance = Math.hypot(position.x - listener.x, position.z - listener.z);
        const forwardX = -listener.x, forwardZ = -listener.z, norm = Math.hypot(forwardX, forwardZ) || 1;
        const lateral = ((position.x - listener.x) * -forwardZ + (position.z - listener.z) * forwardX) / norm;
        const panner = ctx.createStereoPanner(); nodes.push(panner); panner.pan.value = Math.max(-.85, Math.min(.85, lateral / 6));
        gain.connect(panner); panner.connect(this.buses[bus] || this.master);
        volume *= 1 / (1 + Math.max(0, distance - 10) * .045);
      } else gain.connect(this.buses[bus] || this.master);
      const at = ctx.currentTime, length = Math.max(.01, Math.min(duration ?? buffer.duration, buffer.duration / rate));
      const attack = group === 'reaction' ? .025 : .002;
      const fade = Math.min(length * .45, group === 'reaction' ? .24 : .035);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.linearRampToValueAtTime(volume, at + Math.min(attack, length * .15));
      gain.gain.setValueAtTime(volume, at + Math.max(attack, length - fade));
      gain.gain.exponentialRampToValueAtTime(.0001, at + length);
      voice = { source, group, priority, bus, gain, cleanup }; this.voices.add(voice); source.onended = cleanup;
      source.start(at); source.stop(at + length);
    } catch { cleanup(); }
  }

  sample(kind, options) {
    const buffers = this.samples.get(kind) || [];
    if (buffers.length) {
      let index = Number.isFinite(options?.id) ? ((Math.imul(options.id + 1, 2654435761) >>> 0) % buffers.length) : Math.floor(this.random() * buffers.length);
      if (buffers.length > 1 && index === this.variants.get(kind)) index = (index + 1) % buffers.length;
      this.variants.set(kind, index);
      this.playBuffer(buffers[index], { rate: 1, ...options });
    } else if (this.loaded && (kind === 'hit' || kind === 'smash')) {
      // Only unavailable impacts use a quiet fallback. Missing footsteps and
      // crowd samples stay silent instead of adding hiss; never queue old events.
      this.burst(1800, Math.min(options.duration, .1), options.volume * .4);
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

  hit(shot, event = {}) {
    this.duckCrowd();
    this.sample('hit', {
      ...event, bus: 'hits', priority: 5,
      duration: event.serving ? .12 : shot === 'smash' ? .2 : shot === 'drop' ? .1 : .15,
      volume: (event.serving ? .25 : shot === 'smash' ? .75 : shot === 'drop' ? .28 : .5) * (1 + (event.charge || 0) * .15),
    });
  }

  playFinale(key) {
    if(!key||this.finaleKey===key)return;
    this.finaleKey=key;
    this.stopVoices('reaction');
    this.sample('finale',{group:'finale',bus:'master',priority:6,duration:1.3,volume:.85,rate:1});
  }

  update(state, visible = true) {
    this.setVisible(visible);
    const events = collectArenaSounds(state, this.memory);
    const suppress = this.suppressNext; this.suppressNext = false;
    this.setActive(visible && !!state && audiblePhase(state.phase));
    if (state?.phase === 'serve' || state?.phase === 'rally') this.stopVoices('reaction');
    if (!visible || !this.enabled || !this.active || suppress) return;
    for (const event of events) {
      if (event.type === 'hit') this.hit(event.shot, event);
      if (event.type === 'foot') this.sample('foot', { ...event, bus: 'movement', priority: 2, duration: .16, volume: .16 });
      if (['brake', 'landing', 'swish', 'net', 'floor'].includes(event.type)) this.sample(event.type, {
        ...event, bus: ['net', 'floor'].includes(event.type) ? 'hits' : 'movement', priority: 2, duration: .2, volume: .2,
      }); // Missing authentic material stays silent; manifest records the gaps.
      if (event.type === 'tension') this.sample('applause', { ...event, bus: 'crowd', priority: 1, group: 'anticipation', duration: .6, volume: event.level === 2 ? .14 : .08 });
      if (event.type === 'score') {
        this.stopVoices('reaction'); this.stopVoices('anticipation');
        const victory = ['game', 'match'].includes(event.grade);
        this.sample(victory ? 'victory' : event.exciting ? 'cheer' : 'applause', {
          id: event.id, bus: 'crowd', priority: 1, group: 'reaction', duration: victory ? event.grade === 'match' ? 3 : 2 : event.exciting ? 1.1 : .6,
          volume: victory ? .6 : event.exciting ? .4 : .2,
        });
      }
    }
  }

  reset() {
    this.variants.clear();
    this.memory = {}; this.suppressNext = false;this.finaleKey=null;
    this.stopVoices(); this.setActive(false);
  }
}
