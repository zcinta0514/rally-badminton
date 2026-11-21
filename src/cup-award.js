import * as THREE from 'three';
import { bend } from './athlete.js';
import { sampleFinalePose } from './finale-pose.js';
import { CUP_EVENTS } from './cup-draw.js';
import { cupVenueTheme } from './cup-venue.js';

export const STAGE_HEIGHT = .58;
const gripWidth = .215;
const smooth = t => THREE.MathUtils.smoothstep(t, 0, 1);

// All points use the same local athlete frame (facing -Z). The handle centres
// come from the wrist targets, including during the lift, with no second clock.
export function sampleCupLift(age, reducedMotion = false) {
  const lift = reducedMotion ? 1 : smooth((age - .68) / 1.52);
  const y = 1.23 + .75 * lift;
  const z = -.32 + .24 * lift - .15 * Math.sin(Math.PI * lift);
  const pose = sampleFinalePose('winner', 0);
  pose.actionType = 'award';
  pose.headPitch = -.12 * lift;
  for (const [arm, sign] of [['left', -1], ['right', 1]]) {
    const wrist = {x: sign * gripWidth, y, z};
    pose.joints[arm+'Wrist'] = wrist;
    pose.joints[arm+'Elbow'] = bend(pose.joints[arm+'Shoulder'], wrist, .32, .31, {x: sign, y: -.15, z: .1});
  }
  pose.racketHead = {...pose.joints.rightWrist, y: y + .54};
  return {pose, y, z};
}

function solid(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeTrophy() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc751, metalness: .52, roughness: .24,
    emissive: 0x503008, emissiveIntensity: .36, side: THREE.DoubleSide });
  const ebony = new THREE.MeshStandardMaterial({ color: 0x293039, metalness: .25, roughness: .4 });
  const cup = new THREE.Group();
  const profile = [[.055,-.13],[.075,-.116],[.028,-.097],[.022,-.063],[.045,-.037],
    [.067,-.029],[.09,-.01],[.119,.029],[.141,.095],[.156,.159],[.149,.168],
    [.138,.154],[.124,.096],[.103,.044],[.075,.01],[.04,-.014],[0,-.015]];
  solid(cup,new THREE.LatheGeometry(profile.map(([r,h]) => new THREE.Vector2(r,h)),40),gold,0,0,0);
  solid(cup,new THREE.CylinderGeometry(.083,.096,.046,20),ebony,0,-.148,0);
  for (const side of [-1,1]) {
    const curve = new THREE.CatmullRomCurve3([[.139,.122],[.194,.131],[.217,.10],[gripWidth,.041],
      [.188,.003],[.132,-.012],[.098,.005]].map(([x,y]) => new THREE.Vector3(x*side,y,0)));
    solid(cup,new THREE.TubeGeometry(curve,20,.013,7,false),gold,0,0,0);
  }
  return cup;
}

function nameplate(event, name, theme) {
  const canvas = document.createElement('canvas');
  canvas.width=1152; canvas.height=224;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle=theme.sign; ctx.fillRect(0,0,1152,224);
  ctx.fillStyle=theme.ink; ctx.fillRect(0,0,1152,8);
  ctx.textAlign='center';
  ctx.font='600 51px "Microsoft YaHei",sans-serif';
  ctx.fillText(event.name+' · 单打冠军',576,82,1050);
  ctx.fillStyle='#ffffff'; ctx.font='bold 89px "Microsoft YaHei",sans-serif';
  ctx.fillText(name,576,184,1040);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map,toneMapped:false});
}

function confetti(theme) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.042,.085),
    new THREE.MeshBasicMaterial({side:THREE.DoubleSide,toneMapped:false}),84);
  mesh.frustumCulled=false;
  const colors=[0xffcf62,theme.edge,0xfff7df];
  for(let i=0;i<mesh.count;i++) mesh.setColorAt(i,new THREE.Color(colors[i%3]));
  return mesh;
}

export function makeCupAward({eventId,name}) {
  const event=CUP_EVENTS.find(e=>e.id===eventId), theme=cupVenueTheme(eventId);
  const stage=new THREE.Group(), cup=makeTrophy(), ribbons=confetti(theme);
  // Beside the far singles sideline. The camera shoots from inside the court,
  // facing the stands, without passing the net or crossing perimeter boards.
  stage.position.set(-3.99,0,-3.35); stage.rotation.y=Math.PI/2;
  const base=new THREE.MeshStandardMaterial({color:theme.dark,roughness:.55});
  const trim=new THREE.MeshStandardMaterial({color:theme.edge,roughness:.4,metalness:.22});
  solid(stage,new THREE.BoxGeometry(3.72,.16,1.46),base,0,.08,0);
  solid(stage,new THREE.BoxGeometry(2.65,STAGE_HEIGHT-.16,1.30),base,0,(STAGE_HEIGHT+.16)/2,0);
  solid(stage,new THREE.BoxGeometry(2.7,.025,1.33),trim,0,STAGE_HEIGHT-.0125,0);
  solid(stage,new THREE.PlaneGeometry(2.6,.505),nameplate(event,name,theme),0,.30,.735);
  stage.add(cup,ribbons);
  const dummy=new THREE.Object3D();
  function frame(age,reduced) {
    const lift=sampleCupLift(age,reduced);
    cup.position.set(0,STAGE_HEIGHT+lift.y,-lift.z);
    ribbons.visible=!reduced && age>1.9;
    if(ribbons.visible){
      for(let i=0;i<ribbons.count;i++){
        const t=age-1.9-(i%18)*.06;
        // Two short sprays peel outwards, leaving the face and cup unobstructed.
        const side=i%2?1:-1, duration=2.35+.08*(i%8);
        const visible=t>0&&t<duration;
        dummy.scale.setScalar(visible?1:0);
        dummy.position.set(side*(1.42-.34*t+.17*Math.sin(t*3+i)),.5+t*(3.9+.14*(i%6))-1.65*t*t,
          -.57+.13*Math.cos(i+t*2));
        dummy.rotation.set(t*4+i,t*3.7+i,t*2+i);dummy.updateMatrix();
        ribbons.setMatrixAt(i,dummy.matrix);
      }
      ribbons.instanceMatrix.needsUpdate=true;
    }
    return lift.pose;
  }
  return {stage,cup,frame};
}

export function frameCupAwardCamera(camera,stage,aspect,age,reduced) {
  const push=reduced?1:smooth(age/3.2);
  camera.clearViewOffset();camera.aspect=aspect;camera.fov=37;
  const distance=Math.max(5.45,4.9/Math.max(.3,aspect))+.48*(1-push);
  const eye=stage.localToWorld(new THREE.Vector3(.34*(1-push),1.56,distance));
  const target=stage.localToWorld(new THREE.Vector3(0,1.37,0));
  camera.position.copy(eye);camera.up.set(0,1,0);camera.lookAt(target);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
