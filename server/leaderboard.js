import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export const validPlayerKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const playerIdentity = value => validPlayerKey(value) ? createHash('sha256').update(value).digest('hex') : null;
export const cleanName = value => typeof value === 'string'
  ? Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()).slice(0, 16).join('') || '球友' : '球友';
const count = value => Number.isSafeInteger(value) && value >= 0;
const publicRow = row => ({playerId:row.identity.slice(0, 12), name:row.name, matches:row.matches,
  wins:row.wins, losses:row.losses, draws:row.draws, points:row.points, winRate:row.matches ? row.wins / row.matches : 0});
const order = (a, b) => b.wins - a.wins || b.winRate - a.winRate || b.points - a.points || a.playerId.localeCompare(b.playerId);

function matchPoints(state) {
  if (state.ruleset !== 'standard21') return [...state.score];
  const completed = state.gameScores.slice(0, state.gameNumber);
  const total = completed.reduce((sum, score) => sum.map((points, side) => points + score[side]), [0, 0]);
  // A normal final game is already in gameScores; a pause timeout can end a
  // partially played game, whose points still live only in state.score.
  if (completed.length < state.gameNumber) for (let side = 0; side < 2; side++) total[side] += state.score[side];
  return total;
}

export class Leaderboard {
  players = new Map();
  pending = Promise.resolve();
  writeBlocked = false;
  constructor({filePath = null, onError = error => console.error('Leaderboard storage:', error.message)} = {}) {
    this.filePath = filePath; this.onError = onError; this.storage = filePath ? 'persistent' : 'memory';
    if (!filePath) return;
    try {
      const saved = JSON.parse(readFileSync(filePath, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.players)) throw new Error('Invalid leaderboard file');
      for (const row of saved.players) {
        if (!row || typeof row.identity !== 'string' || !/^[a-f0-9]{64}$/.test(row.identity)
          || typeof row.name !== 'string' || !['matches','wins','losses','draws','points'].every(key => count(row[key]))
          || row.matches !== row.wins + row.losses + row.draws || this.players.has(row.identity)) throw new Error('Invalid leaderboard player');
        this.players.set(row.identity, {identity:row.identity, name:cleanName(row.name), matches:row.matches,
          wins:row.wins, losses:row.losses, draws:row.draws, points:row.points});
      }
    } catch (error) {
      if (error.code === 'ENOENT') return;
      // Preserve a corrupt/unreadable file for recovery instead of overwriting
      // the only copy with an empty leaderboard on the next completed match.
      this.players.clear(); this.writeBlocked = true; this.reportError(error);
    }
  }
  reportError(error) {
    this.storage = 'unavailable';
    try { this.onError(error); } catch { /* Logging must not interrupt a match. */ }
  }
  list() {
    return {entries:[...this.players.values()].map(publicRow).sort(order).slice(0, 50).map((row, index) => ({rank:index + 1, ...row})),
      order:'wins,winRate,points,playerId', storage:this.storage};
  }
  recordMatch(players, state) {
    if (state?.phase !== 'over' || players.length !== 2 || players.some(player => !player?.identity))
      return Promise.resolve({status:'excluded', reason:'missing_identity'});
    if (players[0].identity === players[1].identity) return Promise.resolve({status:'excluded', reason:'same_player'});
    const points = matchPoints(state);
    if (!points.every(count)) return Promise.resolve({status:'excluded', reason:'invalid_score'});
    players.forEach((player, side) => {
      const row = this.players.get(player.identity) || {identity:player.identity, name:player.name, matches:0, wins:0, losses:0, draws:0, points:0};
      row.name = cleanName(player.name); row.matches++; row.points += points[side];
      if (state.winner === null) row.draws++;
      else if (state.winner === side) row.wins++;
      else row.losses++;
      this.players.set(player.identity, row);
    });
    if (!this.filePath) return Promise.resolve({status:'memory'});
    const contents = JSON.stringify({version:1, players:[...this.players.values()]}) + '\n';
    this.pending = this.pending.then(async () => {
      if (this.writeBlocked) return {status:'error'};
      try {
        await mkdir(path.dirname(this.filePath), {recursive:true});
        await writeFile(this.filePath + '.tmp', contents, {encoding:'utf8', mode:0o600});
        await rename(this.filePath + '.tmp', this.filePath);
        this.storage = 'persistent'; return {status:'saved'};
      } catch (error) { this.reportError(error); return {status:'error'}; }
    });
    return this.pending;
  }
  async flush() { await this.pending; }
}
