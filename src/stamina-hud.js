import { ROLES, staminaEffects } from '../shared/game.js';

// Keep the default foot anchor; move only when a fixed control would cover it.
export function placeStaminaMeter(anchor, bounds, own, obstacles = []) {
  const half = own ? 38 : 30, height = own ? 21 : 19, gap = 6;
  const clampX = x => Math.max(bounds.left + 45, Math.min(bounds.right - 45, x));
  const clampY = y => Math.max(bounds.top + 24, Math.min(bounds.bottom - 28, y));
  const preferred = { x: clampX(anchor.x), y: clampY(anchor.y) };
  const overlaps = p => obstacles.some(r => p.x - half < r.right + gap && p.x + half > r.left - gap &&
    p.y < r.bottom + gap && p.y + height > r.top - gap);
  if (!overlaps(preferred)) return preferred;
  const xs = [preferred.x, ...obstacles.flatMap(r => [clampX(r.left - half - gap), clampX(r.right + half + gap)])];
  const ys = [preferred.y, ...obstacles.flatMap(r => [clampY(r.top - height - gap), clampY(r.bottom + gap)])];
  let best = null, score = Infinity;
  for (const x of xs) for (const y of ys) {
    const candidate = { x, y };
    if (overlaps(candidate)) continue;
    // Prefer a lateral adjustment to placing the meter over the player's body.
    const cost = (x - preferred.x) ** 2 + ((y - preferred.y) * 1.5) ** 2 + (Math.max(0, preferred.y - 8 - y) * 8) ** 2;
    if (cost < score) { best = candidate; score = cost; }
  }
  return best || preferred;
}

export function staminaDisplay(player, phase, own) {
  const fraction = Math.max(0, Math.min(1, player.stamina / ROLES[player.role].maxStamina));
  const status = ['paused', 'countdown'].includes(phase) ? 'paused' : player.staminaStatus || 'idle';
  const fatigue = staminaEffects(player, ROLES[player.role]), fatigued = fatigue.severity > .25;
  const text = { recovering: '↑ 恢复中', draining: own && fatigued ? '↓ 疲劳' : '↓ 消耗', waiting: '· 调整中', paused: '暂停', idle: own && fatigued ? '疲劳' : '' }[status];
  return { fraction, percent: Math.round(fraction * 100), low: fraction < .25, status, fatigued,
    speed: ROLES[player.role].speed * fatigue.speedScale,
    label: (fraction < .25 ? '△ ' : '') + (own ? Math.round(fraction * 100) + '% ' : '') + text };
}

export class StaminaHUD {
  constructor(document = globalThis.document) {
    this.document = document; this.obstacles = [];
    this.root = document.createElement('div'); this.root.className = 'player-stamina-layer';
    this.bars = [0, 1].map(side => {
      const element = document.createElement('div'); element.className = 'player-stamina';
      element.dataset.side = side; element.setAttribute('role', 'meter');
      element.setAttribute('aria-valuemin', '0'); element.setAttribute('aria-valuemax', '100');
      element.innerHTML = '<div class="player-stamina-track"><i></i></div><span></span>';
      this.root.appendChild(element); return { element, fill: element.querySelector('i'), label: element.querySelector('span') };
    });
    this.root.hidden = true; document.body.appendChild(this.root);
  }
  hide() { this.root.hidden = true; }
  refreshObstacles() {
    this.obstacles = [...this.document.querySelectorAll('.shot-buttons,.shot-instruction,.movement-panel,.hud')]
      .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
  }
  update(state, side, project, bounds, enabled = true) {
    this.root.hidden = !enabled || state.phase === 'over';
    if (this.root.hidden) return;
    const positions = state.players.map(p => project(p.x, 0, p.z));
    this.bars.forEach((bar, index) => {
      const p = positions[index], own = index === side, display = staminaDisplay(state.players[index], state.phase, own);
      bar.element.hidden = p.depth < -1 || p.depth > 1;
      let y = p.y + 16;
      if (!own && Math.abs(p.x - positions[side].x) < 80 && Math.abs(p.y - positions[side].y) < 32) y += 32;
      const placed = placeStaminaMeter({ x: p.x, y }, bounds, own, this.obstacles);
      const x = placed.x; y = placed.y;
      bar.element.style.transform = 'translate(' + x + 'px,' + y + 'px) translateX(-50%)';
      bar.element.dataset.own = String(own); bar.element.dataset.low = String(display.low); bar.element.dataset.status = display.status;
      bar.element.dataset.fatigued = String(display.fatigued);
      bar.element.title = '当前最高移动速度 ' + display.speed.toFixed(2) + 'm/s' + (display.fatigued ? ' · 疲劳增加强攻与压线失误风险' : ' · 控球稳定');
      bar.element.setAttribute('aria-valuetext', display.percent + '%；' + bar.element.title);
      bar.fill.style.width = display.fraction * 100 + '%'; bar.label.textContent = display.label;
      bar.element.setAttribute('aria-label', (own ? '你的' : '对手') + '体力');
      bar.element.setAttribute('aria-valuenow', String(display.percent));
    });
  }
  dispose() { this.root.remove(); }
}
