import * as THREE from 'three';
import { CourtView } from './view.js';
import { Controls } from './controls.js';
import { createMatch, getShotTarget, predictLanding, ROLES } from '../shared/game.js';
import { sampleShuttleFlight } from '../shared/shuttle-flight.js';

const $ = id => document.getElementById(id);
const view = new CourtView($('court'));
view.setMode('match');
let state, flight = null, elapsed = 0, target, last = performance.now(), selectedAim = 0;
const path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0xf2d194,transparent:true,opacity:.75}));
view.scene.add(path);
const buttons = [...document.querySelectorAll('[data-shot]')];
const isFront = () => $('position').value === 'front';
const requestTarget = request => getShotTarget(state, 0, request, {netDrag:$('enabled').checked});
function drawPath(result) {
  const ball = {...state.shuttle,vx:result.vx,vy:result.vy,vz:result.vz};
  const end = predictLanding({...state,shuttle:{...ball,active:true,lastHit:0}});
  const points = Array.from({length:65},(_,i) => {
    const p=sampleShuttleFlight(ball,end.time*i/64);
    return new THREE.Vector3(p.x,Math.max(.02,p.y),p.z);
  });
  path.geometry.dispose();path.geometry=new THREE.BufferGeometry().setFromPoints(points);
  path.visible=true;
}
function describe(request, result, fired=false) {
  const extended=$('enabled').checked && isFront() && request.shot==='drop' && request.aimDepth>0;
  const name=extended && request.aimDepth>.55?'上挑后场':request.shot==='drop'?'轻放 / 吊球':request.shot==='clear'?'高远球':'杀球';
  $('result').textContent=`${fired?'已出球':'瞄准'} · ${name} · 目标距网 ${Math.abs(result.aimZ).toFixed(2)} 米 · ${request.aim<-.1?'左路':request.aim>.1?'右路':'中路'}`;
}
function reset() {
  controls?.reset();
  state=createMatch();state.phase='rally';state.rally=1;
  Object.assign(state.players[0],{x:0,z:isFront()?1.7:5.4});
  Object.assign(state.shuttle,{x:0,y:isFront()?1.05:2.6,z:isFront()?1.3:5.1,vx:0,vy:0,vz:0,active:true,lastHit:1});
  flight=null;elapsed=0;target=null;path.visible=false;
  buttons.forEach(b=>b.disabled=false);
  $('result').textContent=isFront()?'轻点「吊球」放短；向上拖远，挑到后场。':'后场对照：仍使用原有高远、吊球和杀球球路。';
}
const controls = new Controls({joystick:$('joystick'),knob:$('knob'),shotButtons:buttons,
  onAimSelect:value=>{selectedAim=value;},
  onShot:request=>{
    if(flight)return;
    request.aim=request.aimExplicit?request.aim:selectedAim;
    target=requestTarget(request);drawPath(target);describe(request,target,true);
    flight={...state.shuttle,vx:target.vx,vy:target.vy,vz:target.vz};
    const end=predictLanding({...state,shuttle:{...flight,active:true,lastHit:0}});
    flight.end=end;
    state.shuttle.lastHit=0;state.hitId++;state.players[0].lastShot=request.shot;state.players[0].swing=ROLES[state.players[0].role].swingTime;
    buttons.forEach(b=>b.disabled=true);
  }
});
for(const id of ['reset','enabled','position'])$(id).addEventListener(id==='reset'?'click':'change',reset);
window.addEventListener('resize',()=>view.resize());
reset();
function frame(now) {
  const dt=Math.min((now-last)/1000,.05);last=now;state.time+=dt;
  if(flight){
    elapsed+=dt;Object.assign(state.shuttle,sampleShuttleFlight(flight,Math.min(elapsed,flight.end.time)));
    if(elapsed>=flight.end.time)state.shuttle.active=false;
    state.players[0].swing=Math.max(0,state.players[0].swing-dt);
  } else if(controls.activeShot) {
    const active=controls.activeShot;
    const request={shot:active.shot,aim:active.aimExplicit?active.aim:selectedAim,aimDepth:active.aimDepth,charge:controls.sample().charge};
    target=requestTarget(request);drawPath(target);describe(request,target);
  } else {target=null;path.visible=false;}
  view.render(state,0,dt,{target,prepare:target?controls.activeShot?.shot:null});
  view.staminaHUD.hide();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
