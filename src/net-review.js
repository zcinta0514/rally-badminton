import { CourtView } from './view.js';
import { ArenaAudio } from './arena-audio.js';
import { createMatch, stepMatch } from '../shared/game.js';
import { timeToShuttleZ } from '../shared/shuttle-flight.js';

const view = new CourtView(document.getElementById('court'));
const audio = new ArenaAudio({ preferences: { master: 1, hits: 1, crowd: 0, movement: 0, environment: 0 } });
const profiles = { light: { x: -.35, y: 1.25, vz: -4, vy: -.4 }, hard: { x: .1, y: 1.06, vz: -20, vy: -4 },
  cross: { x: 0, y: 1.559, vz: -7, vy: -.8 }, return: { x: .35, y: 1.515, vz: -8, vy: -1 },
  double: { x: -.2, y: 1.559, vz: -7, vy: -.8 } };
let profile = 'light', state, paused = false, close = true, side = 0, elapsed = 0, accumulator = 0;
let second = false, last = performance.now();
function launch(p, hitter) {
  const sign = hitter === 0 ? 1 : -1;
  Object.assign(state.shuttle, { x: p.x, z: sign * .7, vx: 0, vy: p.vy, vz: p.vz * sign, lastHit: hitter, active: true });
  const t = timeToShuttleZ(state.shuttle, 0);
  state.shuttle.y = p.y - p.vy * t + 9.81 * t * t / 2;
}
function replay() {
  state = createMatch(); state.phase = 'rally'; state.service.active = false; state.hitId = 1; state.rally = 1;
  launch(profiles[profile], side); paused = false; elapsed = 0; accumulator = 0; second = false;
  audio.reset(); audio.update(state); view.endPresentation.clear(); view.initialized = false;
  document.getElementById('pause').textContent = '暂停';
  for (const button of document.querySelectorAll('[data-profile]')) button.setAttribute('aria-pressed', String(button.dataset.profile === profile));
}
document.getElementById('scenarios').addEventListener('click', event => {
  if (!event.target.dataset.profile) return; profile = event.target.dataset.profile; replay();
});
document.getElementById('sound').onclick = () => { void audio.unlock(); replay(); document.getElementById('sound').textContent = '声音已开启 · 重播'; };
document.getElementById('replay').onclick = replay;
document.getElementById('pause').onclick = () => { paused = !paused; document.getElementById('pause').textContent = paused ? '继续' : '暂停'; };
document.getElementById('camera').onclick = () => { close = !close; view.cameraSide = null; document.getElementById('camera').textContent = close ? '切到比赛镜头' : '切到触网近景'; };
document.getElementById('side').onclick = () => { side = 1 - side; view.cameraSide = null; replay(); };
window.addEventListener('resize', () => view.resize());
replay();
function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
  const hidden = document.hidden;
  if (!paused && !hidden) {
    elapsed += dt; accumulator += dt;
    while (accumulator >= 1 / 120) {
      if (state.phase === 'rally') stepMatch(state, [{}, {}], 1 / 120);
      else state.time += 1 / 120; // hold the ending instead of resetting to serve
      if (profile === 'double' && !second && state.time > .32 && state.phase === 'rally') {
        second = true; state.hitId++; launch({ ...profiles.cross, x: .35 }, 1 - side);
      }
      accumulator -= 1 / 120;
    }
  }
  if (close) {
    const sign = side === 0 ? 1 : -1;
    view.camera.clearViewOffset(); view.camera.aspect = view.width / view.height; view.camera.fov = 38;
    view.camera.position.set(sign * 1.6, 1.95, sign * 3.8); view.camera.lookAt(0, 1.03, 0);
    view.camera.updateProjectionMatrix(); view.camera.updateMatrixWorld(); view.cameraSide = side;
  }
  const shown = paused || hidden ? { ...state, phase: 'paused' } : state;
  view.render(shown, side, paused || hidden ? 0 : dt);
  audio.setListener(view.camera.position); audio.update(shown, !hidden);
  const contact = state.netContacts.at(-1);
  document.getElementById('event').textContent = contact ? `${contact.netImpact.material === 'tape' ? '网带' : '网布'} · ${contact.netImpact.crosses ? '减速过网，继续回合' : '回弹下落，本方下网'} · ${state.netContacts.length} 次触网` : '来球接近球网';
  document.getElementById('build').textContent = `NET-2 · ${globalThis.RALLY_CONFIG?.buildId || '加载中'} · ${paused ? '已暂停' : elapsed.toFixed(2) + ' s'}`;
  window.netReview = { state, view, audio, profile, elapsed, paused }; // local review evidence
  requestAnimationFrame(frame);
}
fetch(new URL('../runtime-config.js', import.meta.url)).then(r => r.text()).then(text => {
  const match = text.match(/"buildId":"([a-f0-9]+)"/); if (match) globalThis.RALLY_CONFIG = { buildId: match[1] };
});
requestAnimationFrame(frame);
