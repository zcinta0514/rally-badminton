// Export the live game's ready pose for the Blender review scene.
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeAthlete, updateAthlete } from '../../src/athlete.js';
import { installAthleteModel } from '../../src/athlete-import.js';

// The binary exporter reads Blobs using the browser FileReader API.
globalThis.FileReader ??= class FileReader {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};

const bytes = await readFile(new URL('../../src/models/athlete.glb', import.meta.url));
const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const review = new THREE.Scene();
const point = new THREE.Vector3();

function bakeBody(mesh) {
  const src = mesh.geometry;
  const positions = new Float32Array(src.attributes.position.count * 3);
  for (let i = 0; i < positions.length / 3; i++) {
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).toArray(positions, i * 3);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (src.index) geom.setIndex(src.index.clone());
  if (src.attributes.color) geom.setAttribute('color', src.attributes.color.clone());
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, mesh.material);
}

function bakeStrings(object) {
  const lines = [];
  const points = object.geometry.attributes.position;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.count; i += 2) {
    const a = new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(object.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(points, i + 1).applyMatrix4(object.matrixWorld);
    const axis = b.clone().sub(a);
    const cord = new THREE.CylinderGeometry(.00055, .00055, axis.length(), 5);
    cord.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, axis.normalize()));
    cord.translate(...a.lerp(b, .5).toArray());
    lines.push(cord);
  }
  return new THREE.Mesh(mergeGeometries(lines), new THREE.MeshStandardMaterial({color: object.material.color, roughness:.65}));
}

for (const [side, name, x, z] of [[0, 'Near', -.50, 3.30], [1, 'Far', .50, -3.30]]) {
  const scene = new THREE.Scene();
  const rig = makeAthlete(scene, side);
  installAthleteModel(rig, await new GLTFLoader().parseAsync(data, ''));
  updateAthlete(rig, {x, z, vx:0, vz:0, action:null}, side, null, 0, 1/60, false, false, true);
  scene.updateMatrixWorld(true);
  const player = new THREE.Group();
  player.name = 'ReviewPlayer_' + name;
  review.add(player);
  // Ground rings, HUD markers and pseudo-shadows belong to a separate group.
  rig.root.traverseVisible(object => {
    if (!object.isMesh && !object.isLineSegments) return;
    const result = object.isLineSegments ? bakeStrings(object) : bakeBody(object);
    result.name = player.name + '_' + object.name;
    player.add(result);
  });
  const size = new THREE.Box3().setFromObject(player);
  if (size.min.y < -.12 || size.max.y < 1.5 || size.max.y > 2.25 || size.max.z-size.min.z > 1.6) {
    throw new Error('Ready pose bounds invalid: ' + JSON.stringify(size));
  }
  console.log(player.name, player.children.length, size.min.toArray(), size.max.toArray());
}

const binary = await new GLTFExporter().parseAsync(review, {binary:true});
// Local build input; these poses never go into the live game's arena bundle.
const destination = process.argv[2] || new URL('ready-players.glb', import.meta.url);
await writeFile(destination, Buffer.from(binary));
