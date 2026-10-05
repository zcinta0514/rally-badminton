import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../shared/game.js';
import { contactStats } from '../scripts/check-stamina-balance.mjs';
import { staminaDisplay } from '../src/stamina-hud.js';

test('healthy reserves have a stable zone; every role loses speed and acceleration continuously as reserves fall', () => {
  for (const role of Object.values(game.ROLES)) {
    let previous = { speedScale: 1, accelerationScale: 1 };
    for (let percent = 100; percent >= 0; percent--) {
      const effects = game.staminaEffects({ stamina: role.maxStamina * percent / 100 }, role);
      assert.ok(effects.speedScale <= previous.speedScale + 1e-12);
      assert.ok(effects.accelerationScale <= previous.accelerationScale + 1e-12);
      assert.ok(previous.speedScale - effects.speedScale < .025, 'no threshold speed cliff');
      assert.ok(effects.speedScale >= .6 && effects.accelerationScale >= .75);
      if (percent >= 60) assert.equal(effects.speedScale, 1);
      previous = effects;
    }
  }
});

test('the three styles trade movement economy, recovery, control and attack economy without one dominating', () => {
  const { balanced:b, swift:s, power:p } = game.ROLES;
  // Compare the cost of covering equal ground, not seconds at different speeds.
  const run = r => game.movementStaminaRate(r,r.speed) / r.speed / r.maxStamina;
  const shot = (r,type) => game.shotStaminaCost(r,type) / r.maxStamina;
  assert.ok(run(s) < run(b) && run(b) < run(p));
  assert.ok(s.recovery/s.maxStamina > b.recovery/b.maxStamina && b.recovery/b.maxStamina > p.recovery/p.maxStamina);
  assert.ok(shot(p,'smash') < shot(b,'smash') && shot(b,'smash') < shot(s,'smash'));
  assert.ok(shot(s,'drop') < shot(b,'drop'));
  assert.ok(shot(b,'clear') < shot(s,'clear'));
  // Power can conserve energy with control shots, but retains the slowest
  // movement and strongest fatigue/control penalties; it cannot dominate agility.
  assert.ok(p.speed < b.speed && b.speed < s.speed);
  assert.ok(p.fatigue.controlWeight > b.fatigue.controlWeight && b.fatigue.controlWeight > s.fatigue.controlWeight);
  assert.ok(game.shotStaminaCost(p,'drop') <= game.shotStaminaCost(b,'drop'));
});

test('routine motion and control shots have smaller costs; full-power repeated attack still spends meaningful reserves', () => {
  const r=game.ROLES.balanced;
  assert.ok(game.movementStaminaRate(r,r.speed) <= 4.5);
  assert.ok(game.movementStaminaRate(r,r.speed*.25) < game.movementStaminaRate(r,r.speed)*.1);
  assert.ok(game.shotStaminaCost(r,'drop') < game.shotStaminaCost(r,'clear'));
  assert.ok(game.shotStaminaCost(r,'clear',0,true) < 2);
  const strong=game.shotStaminaCost(r,'smash',1);
  assert.ok(strong >= 10 && strong <= 13);
  assert.ok(strong*5 < r.maxStamina && strong*9 > r.maxStamina);
  assert.ok(strong > game.shotStaminaCost(r,'smash',.5));
});

test('exhaustion changes actual movement for both ends and all roles while preserving usable movement', () => {
  for(const role of Object.keys(game.ROLES))for(const side of [0,1]){
    const states=[1,0].map(ratio=>{const s=game.createMatch({roles:[role,role]});s.phase='rally';s.shuttle.active=false;s.players[side].stamina=game.ROLES[role].maxStamina*ratio;s.players[side].x=-1;return s;});
    for(const s of states)for(let i=0;i<36;i++)game.stepMatch(s,side===0?[{x:1},{}]:[{}, {x:1}],1/120);
    assert.ok(states[1].players[side].vx > 2);
    assert.ok(states[1].players[side].vx < states[0].players[side].vx*.85);
    assert.ok(states[1].players[side].x < states[0].players[side].x);
  }
});

test('low-intensity rally recovery remains identical across fixed render cadences after the same eligibility wait', () => {
  for(const role of Object.keys(game.ROLES)){
    const totals=[];
    for(const frame of [1/30,1/60,1/120]){
      const s=game.createMatch({roles:[role,role]});s.phase='rally';s.shuttle.active=false;s.players[0].stamina=25;
      for(let tick=0;tick<Math.round(1/frame);tick++)game.stepMatch(s,[{x:.25},{}],frame);
      totals.push(s.players[0].stamina);
      assert.ok(s.players[0].stamina>25);
    }
    assert.ok(Math.max(...totals)-Math.min(...totals)<1e-6);
  }
});

test('fatigue produces more actual net/out endings in the same contact grid for every role and shot, not just a higher display risk', () => {
  for(const role of Object.keys(game.ROLES)){
    const healthy=contactStats(game,role,1), tired=contactStats(game,role,.2);
    for(const shot of ['clear','drop','smash']){
      assert.equal(healthy[shot].samples,tired[shot].samples);
      assert.ok(tired[shot].errors > healthy[shot].errors,role+'/'+shot);
    }
  }
});

test('fatigue is explained in the player meter without hiding recovery, waiting or paused status', () => {
  const p={role:'balanced',stamina:10,staminaStatus:'draining'};
  assert.match(staminaDisplay(p,'rally',true).label,/疲劳/);
  assert.ok(staminaDisplay(p,'rally',true).speed < game.ROLES.balanced.speed);
  p.staminaStatus='recovering';assert.match(staminaDisplay(p,'rally',true).label,/恢复中/);
  assert.equal(staminaDisplay(p,'paused',true).status,'paused');
});
