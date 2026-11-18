// Horizontal quadratic drag, dv/dt = -k |v| v, solved analytically. Vertical
// motion optionally includes its own quadratic drag. This separable model is
// a rhythm approximation, not full coupled aerodynamics. Metres and seconds.
export const SHUTTLE_FLIGHT = Object.freeze({ drag: .2, smashDrag: .035, gravity: 9.81 });

// Separable quadratic vertical drag: calibrated to a feather shuttle's ~6.7m/s
// terminal fall. This is not a coupled 3D aerodynamic model. Legacy/test balls
// and the deliberately direct smash retain zero vertical drag unless specified.
export const VERTICAL_DRAG = 9.81 / 6.7 ** 2;
export function verticalFlight(y, vy, time, drag = 0) {
  const g = SHUTTLE_FLIGHT.gravity;
  if (!drag) return {y:y + vy*time - g*time*time/2, vy:vy-g*time};
  const terminal=Math.sqrt(g/drag), rate=g/terminal;
  if(vy>0) {
    const angle=Math.atan(vy/terminal), topTime=angle/rate;
    if(time<=topTime) return {y:y+Math.log(Math.cos(angle-rate*time)/Math.cos(angle))/drag,vy:terminal*Math.tan(angle-rate*time)};
    y-=Math.log(Math.cos(angle))/drag;time-=topTime;vy=0;
  }
  const q=rate*time, r=-vy/terminal, c=Math.cosh(q), s=Math.sinh(q);
  return {y:y-Math.log(c+r*s)/drag,vy:-terminal*(s+r*c)/(c+r*s)};
}
export function flightApex(ball) {
  const drag=ball.verticalDrag||0,g=SHUTTLE_FLIGHT.gravity,v=Math.max(0,ball.vy);
  return {y:ball.y+(drag?Math.log1p(drag*v*v/g)/(2*drag):v*v/(2*g)),
    time:drag?Math.atan(v/Math.sqrt(g/drag))*Math.sqrt(1/(g*drag)):v/g};
}
export function timeToHeight(ball,height=0) {
  const drag=ball.verticalDrag||0,g=SHUTTLE_FLIGHT.gravity;
  if(!drag) {const d=ball.vy**2+2*g*(ball.y-height);return d<0?-1:(ball.vy+Math.sqrt(d))/g;}
  const top=flightApex(ball),drop=top.y-height;
  if(drop< -1e-9)return -1;
  const terminal=Math.sqrt(g/drag),r=Math.max(0,-ball.vy)/terminal,E=Math.exp(drag*Math.max(0,drop));
  return top.time+Math.log((E+Math.sqrt(Math.max(0,E*E+r*r-1)))/(1+r))*terminal/g;
}
export function verticalLaunch(start,end,duration,drag=0) {
  if(!drag)return (end-start)/duration+SHUTTLE_FLIGHT.gravity*duration/2;
  let lo=-256,hi=256;
  for(let i=0;i<44;i++) {const mid=(lo+hi)/2;if(verticalFlight(start,mid,duration,drag).y<end)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}

export function sampleShuttleFlight(ball, time) {
  const drag = ball.drag ?? SHUTTLE_FLIGHT.drag;
  const speed = Math.hypot(ball.vx, ball.vz), a = drag * speed;
  const scale = a > 1e-9 ? Math.log1p(a * time) / a : time;
  const decay = 1 / (1 + a * time);
  return { ...(ball.drag === undefined ? {} : { drag: ball.drag }), x: ball.x + ball.vx * scale, z: ball.z + ball.vz * scale,
    ...verticalFlight(ball.y,ball.vy,time,ball.verticalDrag||0),
    ...(ball.verticalDrag===undefined?{}:{verticalDrag:ball.verticalDrag}),
    vx: ball.vx * decay, vz: ball.vz * decay };
}

export function horizontalLaunch(start, end, duration, drag = SHUTTLE_FLIGHT.drag) {
  const dx = end.x - start.x, dz = end.z - start.z, distance = Math.hypot(dx, dz);
  const scale = distance > 1e-9 && drag > 1e-9 ? Math.expm1(drag * distance) /
    (drag * distance * duration) : 1 / duration;
  return { vx: dx * scale, vz: dz * scale };
}

export function timeToShuttleZ(ball, z) {
  if (!ball.vz) return -1;
  const speed = Math.hypot(ball.vx, ball.vz), distance = (z - ball.z) / ball.vz * speed;
  if (distance < 0) return -1;
  const drag = ball.drag ?? SHUTTLE_FLIGHT.drag;
  return drag > 1e-9 ? Math.expm1(drag * distance) / (drag * speed) : distance / speed;
}

export function horizontalTimeFraction(distance, fraction, drag = SHUTTLE_FLIGHT.drag) {
  const d = drag * distance;
  return d > 1e-9 ? Math.expm1(d * fraction) / Math.expm1(d) : fraction;
}
