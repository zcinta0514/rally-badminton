import * as THREE from 'three';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const unit = (x, y, z) => {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
};
const mixAxis = (a, b, t) => {
  const from = new THREE.Vector3(a.x, a.y, a.z).normalize();
  const to = new THREE.Vector3(b.x, b.y, b.z).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from, to);
  const rotation = new THREE.Quaternion().slerp(turn, t);
  from.applyQuaternion(rotation);
  return { x: from.x, y: from.y, z: from.z };
};
const FLOOR = .026;

// World units are metres. The cork's leading tip is exactly the flight point;
// the skirt trails behind it, including when the shuttle is falling or resting.
export function makeShuttleModel() {
  const shuttle = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xfffff5, roughness: .8,
    emissive: 0xb7beb6, emissiveIntensity: .14, side: THREE.DoubleSide });
  const feathers = new THREE.Mesh(new THREE.CylinderGeometry(.011, .033, .061, 16, 1, true), white);
  feathers.position.y = -.053;
  shuttle.add(feathers);
  const cork = new THREE.Mesh(new THREE.SphereGeometry(.013, 12, 8), white);
  cork.position.y = -.013;
  shuttle.add(cork);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.033, .0008, 3, 16), white);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -.0835;
  shuttle.add(rim);
  const ribs = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    ribs.push(Math.cos(a)*.033, -.0835, Math.sin(a)*.033,
      Math.cos(a)*.011, -.0225, Math.sin(a)*.011);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(ribs, 3));
  shuttle.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xdde6db })));
  return shuttle;
}

// A cosmetic tail after authoritative scoring. It never feeds back into rules,
// and is a pure time sample so pausing and replaying do not accumulate drift.
export function sampleRallyEnd(event, elapsed) {
  const age = clamp(elapsed, 0, event.duration);
  const side = event.hitSide === 0 ? 1 : -1;
  const net = event.kind === 'net';
  const incoming = unit(event.vx, event.vy, event.vz);
  const horizontal = unit(event.vx, 0, event.vz || -side);
  const initialFall = clamp(event.vy, -1.5, 0);
  const height = Math.max(0, event.y - FLOOR);
  const fallTime = net ? (initialFall + Math.sqrt(initialFall**2 + 17*height)) / 8.5 : 0;
  const fallingTime = Math.min(age, fallTime);
  const landingX = event.x + (net ? clamp(event.vx, -2, 2)*.06*(1-Math.exp(-4*fallTime)) : 0);
  const landingZ = event.z + (net ? side*.2*(1-Math.exp(-8*fallTime)) : 0);
  const onFloorAge = Math.max(0, age - fallTime);
  const floorDirection = net ? unit(event.vx*.15, 0, side) : horizontal;
  const skid = (net ? .07 : .2) * (1 - Math.exp(-8*onFloorAge));
  const grounded = age >= fallTime;
  const bounce = onFloorAge < .18 ? .036*Math.sin(Math.PI*onFloorAge/.18) : 0;
  const tip = smooth(onFloorAge/.28);
  const position = grounded ? {
    x: landingX + floorDirection.x*skid,
    y: FLOOR + .012*tip + bounce,
    z: landingZ + floorDirection.z*skid,
  } : {
    x: event.x + clamp(event.vx, -2, 2)*.06*(1-Math.exp(-4*fallingTime)),
    y: event.y + initialFall*fallingTime - 4.25*fallingTime**2,
    z: event.z + side*.2*(1-Math.exp(-8*fallingTime)),
  };
  const down = unit(floorDirection.x*.18, -1, floorDirection.z*.18);
  const fallAxis = mixAxis(incoming, down, smooth(fallingTime/.22));
  const resting = unit(floorDirection.x, -.25, floorDirection.z);
  const axis = grounded ? mixAxis(net ? fallAxis : incoming, resting, tip) : fallAxis;
  return { position, axis, grounded, age,
    impact: { x: landingX, z: landingZ },
    markOpacity: .6 * (1 - smooth((age-.75)/.65)),
    roll: grounded ? .22*Math.sin(onFloorAge*22)*Math.exp(-8*onFloorAge) : 0,
  };
}

export class RallyEndPresentation {
  constructor() { this.clear(); }
  clear() { this.key = null; this.event = null; this.age = 0; this.sample = null; this.active = false; }
  update(state, dt) {
    const event = state.rallyEnd;
    if (!event || ['serve', 'rally'].includes(state.phase)) { this.clear(); return null; }
    const key = `${event.id}:${event.hitId}:${event.at}`;
    if (this.key !== key) {
      this.key = key;
      this.event = { ...event };
      this.age = clamp(state.time-event.at, 0, event.duration);
    } else if (!['paused', 'countdown'].includes(state.phase)) {
      // The simulation intentionally freezes at match end. This clock can still
      // finish that last fall, while a real pause freezes the cosmetic tail too.
      this.age = Math.min(event.duration, Math.max(this.age + Math.max(0, dt), state.time-event.at));
    }
    this.active = this.age < event.duration;
    this.sample = sampleRallyEnd(this.event, this.age);
    return this.sample;
  }
}
