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
  shuttle.name = 'sixteen-feather-shuttle';
  const white = new THREE.MeshStandardMaterial({ color: 0xfffdf0, roughness: .72,
    emissive: 0xb7beb6, emissiveIntensity: .16, side: THREE.DoubleSide, vertexColors: true });
  const positions = [], colors = [], indices = [], ribs = [];
  // A single merged surface contains sixteen separate, slightly folded vanes.
  // The silhouette is scalloped instead of a solid cone, without sixteen draw calls.
  const rows = [
    { y: -.025, radius: .011, width: .0009 },
    { y: -.052, radius: .021, width: .0038 },
    { y: -.074, radius: .030, width: .0054 },
    { y: -.085, radius: .033, width: .0023 },
  ];
  for (let feather = 0; feather < 16; feather++) {
    const angle = feather / 16 * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
    const start = positions.length / 3;
    for (let row = 0; row < rows.length; row++) {
      const { y, radius, width } = rows[row];
      for (const edge of [-1, 0, 1]) {
        const ridge = edge === 0 && row > 0 && row < 3 ? .00065 : 0;
        positions.push(cos * (radius + ridge) - sin * width * edge,
          y + (edge === 1 ? .0007 : 0), sin * (radius + ridge) + cos * width * edge);
        const shade = edge === -1 ? .88 : 1;
        colors.push(shade, shade, shade * .985);
      }
      if (row < rows.length - 1) for (let edge = 0; edge < 2; edge++) {
        const a = start + row * 3 + edge;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
      if (row < rows.length - 1) {
        const next = rows[row + 1];
        ribs.push(cos * (radius + .0008), y, sin * (radius + .0008),
          cos * (next.radius + .0008), next.y, sin * (next.radius + .0008));
      }
    }
  }
  const featherGeometry = new THREE.BufferGeometry();
  featherGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  featherGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  featherGeometry.setIndex(indices); featherGeometry.computeVertexNormals();
  const feathers = new THREE.Mesh(featherGeometry, white);
  feathers.name = 'sixteen-separated-feather-vanes'; shuttle.add(feathers);
  const cork = new THREE.Mesh(new THREE.SphereGeometry(.0125, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf5e7c9, roughness: .94, emissive: 0xa89e86, emissiveIntensity: .08 }));
  cork.name = 'rounded-cork-tip'; cork.position.y = -.0125;
  shuttle.add(cork);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(.0118, .0109, .004, 16),
    new THREE.MeshStandardMaterial({ color: 0x1d5b51, roughness: .67 }));
  collar.name = 'cork-binding'; collar.position.y = -.023;
  shuttle.add(collar);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(ribs, 3));
  const quills = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xd3d5bd }));
  quills.name = 'feather-quills'; shuttle.add(quills);
  shuttle.userData.featherCount = 16;
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
