import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCupHall } from '../src/cup-hall.js';
import { installTournamentArena } from '../src/tournament-arena.js';
import { fitCourtViewport } from '../src/court-layout.js';

function canvas(t) {
  const text=[];
  globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(s){text.push(s);}})})};
  t.after(()=>delete globalThis.document);
  return text;
}
test('independent bay and crown structures, centre-court capacity, live four-faced display, bounded draw calls',t=>{
  const text=canvas(t);
  for(const id of ['bay','crown']){
    let regularSeats=0;
    for(const center of [false,true]){
      const {group,update}=makeCupHall(id,center);
      let draws=0,triangles=0;
      group.traverse(node=>{
        if(!node.isMesh)return;
        draws++;
        triangles+=(node.geometry.index?.count??node.geometry.getAttribute('position').count)/3*(node.count??1);
      });
      assert.ok(draws<=(id==='bay'?8:11));
      assert.ok(triangles<250000);
      assert.ok(group.getObjectByName(id+'-spectator-legs').count>50);
      assert.equal(group.userData.tierCount,id==='bay'?1:2);
      assert.ok(group.getObjectByName(id==='bay'?'bay-canopy':'crown-halo'));
      const seats=group.getObjectByName(id+'-seats').count;
      if(center)assert.ok(seats>regularSeats);
      else regularSeats=seats;
      const cube=group.getObjectByName('crown-score-cube');
      if(id==='bay'){assert.equal(cube,undefined);continue;}
      assert.equal(cube.children.length,4);
      update([5,4],'林小满','森川直树');
      assert.deepEqual(text.slice(-5),['开拍冠军杯','5','4','林小满','森川直树']);
      const count=text.length;
      update([5,4],'林小满','森川直树');
      assert.equal(text.length,count);
    }
  }
});

test('exported standard venue can yield its entire roof and bowl while regulation court assets stay live',async t=>{
  canvas(t);
  const bytes=await readFile(new URL('../src/models/tournament-hall.glb',import.meta.url));
  const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const hall=installTournamentArena(model);
  const buildings=hall.scene.children.filter(n=>n.name.startsWith('AR__')&&n.name!=='AR__Competition_surround');
  assert.ok(buildings.length>24);
  hall.setCupArchitectureVisible(false);
  assert.ok(buildings.every(n=>!n.visible));
  for(const name of ['AR__Competition_surround','Court_|_40_mm_line_paint','Umpire_Main']){
    assert.equal(hall.scene.getObjectByName(name).visible,true);
  }
  hall.setCupArchitectureVisible(true);
  assert.ok(buildings.every(n=>n.visible));
});

test('normal, low and steep match camera rays and the award camera stay clear in all four buildings',t=>{
  canvas(t);
  const ray=new THREE.Raycaster();
  for(const id of ['bay','crown']) for(const center of [false,true]){
    const {group}=makeCupHall(id,center);
    group.updateMatrixWorld(true);
    function unobstructed(eye,target,label){
      const d=target.clone().sub(eye);
      ray.set(eye,d.clone().normalize());ray.far=d.length()-.045;
      assert.equal(ray.intersectObject(group,true)[0]?.object.name,undefined,id+' '+label);
    }
    for(const pitchDegrees of [18,24,40]){
      const view=fitCourtViewport(844,390,0,{camera:{pitchDegrees}});
      const eye=new THREE.Vector3(0,Math.sin(view.pitch)*view.distance,Math.cos(view.pitch)*view.distance);
      for(const z of [-6.55,0,6.55])for(const x of [-2.55,0,2.55])for(const y of [.1,1.8,3.6,6.9]){
        unobstructed(eye,new THREE.Vector3(x,y,z),pitchDegrees+' '+[x,y,z].join(','));
      }
    }
    for(const y of [.1,1.85,2.8])unobstructed(new THREE.Vector3(1.65,1.56,-3.35),new THREE.Vector3(-3.99,y,-3.35),'award');
  }
});
