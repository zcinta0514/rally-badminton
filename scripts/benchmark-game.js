import { createMatch, stepMatch, aiInput } from '../shared/game.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STEP = 1 / 60;
const MAX_STEPS = 60 * 300;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

export function simulateMatch({ difficulty = 'easy', roles = ['balanced', 'balanced'], seed = 1, target = 5 } = {}) {
  const state = createMatch({ difficulty, roles, seed, target });
  let steps = 0, maxRally = 0, shots = 0;
  while (state.phase !== 'over' && steps < MAX_STEPS) {
    const inputs = [aiInput(state, 0, difficulty), aiInput(state, 1, difficulty)];
    stepMatch(state, inputs, STEP);
    steps++;
    maxRally = Math.max(maxRally, state.rally);
    shots = Math.max(shots, state.hitId);
  }
  return {
    difficulty, seed, winner: state.winner, endReason: state.endReason, phase: state.phase,
    steps, seconds: steps * STEP, points: state.pointId, maxRally, shots,
  };
}

export function benchmark({ difficulties = ['easy', 'medium', 'hard'], seeds = 40, roles = ['balanced', 'balanced'], target = 5 } = {}) {
  const output = {};
  for (const difficulty of difficulties) {
    const matches = Array.from({ length: seeds }, (_, index) => simulateMatch({ difficulty, roles, target, seed: index + 1 }));
    const rallies = matches.map(match => match.maxRally);
    const completed = matches.filter(match => match.phase === 'over').length;
    output[difficulty] = {
      matches: matches.length, completed, completionRate: completed / matches.length,
      averageRally: rallies.reduce((sum, value) => sum + value, 0) / rallies.length,
      medianRally: median(rallies),
      averageSeconds: matches.reduce((sum, match) => sum + match.seconds, 0) / matches.length,
      samples: matches,
    };
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const parsed = Number.parseInt(process.argv[2] || '40', 10);
  const seeds = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 40;
  console.log(JSON.stringify(benchmark({ seeds }), null, 2));
}
