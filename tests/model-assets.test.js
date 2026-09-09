import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AnimationClip, NumberKeyframeTrack, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelGlb } from './helpers/model-fixture.js';

async function modelServer(t, initiallyFails=false) {
  let requests=0, fails=initiallyFails;
  const server=http.createServer((req,res)=>{
    requests++;
    if(fails){res.writeHead(503);res.end('temporarily unavailable');return;}
    const bytes=modelGlb();res.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Length':bytes.length});res.end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  // ProgressEvent is browser-provided; the remaining fetch/parser/skin pipeline is real.
  const original=globalThis.ProgressEvent;
  globalThis.ProgressEvent=class extends Event {constructor(type,options){super(type);Object.assign(this,options);}};
  t.after(()=>{if(original)globalThis.ProgressEvent=original;else delete globalThis.ProgressEvent;});
  return {url:`http://127.0.0.1:${server.address().port}/models/fixture.glb`,requests:()=>requests,recover:()=>{fails=false;}};
}

test('async model loading fetches once while returning separately owned character instances', async t => {
  const server=await modelServer(t);
  await assert.doesNotReject(async()=>{
    const {loadModel}=await import('../src/model-assets.js');
    const [a,b]=await Promise.all([loadModel(server.url),loadModel(new URL(server.url))]);
    assert.equal(server.requests(),1);
    const left=a.scene.getObjectByName('Body'),right=b.scene.getObjectByName('Body');
    assert.ok(left.isSkinnedMesh&&right.isSkinnedMesh);
    assert.notEqual(left.skeleton,right.skeleton);
    assert.notEqual(left.skeleton.bones[0],right.skeleton.bones[0]);
    assert.notEqual(left.geometry,right.geometry);assert.notEqual(left.material,right.material);
    left.skeleton.bones[0].position.x=3;left.material.color.setHex(0xff0000);
    left.geometry.attributes.position.setX(0,4);
    assert.equal(right.skeleton.bones[0].position.x,0);
    assert.equal(right.geometry.attributes.position.getX(0),0);
    assert.notEqual(right.material.color.getHex(),left.material.color.getHex());
    let disposed=0;for(const resource of [right.geometry,right.material,right.skeleton])resource.addEventListener?.('dispose',()=>disposed++);
    left.geometry.dispose();left.material.dispose();left.skeleton.dispose();
    assert.equal(disposed,0);
    const c=await loadModel(server.url),third=c.scene.getObjectByName('Body');
    assert.equal(third.skeleton.bones[0].position.x,0);assert.equal(third.geometry.attributes.position.getX(0),0);
    assert.equal(server.requests(),1);
  });
});

test('a failed model request is evicted so a later request can recover', async t => {
  const server=await modelServer(t,true);
  await assert.doesNotReject(async()=>{
    const {loadModel}=await import('../src/model-assets.js');
    await assert.rejects(loadModel(server.url),/503/);
    server.recover();const recovered=await loadModel(server.url);
    assert.ok(recovered.scene.getObjectByName('Body').isSkinnedMesh);
    assert.equal(server.requests(),2);
  });
});

test('cloning isolates every material texture slot and geometry but preserves sharing within each character', async()=>{
  await assert.doesNotReject(async()=>{
    const {cloneModel}=await import('../src/model-assets.js');
    const bytes=modelGlb(),source=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const body=source.scene.getObjectByName('Body'),texture=new Texture({width:1,height:1});
    body.material.map=texture;body.material.normalMap=texture;
    body.skeleton.computeBoneTexture();
    source.animations=[new AnimationClip('move',1,[new NumberKeyframeTrack('RootJoint.position[x]',[0,1],[0,1])])];
    const second=body.clone();second.name='BodyCopy';source.scene.add(second);
    const first=cloneModel(source),next=cloneModel(source);
    const a=first.scene.getObjectByName('Body'),b=next.scene.getObjectByName('Body');
    assert.notEqual(a.material.map,texture);assert.notEqual(a.material.map,b.material.map);
    assert.equal(a.material.map,a.material.normalMap);
    assert.equal(a.material,first.scene.getObjectByName('BodyCopy').material);
    assert.equal(a.geometry,first.scene.getObjectByName('BodyCopy').geometry);
    a.skeleton.computeBoneTexture();b.skeleton.computeBoneTexture();
    assert.notEqual(a.skeleton.boneTexture,b.skeleton.boneTexture);
    assert.notEqual(a.skeleton.boneTexture,body.skeleton.boneTexture);
    a.skeleton.boneInverses[0].elements[12]=5;
    assert.equal(body.skeleton.boneInverses[0].elements[12],0);
    assert.equal(b.skeleton.boneInverses[0].elements[12],0);
    let disposed=0;b.material.map.addEventListener('dispose',()=>disposed++);texture.addEventListener('dispose',()=>disposed++);
    b.skeleton.boneTexture.addEventListener('dispose',()=>disposed++);body.skeleton.boneTexture.addEventListener('dispose',()=>disposed++);
    a.skeleton.dispose();
    a.material.map.dispose();assert.equal(disposed,0);
    first.animations[0].tracks[0].values[1]=4;
    assert.equal(next.animations[0].tracks[0].values[1],1);
    assert.equal(source.animations[0].tracks[0].values[1],1);
  });
});
