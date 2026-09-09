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
    { y: -.025, radius: .0108, width: .00055 },
    { y: -.041, radius: .0165, width: .0012 },
    { y: -.056, radius: .0225, width: .0039 },
    { y: -.069, radius: .0280, width: .0053 },
    { y: -.081, radius: .0322, width: .0041 },
    { y: -.087, radius: .0330, width: .0003 },
  ];
  for (let feather = 0; feather < 16; feather++) {
    const angle = feather / 16 * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
    const start = positions.length / 3;
    for (let row = 0; row < rows.length; row++) {
      const { y, radius, width } = rows[row];
      for (const edge of [-1, 0, 1]) {
        const ridge = edge === 0 && row > 0 && row < rows.length - 1 ? .00075 : 0;
        positions.push(cos * (radius + ridge) - sin * width * edge,
          y + (edge === 1 ? .0007 : 0), sin * (radius + ridge) + cos * width * edge);
        const shade = (edge === -1 ? .85 : edge === 1 ? .95 : 1) * (feather % 2 ? .985 : 1);
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
      // Fine barbs meet the centre shaft, with a slight diagonal grain. They
      // share the quill buffer, including the two stitched skirt bindings below.
      if (row >= 2 && row < rows.length - 1) for (const side of [-1, 1]) {
        ribs.push(cos * (radius + .00085), y + .002, sin * (radius + .00085),
          cos * (radius + .0002) - sin * width * side * .86, y - .001,
          sin * (radius + .0002) + cos * width * side * .86);
      }
    }
  }
  for (const { y, radius } of [{ y: -.035, radius: .0152 }, { y: -.047, radius: .0195 }]) {
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2, b = (i + 1) / 32 * Math.PI * 2;
      ribs.push(Math.cos(a) * radius, y, Math.sin(a) * radius,
        Math.cos(b) * radius, y, Math.sin(b) * radius);
    }
  }
  for (let i = 0; i < 16; i++) for (const side of [-1, 1]) {
    const a = i / 16 * Math.PI * 2, b = a + side * Math.PI / 32;
    ribs.push(Math.cos(a) * .0152, -.035, Math.sin(a) * .0152,
      Math.cos(b) * .0195, -.047, Math.sin(b) * .0195);
  }
  const featherGeometry = new THREE.BufferGeometry();
  featherGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  featherGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  featherGeometry.setIndex(indices); featherGeometry.computeVertexNormals();
  const feathers = new THREE.Mesh(featherGeometry, white);
  feathers.name = 'sixteen-separated-feather-vanes'; shuttle.add(feathers);
  // A rounded leading dome and a short straight sleeve read as cork rather
  // than a bead. The leading pole stays at the authoritative flight origin.
  const corkGeometry = new THREE.LatheGeometry([
    [0, 0], [.0054, -.0012], [.0095, -.004], [.012, -.008],
    [.0125, -.0125], [.0122, -.0205], [.0115, -.024], [0, -.024],
  ].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 12);
  const corkColors = [], corkVertices = corkGeometry.attributes.position;
  for (let i = 0; i < corkVertices.count; i++) {
    const x = corkVertices.getX(i), y = corkVertices.getY(i), z = corkVertices.getZ(i);
    const grain = .95 + .05 * Math.sin(x * 1600 + z * 900) * Math.cos(y * 1800);
    corkColors.push(grain, grain * .97, grain * .9);
  }
  corkGeometry.setAttribute('color', new THREE.Float32BufferAttribute(corkColors, 3));
  const cork = new THREE.Mesh(corkGeometry,
    new THREE.MeshStandardMaterial({ color: 0xf5e7c9, roughness: .94, emissive: 0xa89e86, emissiveIntensity: .08, vertexColors: true }));
  cork.name = 'rounded-cork-tip';
  shuttle.add(cork);
  const collarGeometry = new THREE.LatheGeometry([
    [.0105, -.0255], [.012, -.0252], [.0123, -.0247],
    [.0123, -.022], [.0119, -.0215], [.0109, -.0215],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  const collar = new THREE.Mesh(collarGeometry,
    new THREE.MeshStandardMaterial({ color: 0x1d5b51, roughness: .67 }));
  collar.name = 'cork-binding';
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
