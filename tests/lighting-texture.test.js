import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {normalizeArenaPreferences,readArenaPreferences,saveArenaPreferences} from '../src/arena-preferences.js';
import {CourtView} from '../src/view.js';
import {TournamentLobby} from '../src/tournament-lobby.js';
import {makeCourtMaterial} from '../src/arena.js';

test('brightness migrates old saves, clamps invalid values and survives reload',()=>{
  assert.equal(normalizeArenaPreferences({master:.4}).brightness,1.25);
  for(const bad of [null,'1.5',NaN,Infinity])assert.equal(normalizeArenaPreferences({brightness:bad}).brightness,1.25);
  assert.equal(normalizeArenaPreferences({brightness:0}).brightness,.8);
  assert.equal(normalizeArenaPreferences({brightness:8}).brightness,1.8);
  let saved;const storage={getItem:()=>saved,setItem:(_,v)=>{saved=v;}};
  saveArenaPreferences({brightness:1.6,master:.4,courtPalette:'purple'},storage);
  assert.equal(readArenaPreferences(storage).brightness,1.6);
  assert.equal(readArenaPreferences(storage).courtPalette,'purple');
  assert.equal(readArenaPreferences(storage).master,.4);
});
test('brightness reaches both scenes and lobby rendering restores the shared renderer',()=>{
  assert.equal(typeof CourtView.prototype.setLightingBrightness,'function');
  const lobby=new TournamentLobby({loadAthlete:false});
  const view={renderer:{toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1},lobby};
  CourtView.prototype.setLightingBrightness.call(view,1.6);
  assert.equal(view.renderer.toneMappingExposure,1.6);
  let actual;view.renderer.render=()=>{actual=view.renderer.toneMappingExposure;};
  lobby.render(view.renderer,0,844,390,{reducedMotion:true});
  assert.equal(actual,1.6);assert.equal(view.renderer.toneMappingExposure,1.6);
  CourtView.prototype.setLightingBrightness.call(view,NaN);assert.equal(view.renderer.toneMappingExposure,1.25);
  lobby.dispose();
});
test('rubber has distinct height and matte roughness channels with filtered repeatable detail',()=>{
  const mat=makeCourtMaterial(),height=mat.bumpMap.image.data;
  assert.equal(mat.map.image.width,256);
  assert.notDeepEqual(mat.map.image.data,height);
  assert.equal(mat.bumpMap.colorSpace,THREE.NoColorSpace);
  assert.equal(mat.metalness,0);assert.ok(mat.roughness>=.9);
  assert.ok(mat.bumpScale>0&&mat.bumpScale<.01);
  const roughness=[];for(let i=1;i<height.length;i+=4)roughness.push(height[i]);
  assert.ok(Math.min(...roughness)>=225);assert.ok(Math.max(...roughness)>Math.min(...roughness));
  assert.equal(mat.map.minFilter,THREE.LinearMipmapLinearFilter);
  const other=makeCourtMaterial(0x3333aa);assert.deepEqual(mat.map.image.data,other.map.image.data);
  for(const m of [mat,other]){m.map.dispose();m.bumpMap.dispose();m.dispose();}
});
