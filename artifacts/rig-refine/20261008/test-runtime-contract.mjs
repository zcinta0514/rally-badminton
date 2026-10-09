import fs from 'node:fs';
import assert from 'node:assert/strict';
import { AnimationClip, BufferGeometry, Float32BufferAttribute, Mesh, NumberKeyframeTrack, Scene } from 'three';
import { prepare } from './morph-stream.mjs';

function fixture({ active = 2, nan = false, omitNormals = false } = {}) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([1, 2, 3], 3));
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1], 3));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = Array.from({ length: 961 }, (_, i) => new Float32BufferAttribute(i === 0 ? [1, 0, 0] : i === 1 ? [0, 1, 0] : [0, 0, 0], 3));
  if (!omitNormals) geometry.morphAttributes.normal = Array.from({ length: 961 }, (_, i) => new Float32BufferAttribute(i === 0 ? [.2, 0, 0] : i === 1 ? [0, .2, 0] : [0, 0, 0], 3));
  const body = new Mesh(geometry); body.name = 'SuperHero_Male';
  const scene = new Scene(); scene.add(body);
  const values = new Float32Array(1922);
  if (active === 2) { values[0] = 1; values[962] = 1; }
  else { for (const offset of [0, 961]) { values[offset] = .25; values[offset + 1] = .25; values[offset + 2] = .5; } }
  if (nan) values[0] = NaN;
  return { scene, animations: [new AnimationClip('test', 1, [new NumberKeyframeTrack('SuperHero_Male.morphTargetInfluences', [0, 1], values)])] };
}
const rows=[];
function test(name, run) { run(); rows.push({ name, passed: true }); }
test('Two samples preserve position and unnormalized morph normals', () => {
  const model = fixture(), stream = prepare(model); stream.update(.5);
  const body = model.scene.getObjectByName('SuperHero_Male');
  assert.deepEqual(Array.from(body.geometry.attributes.position.array), [1.5, 2.5, 3]);
  assert.ok(Math.abs(body.geometry.attributes.normal.getX(0) - .1) < 1e-7);
  assert.ok(Math.abs(body.geometry.attributes.normal.getY(0) - .1) < 1e-7);
  assert.equal(body.geometry.attributes.normal.getZ(0), 1);
  assert.deepEqual(body.geometry.morphAttributes, {});
  assert.equal(stream.stats.maxActiveCount, 2);
  assert.equal(stream.clip.tracks.length, 0);
  assert.throws(() => stream.update(NaN), /time outside/);
  assert.throws(() => stream.update(1.1), /time outside/);
  assert.throws(() => prepare(model), /already prepared/);
});
test('Three active samples are rejected rather than truncated', () => assert.throws(() => prepare(fixture({active:3})).update(.5), /got 3/));
test('Missing normals are rejected', () => assert.throws(() => prepare(fixture({omitNormals:true})), /position AND normal/));
test('Nonfinite original weights are rejected', () => assert.throws(() => prepare(fixture({nan:true})), /nonfinite track weight/));
fs.writeFileSync(new URL('./contract-tests.json',import.meta.url),JSON.stringify({passed:true,rows},null,2));console.log(JSON.stringify({passed:true,rows}));
