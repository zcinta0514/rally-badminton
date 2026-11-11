import * as THREE from 'three';

export const ENTRANCE_SECONDS = 1.8;
const clamp = value => Math.max(0, Math.min(1, value));
export const entranceEase = value => { const t=clamp(value);return t*t*t*(t*(t*6-15)+10); };

/** Presentation only. Online authority always has priority over this clock. */
export class MatchEntrance {
  constructor(){this.cancel();}
  cancel(){this.active=false;this.elapsed=0;this.duration=ENTRANCE_SECONDS;this.progress=1;}
  begin({online=false,phase='serve',remaining=0,reducedMotion=false,fromLobby=true}={}){
    this.cancel();this.online=online;
    if(reducedMotion||!fromLobby||(online&&(phase!=='countdown'||remaining<.65)))return false;
    this.duration=online?Math.min(ENTRANCE_SECONDS,remaining-.35):ENTRANCE_SECONDS;
    this.active=true;this.progress=0;return true;
  }
  advance(dt,{hidden=false,reducedMotion=false,phase='serve',remaining=0}={}){
    if(!this.active)return;
    if(reducedMotion||(this.online&&(phase!=='countdown'||remaining<=.3))){this.cancel();return;}
    if(hidden)return;
    this.elapsed+=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));
    this.progress=clamp(this.elapsed/this.duration);
    if(this.progress>=1)this.active=false;
  }
}

/** Orbit outside the net, rise, then land exactly on the configured match camera. */
export function applyEntranceCamera(camera,from,to,progress){
  const t=entranceEase(progress);
  if(t>=1){camera.copy(to);camera.updateMatrixWorld(true);return;}
  if(t<=0){camera.copy(from);camera.updateMatrixWorld(true);return;}
  const startYaw=Math.atan2(from.position.x,from.position.z),endYaw=Math.atan2(to.position.x,to.position.z);
  const yaw=startYaw+Math.atan2(Math.sin(endYaw-startYaw),Math.cos(endYaw-startYaw))*t;
  const radius=THREE.MathUtils.lerp(Math.hypot(from.position.x,from.position.z),Math.hypot(to.position.x,to.position.z),t);
  camera.position.set(Math.sin(yaw)*radius,THREE.MathUtils.lerp(from.position.y,to.position.y,t)+Math.sin(Math.PI*t)*1.2,Math.cos(yaw)*radius);
  const target=new THREE.Vector3(0,0,-1).applyQuaternion(from.quaternion);
  const distance=Math.abs(target.y)>.01?(from.position.y-.35)/-target.y:10;
  target.multiplyScalar(distance).add(from.position).multiplyScalar(1-t);
  camera.up.set(0,1,0);camera.lookAt(target);
  camera.aspect=to.aspect;camera.fov=THREE.MathUtils.lerp(from.fov,to.fov,t);
  const offset=to.view;
  if(offset?.enabled)camera.setViewOffset(offset.fullWidth,offset.fullHeight,offset.offsetX*t,offset.offsetY*t,offset.width,offset.height);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
