// Keep the horizontal input basis identical to the fixed baseline camera.
export function followCourtViewport(base, previous, player, shuttle, settings, dt, hud) {
  const { width, height, pitch } = base;
  const sign = base.side === 1 ? -1 : 1;
  const sin = Math.sin(pitch), cos = Math.cos(pitch);
  const ease = 1 - Math.exp(-5 * dt);
  function track(last, target) {
    if (last === undefined) return target;
    const delta = target - last;
    return last + Math.sign(delta) * Math.max(0, Math.abs(delta) - .14) * ease;
  }
  const origin = {
    x: track(previous?.origin.x, player.x * .76),
    y: 1.15,
    z: track(previous?.origin.z, player.z * .84 - sign * 2.2),
  };
  const focal = height * 1.32;
  const cy = height * .56;
  let halfWidth = width * (width > height ? .235 : .39);
  // A side scoreboard constrains the horizontal lane only. Raising the top
  // margin for a few pixels of overlap would shrink the entire short screen.
  if (hud?.right > 0 && hud.right < width*.38)
    halfWidth = Math.min(halfWidth, width/2-hud.right-8);
  else if (hud?.left > width*.62 && hud.left < width)
    halfWidth = Math.min(halfWidth, hud.left-width/2-8);
  halfWidth = Math.max(1,halfWidth);
  const top = Math.max(height * .13, hud && hud.left < width/2 + halfWidth &&
    hud.right > width/2 - halfWidth ? Math.min(height*.36, hud.bottom+10) : 0);
  // Solve the perspective bounds along the view axis, in metres. This works
  // for either baseline without depending on last frame's projection.
  function requiredDistance(x, y, z) {
    const forward = sign * (z - origin.z), up = y - origin.y;
    const depth = sin * up + cos * forward;
    const vertical = cos * up - sin * forward;
    const room = vertical >= 0 ? cy - top : height * .89 - cy;
    return depth + focal * Math.max(Math.abs(x-origin.x)/halfWidth, Math.abs(vertical)/room);
  }
  let required = Math.max(settings.distance,
    requiredDistance(player.x, 0, player.z), requiredDistance(player.x, 2.2, player.z),
    requiredDistance(0, 1.55, 0), requiredDistance(0, 1.85, -sign*6.5));
  if (shuttle) required = Math.max(required, requiredDistance(shuttle.x, shuttle.y, shuttle.z));
  const lead = .14;
  const predicted = shuttle?.active ? requiredDistance(shuttle.x+(shuttle.vx||0)*lead,
    Math.max(0,shuttle.y+(shuttle.vy||0)*lead),shuttle.z+(shuttle.vz||0)*lead) : required;
  const target = Math.max(required, predicted);
  const last = previous?.distance ?? target;
  const rate = target > last ? 12 : 1.4;
  const distance = Math.max(required, last + (target-last)*(1-Math.exp(-rate*dt)));
  return { ...base, origin, distance, scale: focal/distance, centerX: 0, centerY: 0,
    screenCenterX: width/2, screenCenterY: cy, top };
}
