import { normalizeBrightness } from './arena-preferences.js';
import * as THREE from 'three';
import { makeAthlete, applyAthletePose, bend } from './athlete.js';
import { upgradeAthlete } from './athlete-import.js';

const ATHLETE = Object.freeze({ x: 4.25, z: 5.1 });
// Keep the near baseline official (x=5.65,z=6.7) outside the close-up frustum.
const CUP_ATHLETE = Object.freeze({ x: 2.85, z: 5.1 });
const HEADING = -2.55;
const JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'head',
  ...['left', 'right'].flatMap(side => ['Hip', 'Knee', 'Ankle', 'Shoulder', 'Elbow', 'Wrist'].map(name => side + name))];

/** Light circuits ease up from an already readable frame, then drift by at most 1%.
 * These are intensity changes only: no moving beams, colour cycling or flashing.
 * Supplying the output object avoids frame allocations. Time is active lobby time.
 */
export function sampleLobbyLighting(time, out = {}) {
  const elapsed = Math.max(0, Number.isFinite(time) ? time : 0);
  const entry = Math.min(1, elapsed);
  const settled = .86 + .14 * entry ** 3 * (entry * (entry * 6 - 15) + 10);
  const age = Math.max(0, elapsed - 1), ramp = Math.min(1, age / 3);
  const drift = ramp * ramp * (3 - 2 * ramp), tau = Math.PI * 2;
  out.main = settled * (1 + drift * (.006 * Math.sin(age * tau / 31) + .003 * Math.sin(age * tau / 53)));
  out.side = settled * (1 + drift * (.007 * Math.sin(age * tau / 41) - .003 * Math.sin(age * tau / 67)));
  out.back = settled * (1 + drift * (.005 * Math.sin(age * tau / 47) + .003 * Math.sin(age * tau / 71)));
  return out;
}

/** A quiet, planted waiting pose. The optional output keeps the lobby clock allocation-light. */
export function sampleLobbyPose(time, out) {
  const pose = out || { joints: Object.fromEntries(JOINTS.map(name => [name, { x: 0, y: 0, z: 0 }])),
    racketHead: { x: 0, y: 0, z: 0 }, jump: 0, crouch: 0, active: 0, actionType: null,
    heading: HEADING, pelvisYaw: HEADING, chestYaw: HEADING, headYaw: HEADING - .16,
    headPitch: -.025, racketRoll: .22, stroke: 0, lean: { x: 0, y: 0, z: 0 } };
  const breath = Math.sin(time * 1.65) * .004;
  const set = (name, x, y, z) => Object.assign(pose.joints[name], { x, y, z });
  set('pelvis', -.018, .93, .018);
  set('spine', -.014, 1.16 + breath * .5, .005);
  set('chest', -.008, 1.44 + breath, -.008);
  set('neck', -.008, 1.53 + breath, -.008);
  set('head', -.008, 1.70 + breath, -.012);
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const hip = set(side + 'Hip', -.018 + sign * .145, .885, .018);
    const ankle = set(side + 'Ankle', sign * .19, .085, sign === 1 ? .065 : -.055);
    Object.assign(pose.joints[side + 'Knee'], bend(hip, ankle, .45, .43, { x: 0, y: .1, z: -1 }));
    const shoulder = set(side + 'Shoulder', -.008 + sign * .245, 1.445 + breath, -.008);
    const wrist = set(side + 'Wrist', sign * .32, .865 + breath * .7, sign === 1 ? -.10 : -.045);
    Object.assign(pose.joints[side + 'Elbow'], bend(shoulder, wrist, .32, .31, { x: sign * .2, y: -.5, z: .65 }));
  }
  Object.assign(pose.racketHead, { x: .43, y: .35 + breath * .7, z: -.22 });
  const cos = Math.cos(HEADING), sin = Math.sin(HEADING);
  for (const name of JOINTS) {
    const p = pose.joints[name], x = p.x;
    p.x = cos * x + sin * p.z; p.z = -sin * x + cos * p.z;
  }
  const x = pose.racketHead.x;
  pose.racketHead.x = cos * x + sin * pose.racketHead.z;
  pose.racketHead.z = -sin * x + cos * pose.racketHead.z;
  return pose;
}

function contactTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    const alpha = Math.pow(Math.max(0, 1 - radius), 2.3) * 220;
    data.set([5, 13, 12, alpha], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.name = 'lobby-contact-falloff';
  return texture;
}

function recolorAthlete(visual) {
  const original = [new THREE.Color(0xf07759), new THREE.Color(0xffd69b)];
  const replacement = [new THREE.Color(0xe9e6d9), new THREE.Color(0x568b76)];
  visual.root.traverse(object => {
    const colors = object.geometry?.attributes.color;
    if (colors) {
      for (let i = 0; i < colors.count; i++) for (let j = 0; j < original.length; j++) {
        const c = original[j];
        if (Math.abs(colors.getX(i) - c.r) + Math.abs(colors.getY(i) - c.g) + Math.abs(colors.getZ(i) - c.b) < .008) {
          colors.setXYZ(i, replacement[j].r, replacement[j].g, replacement[j].b); break;
        }
      }
      colors.needsUpdate = true;
    }
    for (const material of object.material ? [].concat(object.material) : []) {
      if (material.name === 'rally-shirt') material.color.setHex(0xe9e6d9);
      if (material.name === 'rally-accent') material.color.setHex(0x568b76);
      if (/shirt|accent/.test(material.name)) { material.roughness = .88; material.metalness = 0; }
    }
  });
}

export class TournamentLobby {
  constructor({ loadAthlete = true, athleteLoader } = {}) {
    this.scene = new THREE.Scene(); this.scene.name = 'tournament-lobby';
    this.scene.background = new THREE.Color(0x131c1b);
    this.scene.fog = new THREE.Fog(0x172220, 19, 45);
    this.camera = new THREE.PerspectiveCamera(43, 1, .08, 70);
    this.brightness = normalizeBrightness();
    this.clock = 0; this.disposed = false;
    this.lightClock = 0; this.lightingStarted = false; this.lightLevels = sampleLobbyLighting(0);
    this.buildLights();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .95),
      new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: .82, depthWrite: false }));
    shadow.name = 'lobby-contact-shadow';
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .012;
    this.athlete = makeAthlete(this.scene, 0); this.athlete.root.name = 'lobby-waiting-athlete';
    this.athlete.ground.add(shadow);
    this.athlete.halo.visible = false; this.athlete.selected.visible = false;
    this.athlete.shadow.visible = false;
    this.pose = sampleLobbyPose(0); this.applyPose(); recolorAthlete(this.athlete);
    this.athleteLoader = athleteLoader;
    this.retryAthleteIn = Infinity;
    this.athlete.root.visible = this.athlete.ground.visible = !loadAthlete;
    this.showLobbyAthlete = !loadAthlete;
    this.athleteReady = loadAthlete ? this.showOriginalAthlete() : Promise.resolve(false);
    this.layoutCamera(844, 390, false);
  }

  async showOriginalAthlete() {
    this.retryAthleteIn = Infinity;
    const ready = await upgradeAthlete(this.athlete, { loader: this.athleteLoader });
    if (this.disposed) return false;
    if (ready) {
      recolorAthlete(this.athlete);
      this.applyPose();
      this.showLobbyAthlete = true;
      this.athlete.root.visible = this.athlete.ground.visible = !this.cupAthlete;
    } else {
      this.retryAthleteIn = 10;
    }
    return ready;
  }

  buildLights() {
    // Keep ambient light modest: local sources separate the foreground, court and gallery.
    const ambient = new THREE.HemisphereLight(0xe6edf0, 0x343b37, .68);
    ambient.name = 'lobby-indirect-light'; this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xf6f2e9, 1.3); key.position.set(-2.8, 7.2, 4.6);
    key.name = 'lobby-shadow-key';
    key.target.position.set(2.1, 0, 2); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 12, bottom: -12, near: .3, far: 25 });
    key.shadow.bias = -.0003; key.shadow.normalBias = .015; key.shadow.radius = 3;
    this.scene.add(key, key.target);
    // Broad feathered sources approximate the fixed ceiling strips. Only the key casts
    // shadows; the three spatial fills add gradients without extra shadow-map renders.
    const court = new THREE.SpotLight(0xf1f3ed, 210, 23, 1.05, 1, 2);
    court.name = 'lobby-court-soft-top'; court.position.set(.2, 6.85, 1.0);
    court.target.position.set(0, 0, -1.0); this.scene.add(court, court.target);
    const athlete = new THREE.SpotLight(0xf1eee5, 40, 13, .68, 1, 2);
    athlete.name = 'lobby-athlete-soft-key'; athlete.position.set(5.3, 4.5, 8.3);
    athlete.target.position.set(ATHLETE.x, .95, ATHLETE.z); this.scene.add(athlete, athlete.target);
    const rim = new THREE.SpotLight(0xe1eaf0, 90, 15, .90, 1, 2);
    rim.name = 'lobby-sideline-soft-rim'; rim.position.set(6.8, 6.85, 1.8);
    rim.target.position.set(4.1, .8, 4.6); this.scene.add(rim, rim.target);
    const wall = new THREE.SpotLight(0xe4ede9, 68, 11, .70, 1, 2);
    wall.name = 'lobby-gallery-wall-wash'; wall.position.set(-1, 6.8, -10.4);
    // Keep this pool above the gallery: a low, broad wash would brighten every head.
    wall.target.position.set(.5, 5.2, -13.7); this.scene.add(wall, wall.target);
    this.lights = { ambient, key, court, athlete, rim, wall };
    // The planted breathing pose barely moves its shadow. Refresh at 30 Hz while
    // camera, lighting and character animation still render at display cadence.
    key.shadow.autoUpdate = false;
    this.shadowElapsed = Infinity;
    this.applyLighting();
  }

  applyLighting() {
    const level = this.lightLevels;
    this.lights.key.intensity = 1.15 * level.main;
    this.lights.court.intensity = 185 * level.main;
    this.lights.athlete.intensity = 32 * level.side;
    this.lights.rim.intensity = 72 * level.side;
    this.lights.wall.intensity = 60 * level.back;
  }

  updateLighting(dt, reducedMotion) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (reducedMotion) {
      // Reduced-motion startup skips the entrance; toggling it later freezes exactly
      // the currently visible light. A paused/hidden dt=0 never changes either state.
      if (this.lightingStarted) return;
      this.lightClock = 1;
    } else this.lightClock += Math.min(.1, dt);
    this.lightingStarted = true;
    sampleLobbyLighting(this.lightClock, this.lightLevels); this.applyLighting();
  }

  setCupAthlete(athlete, hand = 'right', theme = null) {
    if (this.cupAthlete) {
      const old = this.cupAthlete, saved = this.borrowedAthlete;
      saved.parent.add(old.root, old.ground);
      old.root.visible = saved.visible;
      old.ground.visible = saved.groundVisible;
      old.root.scale.x = saved.hand;
      old.halo.visible = saved.halo;
      old.doublesMarker.visible = saved.marker;
      old.motion = null;
    }
    this.cupAthlete = athlete;
    this.borrowedAthlete = null;
    this.athlete.root.visible = this.athlete.ground.visible = !athlete && this.showLobbyAthlete;
    this.scene.background.setHex(theme?.sky ?? 0x131c1b);
    this.scene.fog.color.setHex(theme?.sky ?? 0x172220);
    this.lights.key.color.setHex(theme?.light ?? 0xf6f2e9);
    if (athlete) {
      this.borrowedAthlete = {parent:athlete.root.parent,visible:athlete.root.visible,
        groundVisible:athlete.ground.visible,hand:athlete.root.scale.x,
        halo:athlete.halo.visible,marker:athlete.doublesMarker.visible};
      this.scene.add(athlete.root, athlete.ground);
      athlete.root.visible = athlete.ground.visible = true;
      athlete.halo.visible = athlete.doublesMarker.visible = false;
      athlete.root.scale.x = hand === 'left' ? -1 : 1;
    }
    this.applyPose();
    this.shadowElapsed = Infinity;
  }

  applyPose() { applyAthletePose(this.cupAthlete || this.athlete, this.pose, this.cupAthlete ? CUP_ATHLETE : ATHLETE); }

  layoutCamera(width, height, reducedMotion) {
    const aspect = Math.max(1, width) / Math.max(1, height);
    if (this.cupAthlete) {
      const camera = this.camera;
      camera.aspect = aspect; camera.fov = 38;
      camera.position.set(CUP_ATHLETE.x + 1.55, 1.42, CUP_ATHLETE.z + 3.45);
      camera.lookAt(CUP_ATHLETE.x, .99, CUP_ATHLETE.z);
      camera.setViewOffset(width, height, -width * (aspect < 1 ? .16 : .27), 0, width, height);
      camera.updateMatrixWorld(true);
      return;
    }
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
    const wide = THREE.MathUtils.clamp((844 / 390 - aspect) / (844 / 390 - 1.6), 0, 1);
    const u = THREE.MathUtils.clamp((1.6 - aspect) / (1.6 - 390 / 844), 0, 1);
    const blend = u * u * (3 - 2 * u), mix = THREE.MathUtils.lerp;
    this.camera.aspect = aspect; this.camera.fov = mix(44, 68, blend);
    const entrance = reducedMotion ? 0 : .18 * Math.exp(-this.clock * 1.25);
    this.camera.position.set(mix(4 + wide, 6.8, blend), mix(1.8, 2.6, blend), mix(9.5 + .3 * wide, 12, blend) + entrance);
    this.camera.lookAt(mix(0, 1.8, blend), mix(.4, .3, blend), mix(0, 1.3, blend));
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(true);
  }

  render(renderer, dt, width, height, { reducedMotion = false } = {}) {
    if (this.disposed) return;
    if (Number.isFinite(this.retryAthleteIn) && Number.isFinite(dt) && dt > 0) {
      this.retryAthleteIn -= Math.min(dt, .1);
      if (this.retryAthleteIn <= 0) this.athleteReady = this.showOriginalAthlete();
    }
    this.updateLighting(dt, reducedMotion);
    this.shadowElapsed += Number.isFinite(dt) ? Math.max(0,dt) : 0;
    if(this.shadowElapsed>=1/30){
      this.lights.key.shadow.needsUpdate=true;this.shadowElapsed=0;
    }
    if (!reducedMotion && Number.isFinite(dt) && dt > 0) {
      this.clock += Math.min(.1, dt); sampleLobbyPose(this.clock, this.pose); this.applyPose();
    }
    this.layoutCamera(width, height, reducedMotion);
    const mapping = renderer.toneMapping, exposure = renderer.toneMappingExposure;
    try {
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = this.brightness;
      renderer.render(this.scene, this.camera);
    } finally { renderer.toneMapping = mapping; renderer.toneMappingExposure = exposure; }
  }

  dispose() {
    if (this.disposed) return;
    if (this.cupAthlete) this.setCupAthlete(null);
    this.disposed = true; this.athlete.disposed = true;
    const geometry = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    this.scene.traverse(object => {
      if (object.geometry) geometry.add(object.geometry);
      if (object.skeleton) skeletons.add(object.skeleton);
      object.shadow?.dispose();
      if (object.isInstancedMesh) object.dispose();
      for (const material of object.material ? [].concat(object.material) : []) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const item of geometry) item.dispose();
    for (const item of skeletons) item.dispose();
    for (const item of textures) item.dispose();
    this.scene.clear();
  }
}
