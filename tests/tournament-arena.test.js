import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installTournamentArena, lineOfficial } from '../src/tournament-arena.js';
import { COURT_PALETTES } from '../src/court-palettes.js';

test('assigned boundary follows the active singles or doubles rectangle', () => {
  const impact = {kind:'in', x:2.57, z:6.4};
  assert.equal(lineOfficial(impact,'singles'),'LJ_Side_Right');
  assert.equal(lineOfficial(impact,'doubles'),'LJ_Base_Near');
  assert.equal(lineOfficial({kind:'out', x:-.2,z:-7}),'LJ_Base_Far');
  assert.equal(lineOfficial({kind:'out', x:-3.2,z:6.71}),'LJ_Side_Left');
  assert.equal(lineOfficial({...impact,kind:'serviceFault'}),null);
  assert.equal(lineOfficial({...impact,kind:'net'}),null);
});

async function loadHall(t) {
  const text = [];
  const context = {fillRect(){},fillText(value){text.push(value);}};
  globalThis.document = {createElement:()=>({getContext:()=>context})};
  t.after(()=>{ delete globalThis.document; });
  const bytes = await readFile(new URL('../src/models/tournament-hall.glb',import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return { hall: installTournamentArena(gltf), text };
}

test('exported scoreboard uses the game brand and only the playing surface and apron change palettes', async t => {
  const { hall, text } = await loadHall(t);
  assert.ok(text.some(value => value.startsWith('开拍 RALLY')));
  const mat = hall.scene.getObjectByName('Court_|_sprung_competition_mat').material;
  const apron = hall.scene.getObjectByName('AR__Competition_surround').material;
  const fixed = ['AR__End_wall_vertical_fins','AR__East__formed_seat_shells','Court_|_40_mm_line_paint']
    .map(name => hall.scene.getObjectByName(name).material.color);
  const unchanged = fixed.map(color => color.getHex());
  for (const [name, colors] of Object.entries(COURT_PALETTES)) {
    hall.palette(name);
    assert.equal(mat.color.getHex(), colors.court);
    assert.equal(apron.color.getHex(), colors.apron);
    assert.deepEqual(fixed.map(color => color.getHex()), unchanged);
  }
});

test('real exported clips signal a point once, independently of the umpire and other lines', async t => {
  const { hall, text } = await loadHall(t);
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
  hall.reset();
  assert.deepEqual(text.slice(-2),['00','00']);
});
test('cup signage, stands and court return to the chosen ordinary-match palette', async t => {
  const { hall, text } = await loadHall(t);
  const { cupVenueTheme } = await import('../src/cup-venue.js');
  const seats = hall.scene.getObjectByName('AR__East__formed_seat_shells').material.color;
  const mat = hall.scene.getObjectByName('Court_|_sprung_competition_mat').material.color;
  const originalSeats = seats.getHex();
  const state = {time:0, pointId:0, phase:'serve', score:[0,0], format:'singles'};
  for (const id of ['bay','crown']) {
    const theme = cupVenueTheme(id);
    hall.palette('green', theme, '许嘉音');
    hall.update(state,0);
    assert.equal(mat.getHex(), theme.court);
    assert.equal(seats.getHex(), theme.seat);
    assert.ok(text.slice(-5).includes('许嘉音'));
  }
  hall.palette('pink');
  hall.update(state,0);
  assert.equal(mat.getHex(), COURT_PALETTES.pink.court);
  assert.equal(seats.getHex(), originalSeats);
  assert.ok(text.slice(-5).includes('FAR'));
});
