import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveCourtPalette } from './court-palettes.js';
import { makeCourtMaterial } from './arena.js';

const FPS = 24;
const roles = ['Umpire_Main', 'LJ_Base_Near', 'LJ_Base_Far', 'LJ_Side_Left', 'LJ_Side_Right'];
const assetURL = new URL('./models/tournament-hall.glb', import.meta.url);

export function lineOfficial(impact, format = 'singles') {
  if (!impact || !['in', 'out'].includes(impact.kind)) return null;
  const { x, z } = impact;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const side = Math.abs(x) - (format === 'doubles' ? 3.05 : 2.59);
  const end = Math.abs(z) - 6.7;
  // For a corner miss choose the boundary exceeded by the larger margin.
  // Interior landings belong to the nearest boundary.
  if (end >= side) return z >= 0 ? 'LJ_Base_Near' : 'LJ_Base_Far';
  return x < 0 ? 'LJ_Side_Left' : 'LJ_Side_Right';
}

function scoreScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.36, .91),
    new THREE.MeshBasicMaterial({map: texture, toneMapped: false}));
  screen.position.set(-4.25, 1.36, -9.43);
  let last;
  const update = (near, far) => {
    if (last === near + '/' + far) return;
    last = near + '/' + far;
    ctx.fillStyle = '#071c22'; ctx.fillRect(0, 0, 768, 300);
    ctx.fillStyle = '#94f0c8'; ctx.fillRect(24, 24, 8, 30);
    ctx.font = '650 30px "Rally Display", Arial, sans-serif'; ctx.fillText('开拍 RALLY   /   COURT 01', 49, 49);
    ctx.fillStyle = '#284146'; ctx.fillRect(384, 85, 2, 172);
    ctx.font = 'bold 36px Arial'; ctx.fillStyle = '#96b3b6';
    ctx.fillText('NEAR', 35, 114); ctx.fillText('FAR', 418, 114);
    ctx.font = 'bold 142px Arial'; ctx.fillStyle = '#eff8ef';
    ctx.fillText(String(near).padStart(2, '0'), 29, 258);
    ctx.fillText(String(far).padStart(2, '0'), 413, 258);
    texture.needsUpdate = true;
  };
  update(0,0);
  return { screen, update };
}

export async function loadTournamentArena() {
  const [model] = await Promise.all([
    new GLTFLoader().loadAsync(assetURL.href),
    document.fonts?.load('650 30px "Rally Display"', '开拍').catch(() => {}),
  ]);
  return installTournamentArena(model);
}

export function installTournamentArena({ scene, animations }) {
  const scoreboard = scoreScreen();
  scene.add(scoreboard.screen);
  const mixer = new THREE.AnimationMixer(scene);
  const tracks = animations.flatMap(clip => clip.tracks);
  const actions = new Map();
  for (const role of roles) {
    const actorTracks = tracks.filter(track => track.name.startsWith(role));
    if (!actorTracks.length) throw new Error('Missing animation for ' + role);
    const action = mixer.clipAction(new THREE.AnimationClip(role, -1, actorTracks));
    action.play(); action.paused = true;
    actions.set(role, action);
  }
  const floorMaterials = new Set(), crowd = [];
  const surround = scene.getObjectByName('AR__Competition_surround');
  // Keep the apron tint local to this surface even if a future export shares its material.
  if (surround?.isMesh) surround.material = surround.material.clone();
  scene.traverse(node => {
    if (node.name.startsWith('CompetitionNet_')) node.visible = false;
    if (node.userData.role === 'spectator_block') crowd.push(node);
    if (!node.isMesh) return;
    node.receiveShadow = true;
    node.castShadow = /^LJ_|^Umpire_Main|^Service_Judge|^Players|^Umpire|^Net_post|^Scoreboard/.test(node.name);
    if (node.material.name === 'Court_Mat_Green') {
      const positions = node.geometry.getAttribute('position');
      const uv = [];
      for (let i=0; i<positions.count; i++) {
        uv.push(positions.getX(i) / 10 + .5, positions.getZ(i) / 17.8 + .5);
      }
      node.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      node.material = makeCourtMaterial(resolveCourtPalette().court);
      floorMaterials.add(node.material);
    }
  });
  let active = null, previousId = -1, clock = -1, format;
  function pose() {
    for (const [role, action] of actions) {
      const responding = active && (role === 'Umpire_Main' || role === active.judge);
      const start = role !== 'Umpire_Main' && active?.kind === 'out' ? 71 : 1;
      action.time = (responding ? start + Math.min(68, active.age * 48) : 1) / FPS;
    }
    mixer.update(0);
    crowd.forEach((block,i) => {
      block.position.y = active ? .035 * Math.sin(Math.PI * Math.min(1,active.age / 1.3)) ** 2 * (.6 + .4 * (i % 2)) : 0;
    });
  }
  function reset() {
    active = null; previousId = -1; clock = -1; pose();
  }
  function update(state, dt) {
    if (state.time < clock || state.pointId < previousId) reset();
    clock = state.time;
    if (format !== state.format) {
      format = state.format;
      for (const [role, sign] of [['LJ_Side_Left',-1],['LJ_Side_Right',1]]) {
        const root = scene.getObjectByName(role);
        if (root) root.position.x = sign * (format === 'doubles' ? 3.05 : 2.59);
      }
    }
    scoreboard.update(state.score[0], state.score[1]);
    const event = state.rallyEnd;
    if (event && event.id === state.pointId && event.id !== previousId) {
      active = { kind: event.kind, judge: lineOfficial(event, format), age: 0 };
    }
    previousId = state.pointId;
    if (active && !['paused','countdown'].includes(state.phase)) {
      active.age += Math.max(0,Math.min(.12,dt || 0));
      if (active.age > 1.48) active = null;
      pose();
    }
  }
  function palette(name) {
    const { court, apron } = resolveCourtPalette(name);
    for (const mat of floorMaterials) mat.color.setHex(court);
    if (surround?.isMesh) surround.material.color.setHex(apron);
  }
  palette();
  pose();
  return { scene, update, reset, palette };
}
