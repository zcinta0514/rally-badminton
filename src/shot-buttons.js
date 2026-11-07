const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/** Map the shared aim (-1..1 right, +1 up) to the glass key nub and pointer line. */
export function shotAimVisual(aim, depth) {
  const x = clamp(finite(aim), -1, 1) || 0;
  const y = clamp(finite(depth), -1, 1) || 0;
  let angle = x === 0 && y === 0 ? 0 : Math.atan2(-x, -y) * 180 / Math.PI;
  if (angle === -180) angle = 180;
  if (Object.is(angle, -0)) angle = 0;
  return {
    x: x * 18,
    y: -y * 18 || 0,
    angle,
    active: Math.hypot(x, y) > 0.12,
  };
}

export function paintShotAim(button, aim, depth) {
  if (!button?.style || !button.dataset) return null;
  const visual = shotAimVisual(aim, depth);
  button.style.setProperty('--aim-x', `${visual.x.toFixed(2)}px`);
  button.style.setProperty('--aim-y', `${visual.y.toFixed(2)}px`);
  button.style.setProperty('--aim-angle', `${visual.angle.toFixed(2)}deg`);
  if (visual.active) button.dataset.aiming = 'true';
  else delete button.dataset.aiming;
  return visual;
}

export function clearShotAim(buttons) {
  for (const button of buttons || []) {
    if (!button?.style || !button.dataset) continue;
    delete button.dataset.aiming;
    for (const property of ['--aim-x', '--aim-y', '--aim-angle']) button.style.removeProperty(property);
  }
}
