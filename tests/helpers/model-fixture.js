import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectRoot } from '../../scripts/build-pwa.js';

// A self-contained, genuinely skinned triangle: no downloaded model or GPU needed.
export function modelGlb(name = 'fixture') {
  const positions = new Float32Array([0,0,0, 1,0,0, 0,1,0]);
  const joints = new Uint16Array(12);
  const weights = new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0]);
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(joints.buffer), Buffer.from(weights.buffer)]);
  const gltf = { asset: { version: '2.0', generator: 'RALLY test fixture' }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ name, children: [1,2] }, { name: 'RootJoint' }, { name: 'Body', mesh: 0, skin: 0 }],
    skins: [{ joints: [1], skeleton: 1 }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [1,.5,.2,1] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, material: 0 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 48 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0,0,0], max: [1,1,0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'VEC4' }, { bufferView: 2, componentType: 5126, count: 3, type: 'VEC4' }] };
  const json = Buffer.from(JSON.stringify(gltf).padEnd(Math.ceil(JSON.stringify(gltf).length / 4) * 4));
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67,0); header.writeUInt32LE(2,4); header.writeUInt32LE(28+json.length+binary.length,8);
  header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16);
  binHeader.writeUInt32LE(binary.length,0); binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,binHeader,binary]);
}

export async function modelBuildRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(),'rally-model-build-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const files = ['index.html','manifest.webmanifest','src','shared','icons','scripts/service-worker.js',
    'node_modules/three/build','node_modules/three/LICENSE',
    ...['loaders/GLTFLoader.js','utils/BufferGeometryUtils.js','utils/SkeletonUtils.js'].map(file=>'node_modules/three/examples/jsm/'+file),
    'node_modules/peerjs/dist/peerjs.min.js','node_modules/peerjs/LICENSE',
    'node_modules/@msgpack/msgpack/LICENSE','node_modules/eventemitter3/LICENSE','node_modules/peerjs-js-binarypack/LICENSE',
    'node_modules/webrtc-adapter/LICENSE.md','node_modules/sdp/LICENSE'];
  for (const file of files) {
    await mkdir(path.dirname(path.join(root,file)),{recursive:true});
    await cp(path.join(projectRoot,file),path.join(root,file),{recursive:true,filter:file=>! /\.(glb|blend|zip)$/i.test(file)});
  }
  await mkdir(path.join(root,'src/models'),{recursive:true});
  await writeFile(path.join(root,'src/models/fixture.glb'),modelGlb());
  await writeFile(path.join(root,'src/models/LICENSE.txt'),'Test-only original triangle, CC0.');
  return root;
}
