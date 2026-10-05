import {createMatch, stepMatch, aiInput, ROLES, staminaEffects} from '../shared/game.js';

// Deterministic diagnosis of the released rules, not a replacement player model.
const maxSeconds = Math.min(1800, Math.max(600, Number(process.argv[2]) || 600));
const rows = [];
for (const difficulty of ['easy', 'medium', 'hard']) for (const role of Object.keys(ROLES)) {
  for (const ratio of [1, .2, 0]) {
    const plans = {clear: 0, drop: 0, smash: 0};
    let contacts = 0, requests = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = createMatch({roles: [role, role], difficulty, seed: Math.imul(seed, 2654435761) >>> 0});
      s.phase = 'rally'; s.service = null;
      Object.assign(s.players[0], {x: 0, z: 3.6, stamina: ROLES[role].maxStamina * ratio});
      Object.assign(s.shuttle, {x: 0, y: 3.05, z: 3.6, vx: 0, vy: 0, vz: 0, active: true, lastHit: 1});
      aiInput(s, 0, difficulty);
      plans[s._ai[0].shot]++;
      let requested = false;
      for (let frame = 0; frame < 120 && s.phase === 'rally' && s.hitId === 0; frame++) {
        const input = aiInput(s, 0, difficulty);
        requested ||= !!input.shot;
        stepMatch(s, [input, {}], 1 / 60);
      }
      requests += Number(requested);
      contacts += Number(s.hitId > 0);
    }
    rows.push({difficulty, role, ratio, plans, requests, contacts,
      speedScale: staminaEffects({stamina: ratio * ROLES[role].maxStamina}, ROLES[role]).speedScale});
  }
}
const matches = [];
for (const lineup of ['same-role', 'practice']) for (const difficulty of ['easy', 'medium', 'hard']) for (const role of Object.keys(ROLES)) {
  const roles = lineup === 'practice' ? [role, 'balanced'] : [role, role];
  const totals = {lineup, difficulty, role, completed: 0, rallySeconds: 0, lowSeconds: 0, recoveringSeconds: 0,
    above10: {clear: 0, drop: 0, smash: 0}, low: {clear: 0, drop: 0, smash: 0}};
  for (let seed = 1; seed <= 20; seed++) {
    const s = createMatch({roles, difficulty, seed: Math.imul(seed, 2654435761) >>> 0, target: 21});
    for (let frame = 0; frame < 60 * maxSeconds && s.phase !== 'over'; frame++) {
      const inputs = [aiInput(s, 0, difficulty), aiInput(s, 1, difficulty)];
      const before = s.hitId;
      stepMatch(s, inputs, 1 / 60);
      if (s.phase === 'rally') for (const [side, p] of s.players.entries()) {
        if (lineup === 'practice' && side !== 1) continue;
        totals.rallySeconds += 1 / 60;
        if (p.stamina / ROLES[p.role].maxStamina < .1) totals.lowSeconds += 1 / 60;
        if (p.staminaStatus === 'recovering') totals.recoveringSeconds += 1 / 60;
      }
      if (s.hitId !== before && !s.lastShotInfo.serving) {
        const info = s.lastShotInfo;
        if (lineup === 'practice' && info.side !== 1) continue;
        const bucket = info.staminaBefore / ROLES[s.players[info.side].role].maxStamina < .1 ? totals.low : totals.above10;
        bucket[info.type || s.lastShot]++;
      }
    }
    totals.completed += Number(s.phase === 'over');
  }
  matches.push(totals);
}
console.log(JSON.stringify({maxSeconds, fixture: 'stationary reachable descending shuttle; 200 seeds per condition', rows,
  matchFixture: '20 AI-v-AI 21-point matches per lineup/role/difficulty; practice uses UI roles [player role, balanced] and counts side 1 only; player-seconds; low <10%; not a human-play simulation', matches}, null, 2));
