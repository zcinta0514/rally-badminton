// Audio follows confirmed simulation events, never button presses or previews.
export function collectArenaSounds(state, memory) {
  if (!state) { delete memory.hit; return []; }
  const events = [], positions = state.players.map(p => ({ x: p.x, z: p.z }));
  const reset = memory.hit === undefined || state.time < memory.time || state.hitId < memory.hit;
  const moving = ['serve', 'rally'].includes(state.phase);
  if (!reset) {
    if (state.hitId !== memory.hit) events.push({ type: 'hit', shot: state.lastShot });
    if (state.pointId !== memory.point) events.push({ type: 'score' });
    if (moving && memory.moving) state.players.forEach((p, side) => {
      const previous = memory.positions[side];
      const distance = Math.hypot(p.x - previous.x, p.z - previous.z);
      if (distance > 1 || p.action?.jumpHeight > .04) { memory.travel[side] = 0; return; }
      memory.travel[side] += distance;
      if (memory.travel[side] > .58) { memory.travel[side] %= .58; events.push({ type: 'foot', side }); }
    });
  }
  if (reset || !moving) memory.travel = [0, 0];
  Object.assign(memory, { hit: state.hitId, point: state.pointId, time: state.time, positions, moving });
  return events;
}

export class ArenaAudio {
  constructor() { this.enabled = true; this.memory = {}; this.context = null; this.active = false; }
  unlock() {
    if (!this.enabled) return;
    try {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!this.context && AudioContext) {
        const ctx = this.context = new AudioContext();
        this.master = ctx.createGain(); this.master.gain.value = .42; this.master.connect(ctx.destination);
        this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < data.length; i++) { previous = (previous + .15 * (Math.random() * 2 - 1)) / 1.15; data[i] = previous * 3; }
        this.ambience = ctx.createBufferSource(); this.ambience.buffer = this.noise; this.ambience.loop = true;
        this.airFilter = ctx.createBiquadFilter(); this.airFilter.type = 'bandpass'; this.airFilter.frequency.value = 420; this.airFilter.Q.value = .55;
        this.airGain = ctx.createGain(); this.airGain.gain.value = this.active ? .025 : 0;
        this.ambience.connect(this.airFilter); this.airFilter.connect(this.airGain); this.airGain.connect(this.master); this.ambience.start();
      }
      if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* Sound failure must not prevent a match from starting. */ }
  }
  setEnabled(value) {
    this.enabled = value;
    if (this.context) this.master.gain.setTargetAtTime(value && this.visible !== false ? .42 : 0, this.context.currentTime, .02);
    if (value) this.unlock();
  }
  setActive(value) {
    if (this.active === value) return;
    this.active = value;
    if (this.context) this.airGain.gain.setTargetAtTime(value ? .025 : 0, this.context.currentTime, .2);
  }
  setVisible(value) {
    if (this.visible !== value) this.memory = {};
    this.visible = value;
    if (this.context) this.master.gain.setTargetAtTime(value && this.enabled ? .42 : 0, this.context.currentTime, .02);
    if (!value) this.setActive(false);
  }
  burst(frequency, duration, volume, delay = 0) {
    const ctx = this.context;
    if (!this.enabled || ctx?.state !== 'running') return;
    const at = ctx.currentTime + delay, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .7;
    gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(volume, at + .008);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    source.start(at); source.stop(at + duration + .01);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  hit(shot) {
    const strength = shot === 'smash' ? 1 : shot === 'drop' ? .4 : .7;
    this.burst(shot === 'smash' ? 2100 : 1600, .11, .7 * strength);
    const ctx = this.context;
    if (!this.enabled || ctx?.state !== 'running') return;
    const osc = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime;
    osc.frequency.setValueAtTime(700 + strength * 400, at); osc.frequency.exponentialRampToValueAtTime(190, at + .065);
    gain.gain.setValueAtTime(.1 * strength, at); gain.gain.exponentialRampToValueAtTime(.001, at + .07);
    osc.connect(gain); gain.connect(this.master); osc.start(); osc.stop(at + .08);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  update(state, visible = true) {
    const events = collectArenaSounds(state, this.memory);
    this.setActive(visible && !!state && ['serve', 'rally', 'point'].includes(state.phase));
    if (!visible || !this.enabled) return;
    for (const event of events) {
      if (event.type === 'hit') this.hit(event.shot);
      if (event.type === 'foot') this.burst(1900, .075, .09);
      if (event.type === 'score') {
        this.burst(750, .85, .32);
        for (let i = 0; i < 6; i++) this.burst(1400 + i * 110, .075, .2, .06 + i * .09);
      }
    }
  }
  reset() { this.memory = {}; this.setActive(false); }
}
