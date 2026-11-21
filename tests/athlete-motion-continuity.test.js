import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { createMatch, stepMatch } from '../shared/game.js';
import { sampleAthletePose, makeAthlete, updateAthlete } from '../src/athlete.js';
import { buildMotionClip, FRAME_RATE } from '../src/preview/motion-clips.js';

const player = { x: 0, z: 3.8, vx: 0, vz: 0 };
const distance = (p, q) => Math.hypot(p.x-q.x, p.y-q.y, p.z-q.z);

test('ordinary match serves bring the racket up from below the shuttle', () => {
  for (const shot of ['clear','drop']) {
    const state = createMatch();
    stepMatch(state,[{shot},{}],.001);
    const p = state.players[0], a = p.action;
    assert.equal(a.serving,true);
    const pose = t => sampleAthletePose(p,0,a.contact,t);
    assert.ok(pose(a.startedAt).racketHead.y < a.contact.y-.12);
    assert.ok(pose(a.contactAt-.01).racketHead.y < a.contact.y);
    assert.ok(pose(a.contactAt+.01).racketHead.y > a.contact.y);
    assert.equal(pose(a.contactAt).jump,0);
    assert.ok(Math.abs(pose(a.contactAt).racketHead.y-a.contact.y) < 1e-8);
  }
});

test('ordinary strokes finish at their role-specific recovery time', () => {
  for (const type of ['drop','clear']) for (const technique of [undefined,'lift','defense','cross','serve','feed']) {
    for (const recovery of [.378,.42,.47]) {
      const action = {type,technique,serving:technique==='serve',stage:'windup',startedAt:1,
        contactAt:1.12,endsAt:1.12+recovery,contact:{x:.55,y:1.3,z:3.2}};
      const last = sampleAthletePose({...player,action},0,action.contact,action.endsAt);
      const idle = sampleAthletePose(player,0,action.contact,action.endsAt);
      for (const name of ['racketHead', 'rightWrist','rightAnkle','leftElbow','pelvis']) {
        assert.ok(distance(last.joints[name] || last[name], idle.joints[name] || idle[name]) < 1e-6,
          type+' '+technique+' '+recovery+' '+name);
      }
    }
  }
});

test('jump smash continues to rise toward contact and recovers with one foot supporting the other', () => {
  const a = {type:'smash',stage:'windup',startedAt:1,contactAt:1.14,endsAt:1.56,
    contact:{x:.35,y:2.84,z:3.6},jumpHeight:.34};
  const pose = t => sampleAthletePose({...player,action:a},0,a.contact,t);
  assert.ok(pose(a.contactAt).jump-pose(a.contactAt-.02).jump > .002);
  for(const [phase,support,swing] of [[.74,'right','left'],[.93,'left','right']]){
    const at=p=>pose(a.contactAt+p*(a.endsAt-a.contactAt)).joints;
    const foot=at(phase)[support+'Ankle'];
    assert.ok(foot.y <= .085001);
    assert.ok(distance(foot,at(phase+.02)[support+'Ankle']) < .00001);
    assert.ok(at(phase)[swing+'Ankle'].y > .105);
  }
});

test('a lateral dive starts and finishes over the ready stance in either direction', () => {
  for (const direction of [-1,1]) {
    const dive = {at:1,endsAt:1.7,from:player,to:{x:direction*1.5,z:player.z},
      point:{x:direction,y:.6,z:player.z},slideTo:{x:direction*1.6,z:player.z},hit:false};
    for (const t of [dive.at,dive.endsAt-1e-6]) {
      const idle = sampleAthletePose(player,0,dive.point,t);
      const reached = sampleAthletePose(player,0,dive.point,t,{rescue:dive});
      for (const name of Object.keys(idle.joints)) assert.ok(distance(reached.joints[name],idle.joints[name]) < .001,
        direction+' '+name+' at '+t);
    }
  }
});

test('rendered preparation, contact and recovery keep the elbow open for either racket hand', () => {
  const cases=['jump','standing','clear','drop','shortServe','longServe','lift','cross','defense','feed','rescue'];
  for (const kind of cases) for (const hand of ['left','right']) {
    const rig=makeAthlete(new Scene(),0);
    let previous;
    for(const [i,f] of buildMotionClip(kind,hand).entries()){
      const pose=updateAthlete(rig,f.player,f.side,f.shuttle,f.time,1/FRAME_RATE,true,false,i===0,f.rescue);
      const {rightShoulder,rightElbow,rightWrist}=pose.joints;
      const toShoulder=new Vector3().subVectors(rightShoulder,rightElbow);
      const toWrist=new Vector3().subVectors(rightWrist,rightElbow);
      const label=kind+' '+hand+' frame '+i;
      assert.ok(toShoulder.angleTo(toWrist)>40*Math.PI/180,label+' collapsed elbow');
      if(previous&&(kind==='clear'||kind==='drop')){
        assert.ok(distance(rightElbow,previous)<.20,label+' discontinuous overhead swing');
      }
      previous=rightElbow;
    }
  }
});
