import * as THREE from 'three';
import { NET_PHYSICS, advanceNetCloth, applyNetImpact, createNetCloth, resetNetCloth,
  resolveNetImpact, sampleNetOffset, sampleNetWave } from '../shared/net-physics.js';

const { halfWidth: HALF_WIDTH, bottom: BOTTOM, top: TOP } = NET_PHYSICS;

function bandGeometry(width, centerY, height, depth, segments = 128, sag = 0, sideBindings = false) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments - .5) * width, lift = sag * (x / (width / 2)) ** 2;
    for (const [dy, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
      positions.push(x, centerY + dy * height / 2 + lift, dz * depth / 2);
    if (i < segments) for (let side = 0; side < 4; side++) {
      const a = i * 4 + side, b = i * 4 + (side + 1) % 4;
      indices.push(a, b, a + 4, b, b + 4, a + 4);
    }
  }
  indices.push(0, 2, 1, 0, 3, 2);
  const end = segments * 4;
  indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
  if (sideBindings) for (const sign of [-1, 1]) {
    const start = positions.length / 3;
    for (let row = 0; row <= 2; row++) {
      const y = BOTTOM + (TOP + .018 - BOTTOM) * row / 2;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
        positions.push(sign * HALF_WIDTH + dx * .01, y, dz * depth / 2);
      if (row < 2) for (let side = 0; side < 4; side++) {
        const a = start + row * 4 + side, b = start + (row + 1) * 4 + side;
        const c = start + row * 4 + (side + 1) % 4, d = start + (row + 1) * 4 + (side + 1) % 4;
        indices.push(a, b, c, c, b, d);
      }
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    const last = start + 8;
    indices.push(last, last + 2, last + 1, last, last + 3, last + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function rememberRest(mesh, deformationScale = 1, cloth) {
  mesh.userData.restPositions = mesh.geometry.attributes.position.array.slice();
  mesh.userData.deformationScale = deformationScale;
  const positions = mesh.geometry.attributes.position, nodes = new Uint16Array(positions.count * 4);
  const weights = new Float32Array(positions.count * 4), stride = cloth.columns + 1;
  for (let i = 0; i < positions.count; i++) {
    const u = Math.max(0, Math.min(1, (positions.getX(i) + NET_PHYSICS.halfWidth)
      / (NET_PHYSICS.halfWidth * 2))) * cloth.columns;
    const v = Math.max(0, Math.min(1, (positions.getY(i) - NET_PHYSICS.bottom)
      / (NET_PHYSICS.top - NET_PHYSICS.bottom))) * cloth.rows;
    const column = Math.min(cloth.columns - 1, Math.floor(u)), row = Math.min(cloth.rows - 1, Math.floor(v));
    const tx = u - column, ty = v - row, map = i * 4;
    nodes[map] = row * stride + column; nodes[map + 1] = nodes[map] + 1;
    nodes[map + 2] = (row + 1) * stride + column; nodes[map + 3] = nodes[map + 2] + 1;
    weights[map] = (1 - tx) * (1 - ty); weights[map + 1] = tx * (1 - ty);
    weights[map + 2] = (1 - tx) * ty; weights[map + 3] = tx * ty;
  }
  mesh.userData.sampleNodes = nodes; mesh.userData.sampleWeights = weights;
  mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.boundingSphere.radius += .12;
}

function restoreGeometry(net) {
  for (const mesh of net.group.children) {
    const positions = mesh.geometry.attributes.position, rest = mesh.userData.restPositions;
    if (!rest) continue;
    positions.array.set(rest); positions.needsUpdate = true;
    if (mesh.isMesh) mesh.geometry.computeVertexNormals();
  }
  net.atRest = true;
}

function deformGeometry(net) {
  for (const mesh of net.group.children) {
    const positions = mesh.geometry.attributes.position, rest = mesh.userData.restPositions;
    const scale = mesh.userData.deformationScale ?? 1;
    const nodes = mesh.userData.sampleNodes, weights = mesh.userData.sampleWeights;
    for (let i = 0; i < positions.count; i++) {
      const offset = i * 3, map = i * 4;
      let dx = 0, dy = 0, dz = 0;
      for (let corner = 0; corner < 4; corner++) {
        const source = nodes[map + corner] * 3, weight = weights[map + corner];
        dx += (net.cloth.positions[source] - net.cloth.rest[source]) * weight;
        dy += (net.cloth.positions[source + 1] - net.cloth.rest[source + 1]) * weight;
        dz += net.cloth.positions[source + 2] * weight;
      }
      const wave = sampleNetWave(net.cloth, rest[offset], rest[offset + 1], net.sample);
      positions.setXYZ(i, rest[offset] + THREE.MathUtils.clamp((dx + wave.x) * scale, -.025, .025),
        rest[offset + 1] + THREE.MathUtils.clamp((dy + wave.y) * scale, -.025, .025),
        rest[offset + 2] + THREE.MathUtils.clamp((dz + wave.z) * scale, -.11, .11));
    }
    positions.needsUpdate = true;
    if (mesh.isMesh) mesh.geometry.computeVertexNormals();
  }
  net.atRest = net.cloth.settled;
}

export function makeNetVisual(scene) {
  const group = new THREE.Group(); group.name = 'tensioned-badminton-net';
  const cloth = createNetCloth();
  const positions = [], colors = [], columns = 64, rows = 16;
  const point = (column, row, direction) => {
    const x = (column / columns - .5) * HALF_WIDTH * 2;
    const y = BOTTOM + (TOP - BOTTOM + .018 * (x / HALF_WIDTH) ** 2) * row / rows;
    return [x, y, ((column + row) % 2 ? -1 : 1) * .0013 * direction];
  };
  for (let col = 0; col <= columns; col++) for (let row = 0; row < rows; row++)
    positions.push(...point(col, row, 1), ...point(col, row + 1, 1));
  for (let row = 0; row <= rows; row++) for (let col = 0; col < columns; col++)
    positions.push(...point(col, row, -1), ...point(col + 1, row, -1));
  const strandColor = new THREE.Color(0x243e3b), stitchColor = new THREE.Color(0xa7a998);
  for (let i = 0; i < positions.length / 3; i++) colors.push(strandColor.r, strandColor.g, strandColor.b);
  for (const face of [-1, 1]) for (let col = 0; col < columns; col++) for (const t of [.26, .74]) {
    const x = ((col + t) / columns - .5) * HALF_WIDTH * 2;
    positions.push(x, TOP - .021 + .018 * (x / HALF_WIDTH) ** 2, face * .015);
    colors.push(stitchColor.r, stitchColor.g, stitchColor.b);
  }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wireGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const wires = new THREE.LineSegments(wireGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8 }));
  wires.name = 'knotted-net-mesh'; group.add(wires);

  const tapeGeometry = bandGeometry(HALF_WIDTH * 2, TOP, .062, .029, 96, .018), tapeColors = [];
  for (let i = 0; i < tapeGeometry.attributes.position.count; i++) {
    const shade = i % 4 === 0 || i % 4 === 3 ? .86 : 1;
    tapeColors.push(shade, shade, shade * .975);
  }
  tapeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(tapeColors, 3));
  const tape = new THREE.Mesh(tapeGeometry,
    new THREE.MeshStandardMaterial({ color: 0xf8f3df, roughness: .88, metalness: 0, vertexColors: true }));
  tape.name = 'woven-top-tape'; tape.receiveShadow = true; group.add(tape);

  const binding = new THREE.Mesh(bandGeometry(HALF_WIDTH * 2, BOTTOM, .024, .016, 48, 0, true),
    new THREE.MeshStandardMaterial({ color: 0x47675a, roughness: .95 }));
  binding.name = 'net-bottom-binding'; group.add(binding);
  rememberRest(wires, 1, cloth); rememberRest(tape, .82, cloth); rememberRest(binding, .9, cloth);
  scene?.add(group);
  return { group, wires, tape, binding, cloth, sample: { x: 0, y: 0, z: 0 },
    key: null, atRest: true };
}

const eventKey = event => [event.id, event.hitId, event.at, event.x, event.y, event.vx, event.vy, event.vz].join(':');

// Match callers pass bounded contact history and the display clock. Legacy
// diagnostics may still pass one event and its age. Rewinds rebuild, repeated
// frames freeze, and new contacts add momentum to the moving cloth.
export function updateNetVisual(net, source, time = 0) {
  const history = Array.isArray(source);
  const now = Number.isFinite(time) ? Math.max(0, time) : 0;
  const events = (history ? source : source ? [{ ...source, at: 0 }] : [])
    .filter(e => resolveNetImpact(e) && Number.isFinite(e.at) && e.at <= now + 1e-9
      && now - e.at < NET_PHYSICS.duration).sort((a, b) => a.at - b.at);
  if (!events.length) {
    if (!net.atRest) restoreGeometry(net);
    resetNetCloth(net.cloth); net.origin = null; net.seen = new Set(); net.clock = now;
    return;
  }
  const fresh = events.filter(e => !net.seen?.has(eventKey(e)));
  if (net.origin == null || now < net.clock - 1e-9 || fresh.some(e => e.at < net.clock - 1e-9)) {
    resetNetCloth(net.cloth); net.origin = events[0].at; net.seen = new Set();
  }
  const previousSteps = net.cloth.steps;
  let changed = false;
  for (const event of events) {
    const key = eventKey(event);
    if (net.seen.has(key)) continue;
    advanceNetCloth(net.cloth, event.at - net.origin);
    applyNetImpact(net.cloth, event); net.seen.add(key); changed = true;
  }
  advanceNetCloth(net.cloth, now - net.origin); net.clock = now;
  if (net.cloth.settled) { if (!net.atRest) restoreGeometry(net); }
  else if (changed || net.cloth.steps !== previousSteps || net.atRest) deformGeometry(net);
}

// Read-only compatibility sampler for diagnostics. Runtime rendering advances one
// shared cloth and never allocates a new simulation per vertex.
export function sampleNetDeflection(x, y, event, age = 0) {
  const cloth = createNetCloth();
  const source = event?.kind === 'net' && Number.isFinite(event.y)
    ? { ...event, y: Math.max(BOTTOM, Math.min(TOP, event.y)) } : event;
  if (!applyNetImpact(cloth, source)) return 0;
  advanceNetCloth(cloth, age);
  return sampleNetOffset(cloth, x, y).z;
}
