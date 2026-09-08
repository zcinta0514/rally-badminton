import * as THREE from 'three';
import { makeAthlete, updateAthlete } from './athlete.js';
import { createMatch, stepMatch } from '../shared/game.js';

document.title = '开拍 · 球员预览';
document.querySelector('link[rel="stylesheet"]')?.setAttribute('href', '/src/model-preview.css');
document.body.removeAttribute('data-screen');
document.body.innerHTML = `
 <header class="preview-header"><strong><i aria-hidden="true">/</i>开拍 <span>RALLY / PLAYER STUDIO</span></strong><a href="/">返回球场 <span aria-hidden="true">↗</span></a></header>
 <main class="preview-main">
  <section class="preview-stage"><canvas aria-label="可拖动旋转的运动员模型"></canvas><div class="preview-caption"><span>PLAYER IN FOCUS</span><b>看清每一次挥拍。</b>左右拖动，自由查看</div><div class="preview-turn"><span aria-hidden="true">↔</span> 拖动画面旋转球员</div></section>
  <aside class="preview-panel"><div class="preview-eyebrow">PLAYER STUDIO</div><h1>球员预览<span aria-hidden="true">.</span></h1><p>近距离看看你的球员。切换动作与角度，拖动进度查看挥拍细节。</p>
   <label>动作展示</label><div class="preview-options" id="poses"><button data-pose="ready" aria-pressed="true">准备站姿</button><button data-pose="run" aria-pressed="false">移动步伐</button><button data-pose="smash" aria-pressed="false">起跳杀球</button><button data-pose="lunge" aria-pressed="false">跨步伸拍</button></div>
   <label>观察方向</label><div class="preview-options" id="angles"><button data-angle="0" aria-pressed="true">正面</button><button data-angle="0.7" aria-pressed="false">侧前方</button><button data-angle="1.5707963" aria-pressed="false">侧面</button><button data-angle="3.1415927" aria-pressed="false">背面</button></div>
   <label>球衣配色</label><div class="preview-options color-options" id="colors"><button data-color="0" aria-pressed="true">珊瑚红</button><button data-color="1" aria-pressed="false">薄荷绿</button></div>
   <button class="preview-play" id="preview-play">暂停动作 Ⅱ</button><label for="pose-time">拖动进度，定格查看</label><input id="pose-time" type="range" min="0" max="1000" value="0" aria-label="动作进度">
   <small>与比赛使用同款球员模型。</small>
  </aside>
 </main>`;

const canvas = document.querySelector('canvas'), stage = document.querySelector('.preview-stage');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x172d31);
scene.add(new THREE.HemisphereLight(0xf3f3e7,0x5f7876,2.2));
const key = new THREE.DirectionalLight(0xffe8d2,3.0);key.position.set(-3,6,-4);key.castShadow=true;
key.shadow.mapSize.set(1024,1024); Object.assign(key.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:15});
key.shadow.bias=-.0003;scene.add(key);
const fill = new THREE.DirectionalLight(0xc4e3f3,1.2);fill.position.set(3,2,3);scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(8,64),new THREE.MeshStandardMaterial({color:0x263f3b,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.006;floor.receiveShadow=true;scene.add(floor);
const outline = new THREE.Mesh(new THREE.RingGeometry(1.08,1.087,80),new THREE.MeshBasicMaterial({color:0x466858,side:THREE.DoubleSide}));
outline.rotation.x=-Math.PI/2;outline.position.y=.003;scene.add(outline);
const camera = new THREE.PerspectiveCamera(36,1,.05,40);
const athlete = new THREE.Group();scene.add(athlete);
let rig=makeAthlete(athlete,0),kind='ready',frames=[],time=0,last=0,index=-1,angle=0,playing=true,reset=true;

function buildClip(pose) {
 const state=createMatch();state.phase='rally';state.service.active=false;state.time=1;
 Object.assign(state.players[0],{x:0,z:3.8,vx:0,vz:0});
 Object.assign(state.shuttle,{x:pose==='lunge'?.8:.35,y:pose==='lunge'?1.2:3.7,z:pose==='lunge'?2.8:3.6,vx:0,vy:-.2,vz:0,active:true,lastHit:1});
 const result=[];
 for(let i=0;i<180;i++){
  if(pose==='ready'){state.time+=1/120;state.shuttle.active=false;}
  else if(pose==='run'){
   state.shuttle.active=false;
   stepMatch(state,[{x:i<90?1:-1,z:-.25},{}],1/120);
  } else stepMatch(state,[i===30?{shot:pose==='smash'?'smash':'drop',charge:.35}:i<30?{prepare:pose==='smash'?'smash':'drop'}:{},{}],1/120);
  result.push(structuredClone(state));
 }
 return result;
}
function selectPose(value){kind=value;frames=buildClip(value);time=0;index=-1;reset=true;playing=true;document.getElementById('preview-play').textContent='暂停动作 Ⅱ';pointCamera();}
function pressed(group,key,value){document.querySelectorAll(`#${group} button`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[key]===String(value))));}
function pointCamera(){const aspect=Math.max(.2,stage.clientWidth/stage.clientHeight),high=kind==='smash',height=high?1.5:kind==='lunge'?.92:1.02,base=high?6.4:kind==='lunge'?5:kind==='run'?4.6:4.2,distance=Math.max(base,2.5/aspect);camera.aspect=aspect;camera.position.set(Math.sin(angle)*distance,height+.7,-Math.cos(angle)*distance);camera.lookAt(0,height,0);camera.updateProjectionMatrix();}
function resize(){renderer.setSize(stage.clientWidth,stage.clientHeight,false);pointCamera();}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
document.getElementById('poses').addEventListener('click',event=>{const b=event.target.closest('[data-pose]');if(b){selectPose(b.dataset.pose);pressed('poses','pose',b.dataset.pose);}});
document.getElementById('angles').addEventListener('click',event=>{const b=event.target.closest('[data-angle]');if(b){angle=Number(b.dataset.angle);pointCamera();pressed('angles','angle',b.dataset.angle);}});
document.getElementById('colors').addEventListener('click',event=>{
 const b=event.target.closest('[data-color]');if(!b)return;
 const geometries=new Set(),materials=new Set();athlete.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
 athlete.clear();rig.skeleton.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
 rig=makeAthlete(athlete,Number(b.dataset.color));reset=true;pressed('colors','color',b.dataset.color);
});
document.getElementById('preview-play').addEventListener('click',()=>{playing=!playing;document.getElementById('preview-play').textContent=playing?'暂停动作 Ⅱ':'继续动作 ▷';});
document.getElementById('pose-time').addEventListener('input',event=>{playing=false;time=Number(event.target.value)/1000*(frames.length-1)/120;reset=true;document.getElementById('preview-play').textContent='继续动作 ▷';});
let drag=null;
canvas.addEventListener('pointerdown',event=>{drag={id:event.pointerId,x:event.clientX,angle};canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;angle=drag.angle+(event.clientX-drag.x)*.012;pointCamera();pressed('angles','angle','custom');});
for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>{drag=null;});
selectPose('ready');resize();
function draw(now){
 const dt=Math.min(.05,(now-last)/1000||0);last=now;
 if(playing)time+=dt;
 const next=Math.floor(time*120)%frames.length;
 // A scrub or a new outfit must reconstruct the same planted feet and turn
 // history as playback. Sampling only its final state would reset a run to idle.
 if(reset||next<index)index=-1;
 for(let i=index+1;i<=next;i++){
  const frame=frames[i];
  updateAthlete(rig,frame.players[0],0,frame.shuttle,frame.time,1/120,false,false,i===0);
 }
 index=next;reset=false;
 const state=frames[index],p=state.players[0];
 rig.halo.visible=false;rig.selected.visible=false;rig.shadow.visible=false;
 athlete.position.set(-p.x,0,-p.z);
 if(playing)document.getElementById('pose-time').value=String(Math.round(index/(frames.length-1)*1000));
 renderer.render(scene,camera);
 requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
// Read-only inspection handles; QA does not modify the game's renderer or state.
window.__modelPreview={get rig(){return rig;},renderer,scene,camera,get state(){return frames[index];},get frames(){return frames;},get kind(){return kind;}};
