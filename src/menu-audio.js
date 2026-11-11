import { normalizeArenaPreferences } from './arena-preferences.js';
import { LOBBY_ROTATION, LOBBY_TRACKS } from './lobby-tracks.js';

const clicks = {
  tap: [590, 275, .055],
  confirm: [790, 460, .076],
  back: [450, 205, .061],
};

// Menu sounds share the arena's unlocked context, but use their own gain. The
// arena gain is silent in the lobby and on pause and would mute menu feedback.
export class MenuAudio {
  constructor({ media, getContext, preferences, onError = () => {}, onTrack = () => {} }) {
    this.media = media;
    this.getContext = getContext;
    this.preferences = normalizeArenaPreferences(preferences);
    this.onError = onError;
    this.onTrack = onTrack;
    this.rotationIndex = 0;
    this.scene = 'lobby';
    this.visible = true;
    this.enabled = true;
    this.activated = false;
    this.source = null;
    this.localUrl = null;
    this.usingLocal = false;
    this.lastClick = -Infinity;
    this.media?.addEventListener('error', () => {
      if (this.media.error) this.onError('无法播放这首曲子，请切换曲目或选择其他音频。');
    });
    this.media?.addEventListener('ended', () => {
      if (this.usingLocal || this.preferences.musicTrack !== 'rotation' || !this.media.ended) return;
      this.rotationIndex = (this.rotationIndex + 1) % LOBBY_ROTATION.length;
      this.sync();
    });
  }

  activate() {
    if (!this.enabled || !this.visible) return;
    if (this.activated && (this.scene === 'match' || !this.media?.paused)) return;
    this.activated = true;
    this.sync();
  }

  setScene(scene) {
    if (this.scene === scene) return;
    this.scene = scene;
    this.sync();
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.sync();
    this.syncClickGain();
  }

  setVisible(visible) {
    if (this.visible === visible) return;
    this.visible = visible;
    this.sync();
    this.syncClickGain();
  }

  setPreferences(preferences, useLocal = this.usingLocal) {
    const before = this.preferences;
    const sourceChanged = this.usingLocal !== Boolean(useLocal && this.localUrl);
    this.usingLocal = Boolean(useLocal && this.localUrl);
    this.preferences = normalizeArenaPreferences(preferences);
    if (sourceChanged || before.music !== this.preferences.music || before.master !== this.preferences.master ||
        before.musicTrack !== this.preferences.musicTrack) this.sync();
    this.syncClickGain();
  }

  importLocal(file) {
    if (!file || !file.size || (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(file.name))) {
      this.onError('请选择 MP3、M4A、WAV 等音频文件。');
      return false;
    }
    const old = this.localUrl;
    this.localUrl = URL.createObjectURL(file);
    this.selectLocal(true);
    if (old) URL.revokeObjectURL(old);
    return true;
  }

  selectLocal(useLocal) {
    this.usingLocal = Boolean(useLocal && this.localUrl);
    this.sync();
  }

  sync() {
    const context = this.getContext();
    if (!this.media || !context || !this.activated) return;
    const volume = this.preferences.master * this.preferences.music;
    if (!this.enabled || !this.visible || !volume || this.scene === 'match') {
      this.media.pause();
      if (this.musicGain) this.setGain(this.musicGain, 0);
      return;
    }
    try {
      if (!this.musicGain) {
        this.musicGain = context.createGain();
        this.musicGain.gain.value = 0;
        context.createMediaElementSource(this.media).connect(this.musicGain);
        this.musicGain.connect(context.destination);
      }
      const rotation = !this.usingLocal && this.preferences.musicTrack === 'rotation';
      const id = rotation ? LOBBY_ROTATION[this.rotationIndex] : this.preferences.musicTrack;
      const track = LOBBY_TRACKS[id];
      const source = this.usingLocal ? this.localUrl : new URL(`./audio/${track.file}`, import.meta.url).href;
      this.media.loop = !rotation;
      if (source !== this.source) {
        this.media.pause();
        this.setGain(this.musicGain, 0);
        this.media.src = source;
        this.source = source;
        this.onTrack(this.usingLocal ? '本机音频' : track.title);
      }
      this.setGain(this.musicGain, volume, .25);
      if (this.media.paused) void this.media.play().catch(() => {});
    } catch { /* An unavailable device leaves the game usable. */ }
  }

  setGain(node, value, seconds = 0) {
    const at = this.getContext().currentTime;
    const gain = node.gain;
    if (seconds && typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(at);
    else {
      gain.cancelScheduledValues(at);
      if (seconds) gain.setValueAtTime(gain.value, at);
    }
    if (seconds) gain.linearRampToValueAtTime(value, at + seconds);
    else gain.setValueAtTime(value, at);
  }

  syncClickGain() {
    if (!this.clickGain) return;
    this.setGain(this.clickGain, this.enabled && this.visible ? this.preferences.master * this.preferences.ui : 0);
  }

  playClick(kind = 'tap') {
    const context = this.getContext();
    if (!this.enabled || !this.visible || !this.activated || !context ||
        !this.preferences.master || !this.preferences.ui || performance.now() - this.lastClick < 35) return;
    try {
      if (!this.clickGain) {
        this.clickGain = context.createGain();
        this.clickGain.connect(context.destination);
        this.syncClickGain();
      }
      this.clickVoice?.stop();
      this.lastClick = performance.now();
      const [start, end, length] = clicks[kind] ?? clicks.tap;
      const at = context.currentTime;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(start, at);
      oscillator.frequency.exponentialRampToValueAtTime(end, at + length * .7);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(.32, at + .004);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + length);
      oscillator.connect(envelope);
      envelope.connect(this.clickGain);
      this.clickVoice = oscillator;
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        if (this.clickVoice === oscillator) this.clickVoice = null;
      };
      oscillator.start(at);
      oscillator.stop(at + length);
    } catch { /* Interface feedback is optional when audio is unavailable. */ }
  }
}

const back = '#entry-back, #back-menu, #leave-game, [data-close], [data-action="cancel"]';
const confirm = '#start-ai-confirm, #start-hell-confirm, #create-room, #join-room, #room-ready, #rematch, #resume, #arena-reset, [data-action="save"]';

export function interfaceSound(target) {
  const button = target?.closest?.('button, summary');
  if (!button || button.disabled || button.closest('[hidden], [inert]') ||
      button.matches('[aria-disabled="true"], [data-shot], #sound')) return null;
  if (button.matches(back)) return 'back';
  if (button.matches(confirm)) return 'confirm';
  return 'tap';
}
