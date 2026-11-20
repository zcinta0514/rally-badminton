import * as THREE from 'three';
import { createMatch, stepMatch } from '../../shared/game.js';
import { loadTournamentArena } from '../tournament-arena.js';
import { makeAthlete, updateAthlete } from '../athlete.js';
import { upgradeAthlete } from '../athlete-import.js';
import { makeNetVisual, updateNetVisual } from '../net-visual.js';
import { makeShuttleModel } from '../shuttle-visual.js';

const shots = {
  wide:  { label: '中央球场', eye: [-8.6, 5.65, 10.5], target: [0, 1.95, -.5], fov: 58 },
  chief: { label: '主裁席', eye: [-1.94, 2.77, 1.38], target: [-4.03, 1.95, 0], fov: 37 },
  line:  { label: '近场底线司线员', eye: [2.92, 1.24, 7.49], target: [5.63, .80, 6.70], fov: 36 },
  gear:  { label: '球员器材区', eye: [2.94, 1.25, 5.32], target: [5.45, .38, 3.71], fov: 41 },
  lights: { label: '顶棚比赛照明', eye: [.4, 3.4, 8.8], target: [-3.3, 11.4, -.3], fov: 64 },
};
const verdicts = {
  in: '界内 · 司线员右手指向底线',
  out: '界外 · 司线员双臂水平展开',
  net: '下网 · 主裁登记得分',
};
const stage = document.querySelector('.stage');
const loadNotice = document.getElementById('load');
const verdict = document.getElementById('verdict');
const eventButtons = [...document.querySelectorAll('[data-event]')];
const cameraButtons = [...document.querySelectorAll('[data-camera]')];

function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xe9f2f5, 0x566258, 1.1));
  const key = new THREE.DirectionalLight(0xffefd9, 1.65);
  key.position.set(-4, 11.8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 12, bottom: -12, near: .5, far: 35 });
  key.shadow.normalBias = .009;
  key.shadow.bias = -.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc2daee, .64);
  fill.position.set(5.5, 7, -4);
  scene.add(fill);
  for (const side of [-1, 1]) {
    const lamp = new THREE.SpotLight(0xf6f9ef, 195, 27, .98, .82, 2);
    lamp.position.set(6.05 * side, 12.36, 4.5 * side);
    lamp.target.position.set(-side * .8, 0, 3.2 * side);
    scene.add(lamp, lamp.target);
  }
}

async function openGallery() {
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17282b);
  scene.fog = new THREE.FogExp2(0x18292e, .016);
  addLighting(scene);
  const camera = new THREE.PerspectiveCamera(54, 1, .04, 90);
  let selected = 'wide';
  function setShot(name) {
    selected = name;
    const shot = shots[name];
    const aspect = (stage.clientWidth || 1) / (stage.clientHeight || 1);
    // The end-on portrait view keeps both baselines and the floor mark in frame.
    const portraitOverview = name === 'wide' && aspect < .85;
    camera.position.fromArray(portraitOverview ? [-2.5, 5.8, 12.8] : shot.eye);
    camera.lookAt(...(portraitOverview ? [0, 1.4, -.3] : shot.target));
    // Preserve the horizontal composition on a narrower screen.
    const vertical = Math.tan(THREE.MathUtils.degToRad(shot.fov / 2));
    camera.aspect = aspect;
    camera.fov = Math.min(103, THREE.MathUtils.radToDeg(2 * Math.atan(vertical * Math.max(1, 1.48 / aspect))));
    camera.updateProjectionMatrix();
    cameraButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.camera === name)));
    document.getElementById('shot').textContent = shot.label;
  }
  const resize = () => {
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    setShot(selected);
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  cameraButtons.forEach(button => button.addEventListener('click', () => setShot(button.dataset.camera)));

  const arena = await loadTournamentArena();
  scene.add(arena.scene);
  const athletes = [makeAthlete(scene, 0), makeAthlete(scene, 1)];
  athletes.forEach(athlete => void upgradeAthlete(athlete).catch(() => {}));
  const net = makeNetVisual(scene);
  net.group.scale.x = 3.05 / 3.17;
  const shuttle = makeShuttleModel();
  shuttle.scale.setScalar(1.6);
  scene.add(shuttle);
  const mark = new THREE.Mesh(new THREE.RingGeometry(.12, .155, 40),
    new THREE.MeshBasicMaterial({ color: 0xbdf8d9, transparent: true, opacity: .85, side: THREE.DoubleSide }));
  mark.rotation.x = -Math.PI / 2;
  mark.visible = false;
  scene.add(mark);
  const up = new THREE.Vector3(0, 1, 0), velocity = new THREE.Vector3();
  let state = createMatch({ target: 21, seed: 72 });
  let flying = false, lastEvent = null;
  function startExample(kind) {
    if (flying) return;
    if (state.phase === 'over') {
      arena.reset();
      state = createMatch({ target: 21, seed: 72 });
      document.getElementById('near').textContent = '00';
      document.getElementById('far').textContent = '00';
    }
    if (kind === 'net') setShot('chief');
    if (kind !== 'net' && selected !== 'chief') setShot('line');
    // Inject only the incoming shuttle. Physics decides when it crosses the
    // net or reaches the floor and awards the point via the normal match code.
    const atNet = kind === 'net';
    state.phase = 'rally';
    state.service.active = false;
    state.rallyEnd = null;
    state.netContacts = [];
    state.hitId++;
    Object.assign(state.shuttle, {
      x: .62, y: atNet ? 1.36 : 1.25, z: atNet ? .45 : kind === 'in' ? 5.64 : 6.12,
      vx: 0, vy: -1.2, vz: atNet ? -5 : 2.8,
      active: true, lastHit: atNet ? 0 : 1, lastHitPlayer: atNet ? 0 : 1,
    });
    flying = true;
    lastEvent = null;
    mark.visible = false;
    document.body.dataset.call = 'rally';
    verdict.textContent = '来球判定中';
    eventButtons.forEach(button => { button.disabled = true; });
  }
  eventButtons.forEach(button => {
    button.disabled = false;
    button.addEventListener('click', () => startExample(button.dataset.event));
  });
  function showDecision(event) {
    flying = false;
    lastEvent = event;
    document.body.dataset.call = event.kind;
    document.getElementById('near').textContent = String(state.score[0]).padStart(2, '0');
    document.getElementById('far').textContent = String(state.score[1]).padStart(2, '0');
    verdict.textContent = verdicts[event.kind] + ' · ' + (event.winner === 0 ? '近场' : '远场') + '得分';
    if (event.kind === 'in' || event.kind === 'out') {
      mark.position.set(event.x, .043, event.z);
      mark.material.color.setHex(event.kind === 'in' ? 0xafefd0 : 0xffa385);
      mark.visible = true;
    }
    eventButtons.forEach(button => { button.disabled = false; });
  }
  let previous;
  renderer.setAnimationLoop(now => {
    const dt = previous === undefined ? 0 : Math.min(.09, (now - previous) / 1000);
    previous = now;
    if (document.hidden) return;
    if (flying) {
      stepMatch(state, [], dt);
      if (state.rallyEnd) showDecision(state.rallyEnd);
    } else {
      state.time += dt;
    }
    // Hold each gesture a little longer in the review room.
    const reviewDt = lastEvent && state.time - lastEvent.at < 2.4 ? dt * .57 : dt;
    arena.update(state, reviewDt);
    updateNetVisual(net, state.netContacts, state.time);
    for (let i = 0; i < athletes.length; ++i) {
      updateAthlete(athletes[i], state.players[i], i, state.shuttle, state.time, dt, false);
    }
    shuttle.visible = flying || (lastEvent && lastEvent.kind !== 'net');
    shuttle.position.set(state.shuttle.x, Math.max(.04, state.shuttle.y), state.shuttle.z);
    velocity.set(state.shuttle.vx, state.shuttle.vy, state.shuttle.vz);
    if (velocity.lengthSq() > .01) shuttle.quaternion.setFromUnitVectors(up, velocity.normalize());
    renderer.render(scene, camera);
    if (!loadNotice.hidden) {
      loadNotice.hidden = true;
      document.body.dataset.ready = 'true';
    }
  });
}

openGallery().catch(error => {
  console.error('Cannot open arena preview', error);
  loadNotice.textContent = '场馆载入失败，请刷新页面重试。';
  document.body.dataset.ready = 'error';
});
