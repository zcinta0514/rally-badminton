const STORAGE_KEY = 'rally.peer-results.v1';
const MAX_RECORDS = 500, MAX_STORAGE_LENGTH = 500000;
const validId = value => typeof value === 'string' && /^[a-f0-9]{12}$/.test(value);
const validToken = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
const validMatchId = value => validToken(value) || (Number.isSafeInteger(value) && value >= 0);
const validPoints = value => Array.isArray(value) && value.length === 2
  && [value[0], value[1]].every(point => Number.isSafeInteger(point) && point >= 0 && point <= 1000);
const cleanName = value => typeof value === 'string' ? Array.from(value.slice(0, 256)
  .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()).slice(0, 16).join('') || '球友' : '球友';
const recordKey = record => JSON.stringify([record.sessionId, String(record.matchId)]);
const validPlayers = players => Array.isArray(players) && players.length === 2
  && [players[0], players[1]].every(player => validId(player?.playerId));
const DRAW_REASONS = new Set(['暂停超时 · 平分，本局不计胜负', '暂停次数已用完，本局按当前比分结束']);
const validDraw = state => state?.winner === null && validPoints(state.score)
  && state.score[0] === state.score[1] && DRAW_REASONS.has(state.message);

function matchPoints(state) {
  if (state.pointTotals !== undefined) return validPoints(state.pointTotals) ? [...state.pointTotals] : null;
  if (!validPoints(state.score)) return null;
  if (state.ruleset !== 'standard21') return [...state.score];
  const history = state.gameScores ?? state.gameHistory;
  if (!Number.isInteger(state.gameNumber) || state.gameNumber < 1 || state.gameNumber > 3
    || !Array.isArray(history) || history.length < state.gameNumber - 1 || history.length > state.gameNumber) return null;
  const total = [0, 0];
  for (let index = 0; index < history.length; index++) {
    if (!validPoints(history[index])) return null;
    for (let side = 0; side < 2; side++) total[side] += history[index][side];
  }
  // A normally completed final game is already in history. A pause timeout can
  // leave the current game's points only in score, matching the server board.
  if (history.length < state.gameNumber) for (let side = 0; side < 2; side++) total[side] += state.score[side];
  return validPoints(total) ? total : null;
}

// SHA-256, FIPS 180-4 §§4.2.2, 5, 6.2. Used only for a fixed-length identity
// digest on LAN HTTP browsers without crypto.subtle; never a credential token.
// https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function identityDigest(bytes) {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer); view.setUint32(padded.length - 4, bytes.length * 8);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64), rotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index++) {
      const x = words[index - 15], y = words[index - 2];
      words[index] = words[index - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3))
        + words[index - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[index] + words[index]) >>> 0;
      const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => { hash[index] += value; });
  }
  return Array.from(hash, word => word.toString(16).padStart(8, '0')).join('');
}

export function createPeerRecords(options = {}) {
  let storage = options.storage, writable = false, records = [];
  if (!Object.hasOwn(options, 'storage')) { try { storage = globalThis.localStorage; } catch { /* Browser privacy mode. */ } }
  try {
    writable = typeof storage?.getItem === 'function' && typeof storage?.setItem === 'function';
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw !== null && raw !== undefined) {
      if (typeof raw !== 'string' || raw.length > MAX_STORAGE_LENGTH) throw Error('Invalid local records');
      const saved = JSON.parse(raw), seen = new Set();
      if (saved?.version !== 1 || !Array.isArray(saved.records) || saved.records.length > MAX_RECORDS) throw Error('Invalid local records');
      const restored = saved.records.map(record => {
        if (!record || !validToken(record.sessionId) || !validMatchId(record.matchId) || !validPlayers(record.players)
          || record.players[0].playerId === record.players[1].playerId || !record.players.some(player => player.playerId === record.selfId)
          || ![0, 1, null].includes(record.winner) || !validPoints(record.points)
          || (record.winner !== null && record.points[0] + record.points[1] === 0)
          || seen.has(recordKey(record))) throw Error('Invalid local match');
        seen.add(recordKey(record));
        return { sessionId: record.sessionId, matchId: record.matchId, selfId: record.selfId, winner: record.winner,
          points: [...record.points], players: record.players.map(player => ({ playerId: player.playerId, name: cleanName(player.name) })) };
      });
      records = restored;
    }
  } catch { writable = false; }
  let storageMode = writable ? 'local' : 'local-memory';
  function persist() {
    if (writable) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records })); storageMode = 'local'; }
      catch { storageMode = 'local-memory'; }
    }
    return { status: storageMode };
  }
  return {
    async publicId(playerKey) {
      if (typeof playerKey !== 'string' || !/^[a-f0-9]{64}$/.test(playerKey)) throw Error('玩家身份无效');
      const bytes = new TextEncoder().encode(`rally.peer-player.v1:${playerKey}`);
      try {
        const digest = await (options.crypto ?? globalThis.crypto).subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest).slice(0, 6), byte => byte.toString(16).padStart(2, '0')).join('');
      } catch { return identityDigest(bytes).slice(0, 12); }
    },
    record(input) {
      const excluded = reason => ({ status: 'excluded', reason });
      if (!input || !validToken(input.sessionId) || !validMatchId(input.matchId)) return excluded('invalid_match');
      const { sessionId, matchId, players, state, selfId } = input;
      // A peer may leave after the final snapshot. Keep the previously settled
      // result even when the next room announcement no longer contains them.
      const saved=records.find(record=>recordKey(record)===recordKey(input));
      if(saved)return saved.selfId===selfId?{status:storageMode}:excluded('missing_identity');
      if (state?.phase !== 'over' || (![0, 1].includes(state.winner) && !validDraw(state)) || input.abandoned || state.abandoned || state.quit
        || ['quit', 'abandoned', 'disconnect'].includes(state.endReason)) return excluded('abandoned');
      if (!validPlayers(players) || !validId(selfId) || !players.some(player => player.playerId === selfId)) return excluded('missing_identity');
      if (players[0].playerId === players[1].playerId) return excluded('same_player');
      const points = matchPoints(state);
      if (!points || (state.winner !== null && points[0] + points[1] === 0)) return excluded('invalid_score');
      records.push({ sessionId, matchId, selfId, winner: state.winner, points,
        players: players.map(player => ({ playerId: player.playerId, name: cleanName(player.name) })) });
      if (records.length > MAX_RECORDS) records.shift();
      return persist();
    },
    list() {
      const players = new Map();
      for (const record of records) record.players.forEach((player, side) => {
        const row = players.get(player.playerId) || { playerId: player.playerId, name: player.name, matches: 0, wins: 0, losses: 0, draws: 0, points: 0 };
        row.name = player.name; row.matches++; row.points += record.points[side];
        if (record.winner === null) row.draws++;
        else if (record.winner === side) row.wins++;
        else row.losses++;
        players.set(player.playerId, row);
      });
      const entries = [...players.values()].map(row => ({ ...row, winRate: row.wins / row.matches }))
        .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.points - a.points || a.playerId.localeCompare(b.playerId))
        .slice(0, 50).map((row, index) => ({ rank: index + 1, ...row }));
      return { entries, storage: storageMode };
    },
  };
}
