import * as THREE from 'three';
import { makeAthlete, applyAthletePose, bend } from './athlete.js';
import { upgradeAthlete } from './athlete-import.js';
import { makeCourtMaterial } from './arena.js';
import { makeNetVisual } from './net-visual.js';
import { normalizeCourtPalette, resolveCourtPalette } from './court-palettes.js';

const ATHLETE = Object.freeze({ x: 4.25, z: 5.1 });
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

const standard = (name, color, roughness, metalness = 0) => {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness }); mat.name = name; return mat;
};

const fixtureMaterial = (name, color) => {
  const mat = standard(name, 0x060a08, .52, .1);
  mat.emissive.setHex(color); mat.emissiveIntensity = 1.6;
  return mat;
};

function box(parent, name, size, position, material, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name; mesh.position.set(...position); mesh.receiveShadow = true; mesh.castShadow = shadow;
  parent.add(mesh); return mesh;
}

/** Static architectural parts use one draw per material/shape, including spectator silhouettes. */
function batches(parent) {
  const items = new Map(), transform = new THREE.Object3D();
  const geometries = { box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 10, 8),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8) };
  return {
    add(mat, shape, position, scale, rotation = [0, 0, 0], color = null) {
      const key = `${mat.uuid}:${shape}`;
      if (!items.has(key)) items.set(key, { mat, shape, list: [] });
      transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix();
      items.get(key).list.push({ matrix: transform.matrix.clone(), color });
    },
    finish() {
      const used = new Set();
      for (const { mat, shape, list } of items.values()) {
        used.add(shape);
        const mesh = new THREE.InstancedMesh(geometries[shape], mat, list.length);
        mesh.name = `lobby-${mat.name}-${shape}`; mesh.receiveShadow = true;
        list.forEach((item, i) => { mesh.setMatrixAt(i, item.matrix); if (item.color !== null) mesh.setColorAt(i, new THREE.Color(item.color)); });
        mesh.computeBoundingSphere(); parent.add(mesh);
      }
      for (const [shape, geometry] of Object.entries(geometries)) if (!used.has(shape)) geometry.dispose();
    },
  };
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

function surfaceGrain(kind) {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  let seed = 491;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed >>> 25) / 127;
    const grain = kind === 'wood' ? 205 + 25 * Math.sin(x * .77 + Math.sin(y * .08) * 1.8) + noise * 15
      : 220 + noise * 25 - (x % 8 === 0 ? 28 : 0);
    pixels.set([grain, grain, grain, 255], (y * size + x) * 4);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.name = `lobby-${kind}-grain`;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(kind === 'wood' ? 1 : 7, 1);
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true; return map;
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
    this.clock = 0; this.disposed = false; this.courtPalette = 'green';
    this.lightClock = 0; this.lightingStarted = false; this.lightLevels = sampleLobbyLighting(0);
    this.materials = {
      floor: standard('charcoal-rubber', 0x303734, .97), wall: standard('acoustic-wall', 0x2b3230, .94),
      panel: standard('wall-panels', 0x343b37, .90), metal: standard('powder-coated-steel', 0x59645b, .38, .7),
      beam: standard('roof-steel', 0x1b2422, .56, .5), wood: standard('oiled-ash-bench', 0x977044, .58),
      seat: standard('moulded-seats', 0x3e5147, .66), crowd: standard('spectator-fabric', 0xffffff, .93),
      accent: standard('tournament-green', 0x78b98b, .72), line: standard('painted-court-lines', 0xe7ecd8, .96),
      court: makeCourtMaterial(resolveCourtPalette('green').court), apron: standard('apron-rubber', 0x234b40, .97),
      bag: standard('woven-racket-bag', 0x20332e, .92), bagTrim: standard('bag-piping', 0xa0aa82, .73),
      towel: standard('cotton-towel', 0xd3d3bb, 1),
      fixture: fixtureMaterial('court-strip-diffuser', 0xf2f1e9),
      fixtureSide: fixtureMaterial('sideline-strip-diffuser', 0xe5edf0),
      fixtureBack: fixtureMaterial('gallery-strip-diffuser', 0xe4e9e7),
    };
    this.materials.panel.bumpMap = surfaceGrain('acoustic'); this.materials.panel.bumpScale = .025;
    this.materials.wood.map = surfaceGrain('wood'); this.materials.wood.map.colorSpace = THREE.SRGBColorSpace;
    this.materials.wood.bumpMap = this.materials.wood.map; this.materials.wood.bumpScale = .008;
    this.buildHall(); this.buildCourt(); this.buildWaitingArea(); this.buildLights();
    this.athlete = makeAthlete(this.scene, 0); this.athlete.root.name = 'lobby-waiting-athlete';
    this.athlete.ground.visible = false;
    this.pose = sampleLobbyPose(0); this.applyPose(); recolorAthlete(this.athlete);
    this.athleteReady = loadAthlete ? upgradeAthlete(this.athlete, athleteLoader ? { loader: athleteLoader } : {}).then(ready => {
      if (!this.disposed && ready) { recolorAthlete(this.athlete); this.applyPose(); }
      return ready;
    }) : Promise.resolve(false);
    this.layoutCamera(844, 390, false);
  }

  buildHall() {
    const m = this.materials, scene = this.scene, b = batches(scene);
    box(scene, 'lobby-hall-floor', [23, .2, 29], [0, -.12, 0], m.floor);
    box(scene, 'lobby-roof', [22.4, .24, 28.4], [0, 8.1, 0], m.wall);
    box(scene, 'lobby-far-wall', [22.4, 8.1, .25], [0, 4, -14], m.wall);
    box(scene, 'lobby-near-wall', [22.4, 8.1, .25], [0, 4, 14], m.wall);
    for (const x of [-11, 11]) {
      box(scene, 'lobby-side-wall', [.25, 8.1, 28], [x, 4, 0], m.wall);
      for (let z = -12; z <= 12; z += 3) {
        b.add(m.panel, 'box', [x * .994, 2, z], [.06, 3.9, 2.92]);
        b.add(m.beam, 'box', [x * .981, 4, z], [.26, 8, .22]);
      }
      b.add(m.accent, 'box', [x * .984, 3.78, 0], [.025, .055, 27.5]);
    }
    // Complete ceiling and repeated trusses keep the low oblique view inside a real hall.
    for (let z = -12; z <= 12; z += 4) {
      b.add(m.beam, 'box', [0, 7.78, z], [22, .38, .24]);
      b.add(m.metal, 'box', [0, 7.16, z], [21.5, .11, .12]);
      for (let x = -9; x <= 9; x += 3) {
        b.add(m.beam, 'box', [x, 7.49, z], [3, .065, .065], [0, 0, x % 2 ? .21 : -.21]);
      }
      for (const x of [-5.6, .2, 5.6]) {
        b.add(m.metal, 'box', [x, 6.98, z], [3.1, .13, .29]);
        const diffuser = z <= -8 ? m.fixtureBack : x === .2 ? m.fixture : m.fixtureSide;
        b.add(diffuser, 'box', [x, 6.9, z], [2.92, .025, .22]);
      }
    }
    for (const x of [-7.4, -2.5, 2.5, 7.4]) b.add(m.beam, 'box', [x, 7.97, 0], [.13, .10, 28]);
    for (let x = -10; x <= 10; x += 2.5) {
      b.add(m.panel, 'box', [x, 2.1, -13.8], [2.4, 4.15, .08]);
      b.add(m.beam, 'box', [x, 5.7, -13.77], [.09, 3.4, .08]);
    }
    b.add(m.accent, 'box', [0, 3.78, -13.7], [21, .055, .04]);
    // Far-end spectator rows: one instanced draw per part/material, no animated rigs.
    const shirts = [0x737c72, 0x536759, 0xa3977e, 0x456058, 0x5d686c, 0x8b7460];
    const skins = [0xb98f71, 0x8f674f, 0xd0a382, 0x785b47];
    for (let row = 0; row < 4; row++) {
      const z = -9.6 - row * .98, level = row * .34;
      b.add(m.panel, 'box', [0, (level - .03) / 2, z], [17.5, level + .03, .96]);
      for (let col = 0; col < 23; col++) {
        const x = (col - 11) * .73, y = level + .43;
        b.add(m.seat, 'box', [x, y, z], [.49, .08, .43]);
        b.add(m.seat, 'box', [x, y + .23, z - .19], [.47, .43, .065], [-.10, 0, 0]);
        b.add(m.metal, 'box', [x, level + .20, z], [.065, .40, .12]);
        if ((col * 7 + row * 3) % 9 < 2) continue;
        const shirt = shirts[(col + row * 2) % shirts.length], skin = skins[(col + row) % skins.length];
        b.add(m.crowd, 'sphere', [x, y + .36, z + .02], [.19, .27, .13], [0, 0, 0], shirt);
        b.add(m.crowd, 'sphere', [x, y + .75, z + .03], [.113, .145, .11], [0, 0, .035], skin);
        b.add(m.crowd, 'sphere', [x, y + .81, z + .015], [.116, .093, .112], [0, 0, 0], 0x27312d);
        for (const sign of [-1, 1]) {
          b.add(m.crowd, 'cylinder', [x + sign * .20, y + .28, z + .08], [.053, .34, .053], [-.18, 0, sign * .14], shirt);
          b.add(m.crowd, 'sphere', [x + sign * .20, y + .12, z + .11], [.045, .055, .045], [0, 0, 0], skin);
          b.add(m.crowd, 'box', [x + sign * .10, y + .07, z + .17], [.14, .15, .40], [0, 0, 0], 0x29332e);
          b.add(m.crowd, 'cylinder', [x + sign * .10, level + .22, z + .33], [.055, .34, .055], [0, 0, 0], 0x29332e);
        }
      }
    }
    // Low tournament boards and double end gates establish the venue's scale.
    for (const x of [-7.1, -3.55, 0, 3.55, 7.1]) {
      b.add(m.bag, 'box', [x, .37, -8.65], [3.40, .72, .13]);
      b.add(m.accent, 'box', [x, .69, -8.57], [3.36, .035, .018]);
      for (const stripe of [-1, 0, 1]) b.add(m.towel, 'box', [x + stripe * .14, .36, -8.57], [.05, .22, .018], [0, 0, -.25]);
    }
    for (const x of [-9.3, 9.3]) {
      b.add(m.beam, 'box', [x, 1.28, -13.60], [1.3, 2.55, .12]);
      b.add(m.metal, 'box', [x + .43, 1.05, -13.50], [.04, .28, .035]);
      b.add(m.accent, 'box', [x, 2.74, -13.51], [.52, .16, .025]);
    }
    b.finish();
  }

  buildCourt() {
    const m = this.materials, b = batches(this.scene);
    box(this.scene, 'lobby-court-apron', [9.3, .018, 17], [0, -.010, 0], m.apron);
    box(this.scene, 'lobby-playing-surface', [6.1, .014, 13.4], [0, .006, 0], m.court);
    // Regulation doubles/singles edges and 1.98m short-service / 0.76m rear-service lines.
    for (const x of [-3.03, -2.57, 2.57, 3.03]) b.add(m.line, 'box', [x, .0155, 0], [.04, .003, 13.4]);
    for (const z of [-6.68, -5.92, -2, 2, 5.92, 6.68]) b.add(m.line, 'box', [0, .0155, z], [6.1, .003, .04]);
    for (const sign of [-1, 1]) b.add(m.line, 'box', [0, .0155, sign * 4.34], [.04, .003, 4.72]);
    for (const x of [-3.05, 3.05]) {
      box(this.scene, 'lobby-net-base', [.38, .12, .50], [x, .06, 0], m.metal, true);
      box(this.scene, 'lobby-net-post', [.06, 1.55, .06], [x, .775, 0], m.metal, true);
      b.add(m.accent, 'box', [x, .68, .037], [.064, .37, .016]);
    }
    b.finish(); this.net = makeNetVisual(this.scene);
    // The gameplay net has a little collision margin; the lobby uses exact 6.1m post spacing.
    this.net.group.scale.x = 3.05 / 3.17;
  }

  buildWaitingArea() {
    const m = this.materials, scene = this.scene, group = new THREE.Group();
    group.name = 'lobby-bench-and-equipment'; group.position.set(5.2, -.019, 3.9); scene.add(group);
    // Four separated ash slats, open steel legs and a low backrest.
    for (let n = 0; n < 4; n++) box(group, 'bench-seat-slat', [.115, .065, 2.10], [-.195 + n * .13, .455, 0], m.wood, true);
    for (const z of [-.80, .80]) {
      for (const x of [-.20, .20]) box(group, 'bench-steel-leg', [.04, .43, .055], [x, .215, z], m.metal, true);
      box(group, 'bench-crossbrace', [.47, .04, .055], [0, .12, z], m.metal, true);
      box(group, 'bench-back-upright', [.04, .65, .05], [.23, .42, z], m.metal, true);
    }
    for (const y of [.64, .80]) box(group, 'bench-back-slat', [.055, .12, 2.1], [.255, y, 0], m.wood, true);
    // Folded towel and bottle add readable human scale without texture requests.
    box(group, 'folded-cotton-towel', [.36, .035, .41], [.005, .507, -.62], m.towel, true);
    box(group, 'towel-fold', [.35, .014, .39], [.005, .530, -.62], m.towel);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.052, .060, .24, 16), m.accent);
    bottle.position.set(.02, .62, .60); bottle.castShadow = true; group.add(bottle);
    box(group, 'bottle-cap', [.07, .035, .07], [.02, .755, .60], m.metal);
    const bag = new THREE.Group(); bag.name = 'lobby-racket-bag'; bag.position.set(-.55, .22, .48); bag.rotation.y = -.14; group.add(bag);
    const bagBody = new THREE.Mesh(new THREE.CapsuleGeometry(.20, .66, 5, 14), m.bag);
    bagBody.rotation.x = Math.PI / 2; bagBody.scale.set(.85, 1, 1.05); bagBody.castShadow = true; bag.add(bagBody);
    const seam = new THREE.Mesh(new THREE.CapsuleGeometry(.204, .65, 4, 12), m.bagTrim);
    seam.rotation.x = Math.PI / 2; seam.scale.set(.86, 1, .035); seam.position.y = .135; bag.add(seam);
    const handlePath = new THREE.CatmullRomCurve3([new THREE.Vector3(-.06, .13, -.20), new THREE.Vector3(-.06, .34, -.11),
      new THREE.Vector3(-.06, .34, .12), new THREE.Vector3(-.06, .13, .21)]);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(handlePath, 16, .018, 6, false), m.bagTrim); bag.add(handle);
    const shadowMat = new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: .8, depthWrite: false });
    const plane = new THREE.PlaneGeometry(1, 1);
    for (const [x, z, sx, sz, opacity, y] of [[ATHLETE.x, ATHLETE.z, 1.15, .95, .82, .002],
      [5.2, 3.9, 1.15, 2.8, .9, -.018], [4.65, 4.38, .92, 1.5, 1, .002]]) {
      const shadow = new THREE.Mesh(plane, shadowMat.clone()); shadow.material.opacity = opacity;
      shadow.name = 'lobby-contact-shadow'; shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, y, z); shadow.scale.set(sx, sz, 1); scene.add(shadow);
    }
    shadowMat.dispose();
  }

  buildLights() {
    // Keep ambient light modest: local sources separate the foreground, court and gallery.
    const ambient = new THREE.HemisphereLight(0xe6edf0, 0x343b37, .82);
    ambient.name = 'lobby-indirect-light'; this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff7ed, 1.75); key.position.set(-2.8, 7.2, 4.6);
    key.name = 'lobby-shadow-key';
    key.target.position.set(2.1, 0, 2); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 12, bottom: -12, near: .3, far: 25 });
    key.shadow.bias = -.0003; key.shadow.normalBias = .015; key.shadow.radius = 3;
    this.scene.add(key, key.target);
    // Broad feathered sources approximate the fixed ceiling strips. Only the key casts
    // shadows; the three spatial fills add gradients without extra shadow-map renders.
    const court = new THREE.SpotLight(0xf1f3ed, 210, 23, 1.05, 1, 2);
    court.name = 'lobby-court-soft-top'; court.position.set(.2, 6.85, 1.0);
    court.target.position.set(0, 0, -1.0); this.scene.add(court, court.target);
    const athlete = new THREE.SpotLight(0xfff3e5, 53, 13, .68, 1, 2);
    athlete.name = 'lobby-athlete-soft-key'; athlete.position.set(5.3, 4.5, 8.3);
    athlete.target.position.set(ATHLETE.x, .95, ATHLETE.z); this.scene.add(athlete, athlete.target);
    const rim = new THREE.SpotLight(0xdbe9f1, 100, 15, .90, 1, 2);
    rim.name = 'lobby-sideline-soft-rim'; rim.position.set(6.8, 6.85, 1.8);
    rim.target.position.set(4.1, .8, 4.6); this.scene.add(rim, rim.target);
    const wall = new THREE.SpotLight(0xe4ede9, 68, 11, .70, 1, 2);
    wall.name = 'lobby-gallery-wall-wash'; wall.position.set(-1, 6.8, -10.4);
    // Keep this pool above the gallery: a low, broad wash would brighten every head.
    wall.target.position.set(.5, 5.2, -13.7); this.scene.add(wall, wall.target);
    this.lights = { ambient, key, court, athlete, rim, wall };
    this.applyLighting();
  }

  applyLighting() {
    const level = this.lightLevels;
    this.lights.key.intensity = 1.75 * level.main;
    this.lights.court.intensity = 210 * level.main;
    this.lights.athlete.intensity = 53 * level.side;
    this.lights.rim.intensity = 100 * level.side;
    this.lights.wall.intensity = 68 * level.back;
    this.materials.fixture.emissiveIntensity = 1.6 * level.main;
    this.materials.fixtureSide.emissiveIntensity = 1.6 * level.side;
    this.materials.fixtureBack.emissiveIntensity = 1.35 * level.back;
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

  setCourtPalette(name) {
    this.courtPalette = normalizeCourtPalette(name);
    const palette = resolveCourtPalette(this.courtPalette);
    this.materials.court.color.setHex(palette.court); this.materials.apron.color.setHex(palette.apron);
  }

  applyPose() { applyAthletePose(this.athlete, this.pose, { x: ATHLETE.x, z: ATHLETE.z }); }

  layoutCamera(width, height, reducedMotion) {
    const aspect = Math.max(1, width) / Math.max(1, height);
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
    this.updateLighting(dt, reducedMotion);
    if (!reducedMotion && Number.isFinite(dt) && dt > 0) {
      this.clock += Math.min(.1, dt); sampleLobbyPose(this.clock, this.pose); this.applyPose();
    }
    this.layoutCamera(width, height, reducedMotion);
    const mapping = renderer.toneMapping, exposure = renderer.toneMappingExposure;
    try {
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
      renderer.render(this.scene, this.camera);
    } finally { renderer.toneMapping = mapping; renderer.toneMappingExposure = exposure; }
  }

  dispose() {
    if (this.disposed) return;
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
