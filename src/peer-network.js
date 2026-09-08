import { PeerMatch } from './peer-match.js';
import { ROLES } from '../shared/game.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'rally-badminton-v2-';
const VERSION = 1;
const OPEN_TIMEOUT = 20000;
const HANDSHAKE_TIMEOUT = 12000;
const MAX_MESSAGE = 65536;
const MAX_INPUT = 2048;
const SOFT_BUFFER = 65536;
const HARD_BUFFER = 1048576;
const SHOTS = new Set(['clear', 'drop', 'smash']);
const COMMANDS = new Set(['pause', 'suspend', 'resume', 'rematch', 'leave']);
const PHASES = new Set(['serve', 'rally', 'point', 'intermission', 'paused', 'countdown', 'over']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = Number.isFinite;
const slot = value => value === 0 || value === 1;
const nullableSlot = value => value === null || slot(value);
const scorePair = value => Array.isArray(value) && value.length === 2 && value.every(n => Number.isInteger(n) && n >= 0);

export function normalizeRoomCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) throw new Error('请输入有效的 5 位房间码（不含 0、O、1、I）');
  return code;
}

export function generateRoomCode() {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  // The alphabet has exactly 32 characters, so the modulo has no sampling bias.
  return Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join('');
}

function publicProfile(source) {
  return {
    name: typeof source?.name === 'string' ? Array.from(source.name.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()).slice(0, 16).join('') || '球友' : '球友',
    role: typeof source?.role === 'string' && Object.hasOwn(ROLES, source.role) ? source.role : 'balanced',
    playerId: typeof source?.playerId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(source.playerId) ? source.playerId : null,
  };
}

// Check before stringify: cyclic, deeply nested or non-JSON caller data must not
// reach either the serializer or the renderer. PeerJS's JSON channel is bounded
// again after deserialization because a remote peer is not trusted.
function withinLimit(value, maximum) {
  if (!record(value)) return false;
  const stack = [[value, 0]], seen = new Set();
  let count = 0;
  while (stack.length) {
    const [item, depth] = stack.pop();
    if (++count > 4096 || depth > 12) return false;
    if (item === null || typeof item === 'boolean') continue;
    if (typeof item === 'number') { if (!finite(item)) return false; continue; }
    if (typeof item === 'string') { if (item.length > maximum) return false; continue; }
    if (typeof item !== 'object' || seen.has(item)) return false;
    seen.add(item);
    const values = Object.values(item);
    if (values.length > (Array.isArray(item) ? 512 : 100)) return false;
    for (const child of values) stack.push([child, depth + 1]);
  }
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maximum; } catch { return false; }
}

function commandOf(message) {
  if (!withinLimit(message, MAX_INPUT) || typeof message.type !== 'string') return null;
  if (COMMANDS.has(message.type)) return { type: message.type };
  if (message.type === 'ping') return finite(message.at) ? { type: 'ping', at: message.at } : null;
  if (message.type !== 'input') return null;
  const output = { type: 'input' };
  for (const key of ['x', 'z', 'aim', 'aimDepth', 'charge']) {
    if (message[key] === undefined) continue;
    if (!finite(message[key])) return null;
    output[key] = message[key];
  }
  for (const key of ['shot', 'prepare']) {
    if (message[key] === undefined) continue;
    if (message[key] !== null && !SHOTS.has(message[key])) return null;
    output[key] = message[key];
  }
  return output;
}

function validRoom(message, code) {
  return message.type === 'room' && message.code === code && message.slot === 1 &&
    typeof message.sessionId === 'string' && message.sessionId.length > 0 && message.sessionId.length <= 128 &&
    ['quick', 'standard21'].includes(message.ruleset) && [5, 11, 21].includes(message.target) &&
    (message.rules === undefined || record(message.rules) && ['none', 'father-son'].includes(message.rules.finale)) &&
    Array.isArray(message.players) && message.players.length === 2 && message.players.every(player => player === null ||
      record(player) && typeof player.name === 'string' && player.name.length <= 64 &&
      Object.hasOwn(ROLES, player.role) && typeof player.connected === 'boolean' &&
      (player.playerId === null || typeof player.playerId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(player.playerId)));
}

function validState(message, sessionId) {
  const state = message.state;
  return message.sessionId === sessionId && Number.isSafeInteger(message.seq) && message.seq > 0 &&
    Number.isSafeInteger(message.matchId) && message.matchId > 0 && finite(message.serverTime) && record(state) &&
    PHASES.has(state.phase) && finite(state.time) && finite(state.timer) &&
    ['quick', 'standard21'].includes(state.ruleset) && [5, 11, 21].includes(state.target) &&
    scorePair(state.score) && scorePair(state.games) && Array.isArray(state.gameScores) && state.gameScores.every(scorePair) &&
    Number.isInteger(state.gameNumber) && state.gameNumber >= 1 && slot(state.server) && nullableSlot(state.winner) &&
    typeof state.message === 'string' && ['rally', 'hitId', 'pointId'].every(key => finite(state[key])) &&
    record(state.sideChange) && finite(state.sideChange.id) && finite(state.sideChange.at) &&
    Array.isArray(state.sideChange.ends) && state.sideChange.ends.length === 2 && state.sideChange.ends.every(end => end === 1 || end === -1) &&
    (state.rallyEnd === null || record(state.rallyEnd) && ['at', 'x', 'y', 'z'].every(key => finite(state.rallyEnd[key]))) &&
    (state.lastShotInfo === null || record(state.lastShotInfo) && finite(state.lastShotInfo.at) && slot(state.lastShotInfo.side) &&
      record(state.lastShotInfo.quality) && typeof state.lastShotInfo.quality.reason === 'string') &&
    Array.isArray(state.players) && state.players.length === 2 && state.players.every(player => record(player) &&
      ['x', 'z', 'vx', 'vz', 'stamina', 'swing', 'cooldown', 'actionId'].every(key => finite(player[key])) && Object.hasOwn(ROLES, player.role) &&
      (player.action === null || record(player.action) && ['startedAt', 'endsAt'].every(key => finite(player.action[key])))) &&
    record(state.shuttle) && ['x', 'y', 'z', 'vx', 'vy', 'vz'].every(key => finite(state.shuttle[key])) &&
    typeof state.shuttle.active === 'boolean' && nullableSlot(state.shuttle.lastHit) &&
    record(state.pause) && nullableSlot(state.pause.by) && finite(state.pause.remaining) && scorePair(state.pause.used);
}

function serviceError(error) {
  switch (error?.type) {
    case 'peer-unavailable': return new Error('未找到房间，请检查房间码，并确认房主仍在房间中');
    case 'browser-incompatible': return new Error('当前浏览器不支持手机直连，请使用较新的 Safari、Chrome 或 Edge');
    case 'webrtc': return new Error('手机直连失败，请确认双方连接同一 Wi-Fi 或热点后重试');
    case 'unavailable-id': return new Error('房间码暂时冲突，请重新创建房间');
    default: return new Error('无法连接公共配对服务，请检查互联网连接后重试');
  }
}

async function defaultPeerFactory(signal) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error, factory) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(factory);
    };
    const abort = () => finish(new Error('已取消连接'));
    const timer = setTimeout(() => finish(new Error('手机直连组件加载超时，请联网刷新页面后重试')), OPEN_TIMEOUT);
    signal?.addEventListener('abort', abort, { once: true });
    import('../vendor/peerjs.min.js').then(() => {
      const Peer = globalThis.Peer || globalThis.peerjs?.Peer;
      if (typeof Peer !== 'function') { finish(new Error('手机直连组件加载失败，请联网刷新页面后重试')); return; }
      finish(null, (id, options) => id ? new Peer(id, options) : new Peer(options));
    }, () => finish(new Error('手机直连组件加载失败，请联网刷新页面后重试')));
  });
}

/** Public cloud performs pairing only; slot 0 runs the authoritative match. */
export async function openPeerRoom({ type, code, name, role, playerId, target = 5, ruleset = 'quick', finale = 'none',
  onMessage = () => {}, onClose = () => {}, onStatus = () => {}, signal, peerFactory } = {}) {
  if (type !== 'create' && type !== 'join') throw new Error('请选择创建房间或加入房间');
  const isHost = type === 'create';
  let roomCode = isHost ? code ? normalizeRoomCode(code) : generateRoomCode() : normalizeRoomCode(code);
  if (signal?.aborted) throw new Error('已取消连接');
  const factory = peerFactory || await defaultPeerFactory(signal);
  if (signal?.aborted) throw new Error('已取消连接');
  const profile = publicProfile({ name, role, playerId });

  return new Promise((resolve, reject) => {
    let peer, match, connection, tickTimer, openTimer;
    let ended = false, settled = false, joined = false, accepted = false, sessionId = null, attempts = 0;
    const timers = new Set(), listeners = new Set(), connections = new Set(), attemptedCodes = new Set();
    const stats = { sent: 0, received: 0, dropped: 0 };
    const status = message => { if (!ended) { try { onStatus(message); } catch {} } };
    const later = (callback, ms) => {
      const timer = setTimeout(() => { timers.delete(timer); if (!ended) callback(); }, ms);
      timers.add(timer); return timer;
    };
    const cancel = timer => { clearTimeout(timer); timers.delete(timer); };
    const listen = (source, event, handler) => {
      const guarded = (...args) => { if (!ended) handler(...args); };
      source.on(event, guarded);
      const remove = () => { source.off?.(event, guarded); if (!source.off) source.removeListener?.(event, guarded); listeners.delete(remove); };
      listeners.add(remove); return remove;
    };
    const cleanup = () => {
      if (ended) return;
      ended = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear(); clearInterval(tickTimer);
      signal?.removeEventListener('abort', abort);
      for (const remove of [...listeners]) remove();
      match?.close();
      for (const current of connections) { try { current.close(); } catch {} }
      connections.clear();
      try { peer?.destroy(); } catch {}
    };
    const fail = error => {
      if (ended) return;
      const wasSettled = settled; cleanup();
      if (wasSettled) { try { onClose(error); } catch {} } else reject(error);
    };
    const abort = () => {
      if (settled) cleanup(); else fail(new Error('已取消连接'));
    };
    const deliver = message => {
      if (ended) return;
      try { onMessage(message); } catch { fail(new Error('处理比赛消息失败，请退出房间后重新约战')); }
    };
    const complete = () => {
      if (ended || settled) return;
      settled = true; cancel(openTimer); resolve(session);
    };
    const sendData = (current, message) => {
      if (ended || !current?.open) return false;
      const bytes = current.dataChannel?.bufferedAmount || 0, queued = current.bufferSize || 0;
      if (bytes > HARD_BUFFER || queued > 64) { fail(new Error('直连数据积压，连接已结束，请检查 Wi-Fi 后重新约战')); return false; }
      if ((message.type === 'state' || message.type === 'input') && (bytes > SOFT_BUFFER || queued > 0)) { stats.dropped++; return false; }
      try { current.send(message); stats.sent++; return true; }
      catch { fail(new Error('手机直连已断开，请重新约战')); return false; }
    };
    const session = {
      isHost,
      send(message) {
        if (ended || !settled) return false;
        const command = commandOf(message); if (!command) return false;
        if (isHost) {
          try { match.receive(0, command); } catch { fail(new Error('比赛运行失败，请重新约战')); return false; }
          if (command.type === 'leave') cleanup();
          return true;
        }
        const sent = sendData(connection, command);
        if (command.type === 'leave') cleanup();
        return sent;
      },
      close() { cleanup(); },
      async getStats() {
        const result = { ...stats, isHost, code: roomCode, connected: !ended && !!connection?.open,
          signalingConnected: !ended && !!peer?.open && !peer?.disconnected,
          bufferedAmount: connection?.dataChannel?.bufferedAmount || 0 };
        try {
          const values = await connection?.peerConnection?.getStats();
          if (values) result.candidatePairs = [...values.values()].filter(value => value.type === 'candidate-pair' && value.state === 'succeeded')
            .map(value => ({ nominated: value.nominated, currentRoundTripTime: value.currentRoundTripTime,
              bytesSent: value.bytesSent, bytesReceived: value.bytesReceived }));
        } catch {}
        return result;
      },
    };

    function channelLost(current) {
      connections.delete(current);
      if (connection !== current) return;
      if (isHost && !joined) { connection = null; return; }
      if (isHost) { try { match?.disconnect(1); } catch {} }
      fail(new Error('对方已离开或手机直连已断开，房间已结束，请重新约战'));
    }

    function acceptConnection(current) {
      if (connections.size >= 8) { current.close(); return; }
      connections.add(current);
      const extra = isHost && (!!connection || !match);
      if (!extra) connection = current;
      let helloSeen = false, opened = false, rejected = false, closeTimer;
      const channelListeners = [];
      const onChannel = (event, handler) => channelListeners.push(listen(current, event, handler));
      let receivedAt = performance.now(), receivedCount = 0;
      const handshakeTimer = later(() => {
        if (extra || isHost && !helloSeen) { current.close(); return; }
        fail(new Error('手机直连握手超时，请确认双方连接同一 Wi-Fi 或热点后重试'));
      }, HANDSHAKE_TIMEOUT);
      const rejectChannel = message => {
        if (rejected) return;
        rejected = true;
        sendData(current, { type: 'rally-reject', version: VERSION, message });
        cancel(handshakeTimer);
        // Let the reliable channel deliver the explanation before closing it.
        closeTimer = later(() => { current.close(); }, 250);
      };
      onChannel('close', () => {
        cancel(handshakeTimer); cancel(closeTimer);
        for (const remove of channelListeners) remove();
        channelLost(current);
      });
      onChannel('error', () => { current.close(); });
      onChannel('data', message => {
        if (rejected || extra) return;
        stats.received++;
        if (performance.now() - receivedAt > 1000) { receivedAt = performance.now(); receivedCount = 0; }
        if (++receivedCount > 150) { current.close(); return; }
        if (!withinLimit(message, isHost ? MAX_INPUT : MAX_MESSAGE)) {
          if (isHost && !helloSeen) rejectChannel('无法识别的直连握手');
          else fail(new Error('收到无效比赛消息，房间已结束'));
          return;
        }
        if (isHost) {
          if (!helloSeen) {
            if (message.type !== 'rally-hello' || message.version !== VERSION || !record(message.profile)) {
              rejectChannel('双方游戏版本或直连协议不同，请联网刷新后重试'); return;
            }
            if (match.rules.finale === 'father-son' && message.finale !== 'father-son') {
              rejectChannel('父子局需要双方更新游戏，请联网刷新后重试；普通对局可继续使用'); return;
            }
            helloSeen = true; cancel(handshakeTimer);
            if (!sendData(current, { type: 'rally-accept', version: VERSION })) return;
            try { joined = true; match.join(publicProfile(message.profile)); status('手机直连已建立'); }
            catch (error) { joined = false; rejectChannel(error.message || '房间已满或比赛已开始'); }
            return;
          }
          const command = commandOf(message); if (!command) return;
          try { match.receive(1, command); } catch { fail(new Error('比赛运行失败，请重新约战')); return; }
          if (command.type === 'leave') channelLost(current);
        } else {
          if (message.type === 'rally-reject') { fail(new Error(typeof message.message === 'string' ? message.message.slice(0, 160) : '对方拒绝了连接')); return; }
          if (!accepted) {
            if (message.type !== 'rally-accept' || message.version !== VERSION) { fail(new Error('双方直连协议不同或握手无效，请联网刷新后重试')); return; }
            accepted = true; return;
          }
          if (message.type === 'room') {
            if (!validRoom(message, roomCode) || sessionId && message.sessionId !== sessionId ||
              !settled && !message.players.every(player => player?.connected)) { fail(new Error('收到无效房间信息，请退出后重新约战')); return; }
            sessionId = message.sessionId; cancel(handshakeTimer);
            deliver(message); complete(); status('手机直连已建立'); return;
          }
          if (!settled) { fail(new Error('直连握手缺少房间信息，请重试')); return; }
          if (message.type === 'state' && validState(message, sessionId) ||
              message.type === 'pong' && finite(message.at) ||
              ['resumeReady', 'rematch'].includes(message.type) && Array.isArray(message.ready) && message.ready.length <= 2 && message.ready.every(slot => slot === 0 || slot === 1) ||
              message.type === 'error' && typeof message.message === 'string' && message.message.length <= 160) deliver(message);
          else fail(new Error('收到无效比赛消息，房间已结束'));
        }
      });
      const openedChannel = () => {
        if (opened || ended) return; opened = true;
        if (extra) { rejectChannel('房间已满或比赛已开始'); return; }
        // Advertise support separately from the host's selected room mode.
        if (!isHost) sendData(current, { type: 'rally-hello', version: VERSION, profile, finale: 'father-son' });
      };
      onChannel('open', openedChannel);
      if (current.open) openedChannel();
    }

    function register() {
      if (ended) return;
      attempts++; attemptedCodes.add(roomCode);
      let current;
      try { current = factory(isHost ? PREFIX + roomCode : undefined, { secure: true, debug: 0 }); }
      catch (error) { fail(serviceError(error)); return; }
      peer = current;
      const currentListeners = [];
      const on = (event, handler) => currentListeners.push(listen(current, event, (...args) => { if (peer === current) handler(...args); }));
      on('connection', incoming => { if (isHost) acceptConnection(incoming); else incoming.close(); });
      on('call', incoming => incoming.close());
      on('error', error => {
        if (isHost && !settled && error?.type === 'unavailable-id' && attempts < 5) {
          for (const remove of currentListeners) remove();
          current.destroy();
          for (let tries = 0; tries < 16; tries++) { roomCode = generateRoomCode(); if (!attemptedCodes.has(roomCode)) break; }
          if (attemptedCodes.has(roomCode)) { fail(new Error('房间码生成失败，请重新创建')); return; }
          register(); return;
        }
        if (connection?.open && joined || connection?.open && accepted && settled) {
          if (['network', 'disconnected', 'socket-error', 'socket-closed', 'server-error'].includes(error?.type)) {
            status('公共配对服务已断开，现有手机直连继续'); return;
          }
          // PeerJS forwards negotiation errors without a connection id. They
          // may belong to an unsolicited extra guest. The selected channel's
          // own close/error events are authoritative for an established match.
          if (['peer-unavailable', 'webrtc'].includes(error?.type)) return;
        }
        fail(serviceError(error));
      });
      on('disconnected', () => {
        if (connection?.open && (joined || settled && accepted)) status('公共配对服务已断开，现有手机直连继续');
        else fail(new Error('公共配对服务已断开，请重新创建或加入房间'));
      });
      on('close', () => fail(new Error('手机直连已关闭，请重新约战')));
      let registered = false;
      const openedPeer = () => {
        if (registered || ended) return; registered = true;
        if (isHost) {
          try {
            match = new PeerMatch({ code: roomCode, host: profile, target, ruleset, finale,
              send: (slot, message) => slot === 0 ? deliver(message) : sendData(connection, message) });
            match.announce();
            if (ended) return;
            tickTimer = setInterval(() => { try { match.tick(); } catch { fail(new Error('比赛运行失败，请重新约战')); } }, 1000 / 60);
            complete(); status('房间已创建，等待球友加入');
          } catch { fail(new Error('创建比赛失败，请重新创建房间')); }
        } else {
          status('正在建立手机直连…');
          try { acceptConnection(current.connect(PREFIX + roomCode, { serialization: 'json', reliable: true, label: 'rally-v2' })); }
          catch (error) { fail(serviceError(error)); }
        }
      };
      on('open', openedPeer);
      if (current.open) openedPeer();
    }
    signal?.addEventListener('abort', abort, { once: true });
    openTimer = later(() => fail(new Error(isHost ? '连接公共配对服务超时，请检查互联网连接后重试' : '手机直连超时，请检查房间码，并确认双方连接同一 Wi-Fi 或热点')), OPEN_TIMEOUT);
    status('正在连接公共配对服务…');
    register();
  });
}
