const clamp = value => Math.max(0, Math.min(1, value));

/** Control loss comes only from observable simulation state, never an RNG or
 * client timing claim. A broad neutral zone keeps ordinary mobile returns easy. */
export function contactQuality({player, ball, role, shot, charge, aim, aimDepth, serving, assist = 'none'}) {
  const factors = {movement: 0, stretch: 0, lowContact: 0, lateContact: 0, fatigue: 0, linePower: 0};
  if (serving) return {score: 1, risk: 0, reason: '发球辅助 · 对角发球区', reasonCode: 'serve', spread: 0, factors};
  factors.movement = clamp((Math.hypot(player.vx, player.vz) - 1.15) / (role.speed - 1.15));
  factors.stretch = clamp((Math.hypot(ball.x - player.x, ball.z - player.z) - 0.85) / 0.6);
  const comfortableHeight = shot === 'smash' ? 2.1 : shot === 'clear' ? 0.95 : 0.9;
  factors.lowContact = clamp((comfortableHeight - ball.y) / (comfortableHeight - 0.28));
  // Late means a falling shuttle already low in its usable window. Pressing a
  // key several milliseconds earlier/later is not itself a scoring mechanic.
  factors.lateContact = clamp(((shot === 'smash' ? 2.15 : 1.15) - ball.y) / 0.9) * clamp((-ball.vy - 2) / 6);
  factors.fatigue = clamp((0.42 - player.stamina / role.maxStamina) / 0.42);
  factors.linePower = clamp((charge - 0.45) / 0.55) * Math.max(clamp((Math.abs(aim) - 0.6) / 0.4), clamp((Math.abs(aimDepth) - 0.55) / 0.45));
  const weights = {movement: 0.2, stretch: 0.26, lowContact: 0.26, lateContact: 0.16, fatigue: 0.24, linePower: 0.28};
  const labels = {movement: '跑动中击球，先减速更稳', stretch: '极限够球，提前靠近更稳', lowContact: '触点偏低，提早接球',
    lateContact: '来球已下降到低位', fatigue: '体力偏低，减少大力进攻', linePower: '大力压线，收力或瞄准场内'};
  const ranked = Object.keys(factors).filter(key => factors[key] > 0.12).sort((a, b) => factors[b] * weights[b] - factors[a] * weights[a]);
  let risk = Math.min(0.96, Object.keys(factors).reduce((sum, key) => sum + factors[key] * weights[key], 0));
  // Beginner assistance reduces the punishment for imperfect mobile timing and
  // positioning, but never removes the underlying error model. Truly bad
  // contacts can still go into the net or out of bounds.
  if (assist === 'beginner') risk *= 0.72;
  if (shot === 'drop') risk *= role.dropControl ?? 1;
  return {score: 1 - risk, risk, reason: ranked.slice(0, 2).map(key => labels[key]).join(' · ') || '站稳击球 · 控制稳定',
    reasonCode: ranked[0] || 'stable',
    spread: risk < 0.02 ? 0 : 0.03 + 1.7 * risk + 0.9 * risk * risk, factors};
}

/** Signed deterministic drift preserves mirror symmetry between the court ends. */
export function contactDrift({quality, player, ball, role, aimX, aimDepth, side, shot, charge}) {
  const f = quality.factors, end = side === 0 ? 1 : -1;
  const signedClamp = value => Math.max(-1, Math.min(1, value));
  const xBias = signedClamp(0.45 * player.vx / role.speed * f.movement
    + 0.5 * signedClamp((ball.x - player.x) / 1.45) * f.stretch
    + 0.8 * Math.sign(aimX) * f.linePower + 0.1 * Math.sign(ball.vx) * f.lateContact);
  const depthBias = 0.88 * f.linePower * (0.65 + 0.35 * Math.max(0, aimDepth))
    - 0.25 * player.vz * end / role.speed * f.movement + 0.15 * f.stretch;
  const weakContact = 0.16 * f.movement + 0.4 * f.stretch + 0.5 * f.lowContact + 0.45 * f.lateContact + 0.45 * f.fatigue;
  return {x: quality.spread * xBias, z: -end * quality.spread * depthBias,
    verticalLoss: ({clear: 2.4, drop: 1.4, smash: 1.05})[shot] * Math.min(1.3, weakContact) * (0.6 + charge * 0.4)};
}
