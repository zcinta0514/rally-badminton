import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, stepMatch, pauseMatch, ROLES} from '../shared/game.js';
import {STAMINA_TUNING} from '../shared/stamina.js';

function tick(s, seconds, input = [{}, {}], dt = 1/120) {
  for (let time = 0; time < seconds - 1e-9; time += dt) stepMatch(s, input, Math.min(dt, seconds-time));
}
function contact(shot, role = 'balanced') {
  const s=createMatch({roles:[role,role]});s.phase='rally';s.service=null;
  s.players.forEach(p=>p.stamina=30);
  Object.assign(s.shuttle,{x:0,z:3.8,y:2.2,vy:-1,vx:0,vz:0,active:true,lastHit:1});
  tick(s,.2,[{shot},{}]);
  assert.equal(s.hitId,1,shot);assert.ok(s.players[0].stamina<30,'contact still costs stamina');
  // Hold the successfully returned flight to isolate the recovery window.
  s.shuttle.active=false;
  return s;
}

test('successful clear and drop reward eligible rest, within separate per-shot budgets',()=>{
  for(const role of Object.keys(ROLES))for(const shot of ['clear','drop']){
    const s=contact(shot,role),normal=structuredClone(s);normal.players[0].shotRecovery=null;
    assert.equal(s.players[0].shotRecovery.type,shot);
    tick(s,2.5);tick(normal,2.5);
    const extra=s.players[0].stamina-normal.players[0].stamina;
    assert.ok(extra>0,role+'/'+shot);
    assert.ok(extra<=STAMINA_TUNING.shotRecovery[shot].budget+1e-6);
    assert.equal(s.players[0].shotRecovery,null);
    assert.equal(s.players[1].stamina,normal.players[1].stamina,'only hitter gets the reward');
    assert.ok(s.players[0].stamina<=ROLES[role].maxStamina);
  }
});
test('shot recovery has no effect during running or preparation, and pause clears it',()=>{
  for(const input of [{x:1},{prepare:'smash'}]){
    const s=contact('clear'),normal=structuredClone(s);normal.players[0].shotRecovery=null;
    tick(s,1,[input,{}]);tick(normal,1,[input,{}]);
    assert.equal(s.players[0].stamina,normal.players[0].stamina);
  }
  const s=contact('clear'),before=s.players[0].stamina;pauseMatch(s,0);tick(s,1);
  assert.equal(s.players[0].shotRecovery,null);assert.equal(s.players[0].stamina,before);
});
test('serve, smash and a missed shot cannot create a recovery reward',()=>{
  const serve=createMatch();tick(serve,.2,[{shot:'clear'},{}]);
  assert.equal(serve.hitId,1);assert.equal(serve.players[0].shotRecovery,null);
  assert.equal(contact('smash').players[0].shotRecovery,null);
  const miss=createMatch();miss.phase='rally';miss.service=null;
  Object.assign(miss.shuttle,{x:2,y:2,z:-4,active:true,lastHit:1});tick(miss,.1,[{shot:'clear'},{}]);
  assert.equal(miss.hitId,0);assert.equal(miss.players[0].shotRecovery,null);
});
test('the opponent return closes the window and cadence does not change earned rest',()=>{
  const s=contact('clear');s.shuttle.lastHit=1;tick(s,.01);
  assert.equal(s.players[0].shotRecovery,null);
  const totals=[];
  for(const dt of [1/30,1/60,1/120]){
    const sample=contact('clear');tick(sample,2.5,undefined,dt);totals.push(sample.players[0].stamina);
  }
  assert.ok(Math.max(...totals)-Math.min(...totals)<1e-6);
});
test('a new successful shot replaces the previous budget instead of stacking it',()=>{
  const s=contact('clear');tick(s,.6);
  const p=s.players[0];p.cooldown=0;p.action=null;
  Object.assign(s.shuttle,{x:p.x,z:p.z,y:2.2,vy:-1,vx:0,vz:0,active:true,lastHit:1});
  tick(s,.2,[{shot:'drop'},{}]);
  assert.equal(s.hitId,2);assert.equal(p.shotRecovery.type,'drop');
  assert.equal(p.shotRecovery.remaining,STAMINA_TUNING.shotRecovery.drop.budget);
});
