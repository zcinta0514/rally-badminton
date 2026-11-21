import * as THREE from 'three';
import { CourtView } from '../view.js';
import { fitCourtViewport } from '../court-layout.js';
import { updateAthlete } from '../athlete.js';
import { makeAthlete as makeBefore, updateAthlete as updateBefore } from './legacy-c7c388f/athlete.js';
import { upgradeAthlete as loadBefore } from './legacy-c7c388f/athlete-import.js';
import { buildMotionClip, FRAME_RATE, MOTION_CASES } from './motion-clips.js';

document.title = '开拍 · 球员动作对照';
const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('./motion.css', import.meta.url).href;
document.head.append(css);
document.body.removeAttribute('data-screen');
document.body.innerHTML = `
<main id="motion-review">
  <header><h1>球员动作对照</h1><a href="./">进入游戏试玩 ↗</a></header>
  <section class="motion-stage">
    <canvas aria-label="同一回放的旧版和测试版球员"></canvas>
    <div class="motion-labels"><span>改前 · 1.33.0</span><span>测试版</span></div>
  </section>
  <section class="motion-controls" aria-label="回放控制">
    <div class="motion-options">
      <label>动作 <select id="motion-case"></select></label>
      <label>持拍 <select id="motion-hand"><option value="right">右手</option><option value="left">左手</option></select></label>
      <label>视角 <select id="motion-angle"><option value="oblique">斜前方</option><option value="front">正面</option><option value="side">侧面</option><option value="rear">背面</option><option value="match">比赛全景</option></select></label>
    </div>
    <div class="motion-transport">
      <button id="motion-play" type="button">暂停</button>
      <button id="motion-speed" type="button">原速 1×</button>
      <button id="motion-contact" type="button">触球帧</button>
      <input type="range" id="motion-scrub" min="0" value="0" aria-label="逐帧查看动作">
      <output id="motion-frame"></output>
    </div>
    <div class="motion-info"><span id="motion-phase"></span><span id="motion-model" role="status">球员载入中</span></div>
  </section>
</main>`;

const byId = id => document.getElementById(id);
const cases = byId('motion-case'), hand = byId('motion-hand'), angle = byId('motion-angle');
const slider = byId('motion-scrub'), play = byId('motion-play'), speed = byId('motion-speed');
for (const [key, label] of Object.entries(MOTION_CASES)) cases.add(new Option(label, key));
const requested = new URLSearchParams(location.search);
if (Object.hasOwn(MOTION_CASES, requested.get('clip'))) cases.value = requested.get('clip');
if (requested.get('hand') === 'left') hand.value = 'left';
if (Array.from(angle.options).some(o => o.value === requested.get('angle'))) angle.value = requested.get('angle');

const view = new CourtView(document.querySelector('.motion-stage canvas'));
view.setMode('match');
view.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.35));
const before = makeBefore(view.scene, 0), after = view.players[0];
view.players[1].root.visible = view.players[1].ground.visible = false;
view.groundMarker.visible = false;

let frames = [], index = -1, clock = 0, last = 0, playing = true, rate = 1, dirty = true;
const phaseLabels = {prepare:'准备引拍', windup:'挥拍前段', contact:'触球', followthrough:'随挥', recovery:'回位'};
const rescueLabels = {push:'蹬地扑救', flight:'腾身伸拍', land:'落地缓冲', brace:'双臂支撑', rise:'支撑起身'};
const direction = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);

function selectClip() {
  frames = buildMotionClip(cases.value, hand.value);
  byId('motion-contact').disabled = !frames.some(frame => frame.player.action?.stage === 'contact');
  slider.max = frames.length - 1;
  index = -1; clock = 0; dirty = true;
}
function setPlaying(value) {
  playing = value;
  play.textContent = playing ? '暂停' : '播放';
}
function positionCamera(frame, w, h) {
  view.netVisual.group.visible = angle.value === 'match';
  if (angle.value === 'match') {
    view.applyCourtLayout(fitCourtViewport(w, h, frame.side, {camera:view.cameraSettings}));
    return;
  }
  const camera = view.camera, mirrored = hand.value === 'left' ? -1 : 1;
  const subject = frame.player;
  const sign = frame.side === 1 ? -1 : 1;
  const height = cases.value === 'jump' ? 1.48 : cases.value === 'rescue' ? .95 : 1.2;
  const distance = Math.max(cases.value === 'jump' ? 5.35 : 4.55, 2.5 / (w / h));
  const yaw = {oblique:.59, front:0, side:Math.PI / 2, rear:Math.PI}[angle.value];
  camera.clearViewOffset();
  camera.aspect = w / h; camera.fov = 37;
  camera.position.set(subject.x + mirrored * sign * Math.sin(yaw) * distance,
    height + .54, subject.z - sign * Math.cos(yaw) * distance);
  camera.lookAt(subject.x, height, subject.z);
  camera.updateProjectionMatrix();
}

function draw(next) {
  if (next < index) index = -1;
  // Reconstruct stateful planted feet, transitions and dive recovery on backward seeks.
  for (let i=index+1; i<=next; i++) {
    const f = frames[i];
    const args = [f.player, f.side, f.shuttle, f.time, 1/FRAME_RATE, false, false, i === 0, f.rescue];
    updateBefore(before, ...args);
    updateAthlete(after, ...args);
  }
  index = next;
  const frame = frames[next], ball = frame.shuttle;
  const renderer = view.renderer, width = Math.round(view.width), height = Math.round(view.height);
  const w = Math.floor(width / 2);
  view.shuttle.position.set(ball.x, ball.y, ball.z);
  direction.set(ball.vx,ball.vy,ball.vz);
  if (direction.lengthSq() > .01) view.shuttle.quaternion.setFromUnitVectors(up, direction.normalize());
  else view.shuttle.rotation.set(.3,0,.2);
  view.shuttle.visible = !['ready','run','footwork'].includes(cases.value);
  positionCamera(frame, Math.max(1,w), height);
  renderer.setScissorTest(true);
  for (const [x, panelWidth, old] of [[0,w,true],[w,width-w,false]]) {
    before.root.visible = before.ground.visible = old;
    after.root.visible = after.ground.visible = !old;
    before.halo.visible = after.halo.visible = false;
    renderer.setViewport(x,0,panelWidth,height);
    renderer.setScissor(x,0,panelWidth,height);
    renderer.render(view.scene,view.camera);
  }
  renderer.setScissorTest(false);
  renderer.setViewport(0,0,width,height);
  slider.value = next;
  byId('motion-frame').value = (next+1) + ' / ' + frames.length;
  const pose = after.root.userData.pose;
  byId('motion-phase').textContent = rescueLabels[pose?.rescueStage] || phaseLabels[frame.player.action?.stage]
    || (Math.hypot(frame.player.vx,frame.player.vz) > .12 ? '移动' : '准备站姿');
}
cases.onchange = hand.onchange = selectClip;
angle.onchange = () => { dirty = true; };
play.onclick = () => setPlaying(!playing);
speed.onclick = () => {
  rate = rate === 1 ? .25 : 1;
  speed.textContent = rate === 1 ? '原速 1×' : '慢放 ¼×';
};
slider.oninput = () => { setPlaying(false); clock = Number(slider.value) / FRAME_RATE; dirty = true; };
byId('motion-contact').onclick = () => {
  slider.value = frames.findIndex(frame => frame.player.action?.stage === 'contact');
  slider.oninput();
};

new ResizeObserver(() => { view.resize(); dirty = true; }).observe(view.canvas);
document.addEventListener('visibilitychange', () => { last = 0; });
selectClip();
Promise.all([loadBefore(before), after.modelUpgrade]).then(() => {
  const loaded = [before, after].every(rig => rig.root.userData.modelStatus === 'ready');
  byId('motion-model').textContent = loaded ? '两侧实战模型已加载' : '模型加载异常，当前显示备用造型';
  index = -1; dirty = true;
});

function animate(now) {
  if (playing && last) clock += (now-last) * .001 * rate;
  last = now;
  const next = Math.floor(clock * FRAME_RATE + 1e-6) % frames.length;
  if (next !== index || dirty) { draw(next); dirty = false; }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
window.__motionPreview = {view,before,after,get index(){return index;},get frames(){return frames;}};
