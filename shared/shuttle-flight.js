// Horizontal quadratic drag, dv/dt = -k |v| v, solved analytically. Vertical
// motion retains gravity; this is a fast rhythm approximation, not a complete
// aerodynamic reconstruction from monocular video. Metres and seconds.
export const SHUTTLE_FLIGHT = Object.freeze({ drag: .2, gravity: 9.81 });

export function sampleShuttleFlight(ball, time) {
  const speed = Math.hypot(ball.vx, ball.vz), a = SHUTTLE_FLIGHT.drag * speed;
  const scale = a > 1e-9 ? Math.log1p(a * time) / a : time;
  const decay = 1 / (1 + a * time);
  return { x: ball.x + ball.vx * scale, z: ball.z + ball.vz * scale,
    y: ball.y + ball.vy * time - SHUTTLE_FLIGHT.gravity * time * time / 2,
    vx: ball.vx * decay, vz: ball.vz * decay, vy: ball.vy - SHUTTLE_FLIGHT.gravity * time };
}

export function horizontalLaunch(start, end, duration) {
  const dx = end.x - start.x, dz = end.z - start.z, distance = Math.hypot(dx, dz);
  const scale = distance > 1e-9 ? Math.expm1(SHUTTLE_FLIGHT.drag * distance) /
    (SHUTTLE_FLIGHT.drag * distance * duration) : 1 / duration;
  return { vx: dx * scale, vz: dz * scale };
}

export function timeToShuttleZ(ball, z) {
  if (!ball.vz) return -1;
  const speed = Math.hypot(ball.vx, ball.vz), distance = (z - ball.z) / ball.vz * speed;
  if (distance < 0) return -1;
  return Math.expm1(SHUTTLE_FLIGHT.drag * distance) / (SHUTTLE_FLIGHT.drag * speed);
}

export function horizontalTimeFraction(distance, fraction) {
  const d = SHUTTLE_FLIGHT.drag * distance;
  return d > 1e-9 ? Math.expm1(d * fraction) / Math.expm1(d) : fraction;
}
