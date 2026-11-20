import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installTournamentArena, lineOfficial } from '../src/tournament-arena.js';

test('assigned boundary follows the active singles or doubles rectangle', () => {
  const impact = {kind:'in', x:2.57, z:6.4};
  assert.equal(lineOfficial(impact,'singles'),'LJ_Side_Right');
  assert.equal(lineOfficial(impact,'doubles'),'LJ_Base_Near');
  assert.equal(lineOfficial({kind:'out', x:-.2,z:-7}),'LJ_Base_Far');
  assert.equal(lineOfficial({kind:'out', x:-3.2,z:6.71}),'LJ_Side_Left');
  assert.equal(lineOfficial({...impact,kind:'serviceFault'}),null);
  assert.equal(lineOfficial({...impact,kind:'net'}),null);
});

test('real exported clips signal a point once, independently of the umpire and other lines', async t => {
  const text = [];
  const context = {fillRect(){},fillText(value){text.push(value);}};
  globalThis.document = {createElement:()=>({getContext:()=>context})};
  t.after(()=>{ delete globalThis.document; });
  const bytes = await readFile(new URL('../src/models/tournament-hall.glb',import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const hall = installTournamentArena(gltf);
  const names = ['LJ_Base_Near_R_Shoulder','LJ_Base_Far_R_Shoulder','Umpire_Main_R_Shoulder'];
  const joints = names.map(name => hall.scene.getObjectByName(name));
  const rest = joints.map(joint => joint.quaternion.clone());
  const state = {time:0, pointId:0, phase:'rally', score:[0,0], format:'singles'};
  hall.update(state,0);
  assert.equal(hall.scene.getObjectByName('LJ_Side_Right').position.x,2.59);
  Object.assign(state,{pointId:1,phase:'point',score:[1,0], rallyEnd:{id:1,kind:'out',x:0,z:6.78}});
  const step = count => {for(let i=0; i<count; i++){state.time+=1/60;hall.update(state,1/60);}};
  step(44);
  assert.ok(rest[0].angleTo(joints[0].quaternion)>.5);
  assert.ok(rest[1].angleTo(joints[1].quaternion)<.001);
  assert.ok(rest[2].angleTo(joints[2].quaternion)>.005);
  assert.deepEqual(text.slice(-2),['01','00']);
  step(140);
  joints.forEach((joint,i)=>assert.ok(rest[i].angleTo(joint.quaternion)<.001));
  Object.assign(state,{pointId:2,score:[1,1],rallyEnd:{id:2,kind:'net',x:.1,z:0}});
  step(44);
  assert.ok(rest[0].angleTo(joints[0].quaternion)<.001);
  assert.ok(rest[1].angleTo(joints[1].quaternion)<.001);
  assert.ok(rest[2].angleTo(joints[2].quaternion)>.005);
  assert.deepEqual(text.slice(-2),['01','01']);
});
