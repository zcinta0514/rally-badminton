import * as THREE from 'three';

const HALF_WIDTH = 3.17, BOTTOM = .79, TOP = 1.52;
const clamp = THREE.MathUtils.clamp;

// This is a presentation sample of an already scored net contact. It is never
// read by collision rules. Sampling the same ending age gives exactly the same
// shape, including while the match is paused or a snapshot arrives late.
export function sampleNetDeflection(x, y, event, age = 0) {
  if (event?.kind !== 'net' || !Number.isFinite(age) || age <= 0 || age >= 1.2) return 0;
  const pinned = Math.max(0, Math.sin(Math.PI * clamp((x + HALF_WIDTH) / (HALF_WIDTH * 2), 0, 1)));
  const height = clamp((y - BOTTOM) / (TOP - BOTTOM), 0, 1);
  const tension = .14 + .86 * Math.sin(Math.PI * height);
  const contactX = clamp(Number.isFinite(event.x) ? event.x : 0, -HALF_WIDTH, HALF_WIDTH);
  const contactY = clamp(Number.isFinite(event.y) ? event.y : (TOP + BOTTOM) / 2, BOTTOM, TOP);
  const spread = Math.exp(-(((x - contactX) / .78) ** 2))
    * (.12 + .88 * Math.exp(-(((y - contactY) / .25) ** 2)));
  const speed = Number.isFinite(event.vz) ? Math.abs(event.vz) : 8;
  const strength = clamp(.033 + speed * .002, .038, .074);
  return strength * pinned * tension * spread * Math.sin(age * 23) * Math.exp(-5.8 * age) * (event.hitSide === 0 ? -1 : 1);
}

function bandGeometry(width, centerY, height, depth, segments = 48, sag = 0, sideBindings = false) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments - .5) * width, lift = sag * (x / (width / 2)) ** 2;
    for (const [dy, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(x, centerY + dy * height / 2 + lift, dz * depth / 2);
    }
    if (i < segments) for (let side = 0; side < 4; side++) {
      const a = i * 4 + side, b = i * 4 + (side + 1) % 4;
      indices.push(a, b, a + 4, b, b + 4, a + 4);
    }
  }
  indices.push(0, 2, 1, 0, 3, 2);
  const end = segments * 4;
  indices.push(end, end + 1, end + 2, end, end + 2, end + 3);
  // Side hems share the bottom binding's material and draw. Their vertices sit
  // at the anchored ends of the existing net, rather than adding new posts.
  if (sideBindings) for (const sign of [-1, 1]) {
    const start = positions.length / 3;
    for (let row = 0; row <= 2; row++) {
      const y = BOTTOM + (TOP + .018 - BOTTOM) * row / 2;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        positions.push(sign * HALF_WIDTH + dx * .01, y, dz * depth / 2);
      }
      if (row < 2) for (let side = 0; side < 4; side++) {
        const a = start + row * 4 + side, b = start + row * 4 + (side + 1) % 4;
        indices.push(a, a + 4, b, b, a + 4, b + 4);
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

export function makeNetVisual(scene) {
  const group = new THREE.Group(); group.name = 'tensioned-badminton-net';
  const positions = [], colors = [], columns = 48, rows = 8;
  const point = (column, row, direction) => {
    const x = (column / columns - .5) * HALF_WIDTH * 2;
    const y = BOTTOM + (TOP - BOTTOM + .018 * (x / HALF_WIDTH) ** 2) * row / rows;
    return [x, y, ((column + row) % 2 ? -1 : 1) * .0013 * direction];
  };
  // Split both directions at every knot. A vertical strand with only two end
  // vertices would remain rigid even when the middle of the mesh is hit.
  for (let col = 0; col <= columns; col++) for (let row = 0; row < rows; row++) positions.push(...point(col, row, 1), ...point(col, row + 1, 1));
  for (let row = 0; row <= rows; row++) for (let col = 0; col < columns; col++) positions.push(...point(col, row, -1), ...point(col + 1, row, -1));
  const strandColor = new THREE.Color(0x243e3b), stitchColor = new THREE.Color(0xa7a998);
  for (let i = 0; i < positions.length / 3; i++) colors.push(strandColor.r, strandColor.g, strandColor.b);
  // Short stitches on both tape faces add a readable seam in the strand draw.
  // Their rest heights use the same tension curve as the existing tape.
  for (const face of [-1, 1]) for (let col = 0; col < columns; col++) {
    for (const t of [.26, .74]) {
      const x = ((col + t) / columns - .5) * HALF_WIDTH * 2;
      positions.push(x, TOP - .021 + .018 * (x / HALF_WIDTH) ** 2, face * .015);
      colors.push(stitchColor.r, stitchColor.g, stitchColor.b);
    }
  }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wireGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const wires = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8 }));
  wires.name = 'knotted-net-mesh'; group.add(wires);
  const tapeGeometry = bandGeometry(HALF_WIDTH * 2, TOP, .062, .029, 48, .018), tapeColors = [];
  for (let i = 0; i < tapeGeometry.attributes.position.count; i++) {
    const shade = i % 4 === 0 || i % 4 === 3 ? .86 : 1;
    tapeColors.push(shade, shade, shade * .975);
  }
  tapeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(tapeColors, 3));
  const tape = new THREE.Mesh(tapeGeometry,
    new THREE.MeshStandardMaterial({ color: 0xf8f3df, roughness: .88, metalness: 0, vertexColors: true }));
  tape.name = 'woven-top-tape'; tape.receiveShadow = true; group.add(tape);
  const binding = new THREE.Mesh(bandGeometry(HALF_WIDTH * 2, BOTTOM, .024, .016, 24, 0, true),
    new THREE.MeshStandardMaterial({ color: 0x47675a, roughness: .95 }));
  binding.name = 'net-bottom-binding'; group.add(binding);
  for (const mesh of group.children) {
    mesh.userData.restPositions = mesh.geometry.attributes.position.array.slice();
    mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.computeBoundingSphere();
    // Expand once for the bounded ripple instead of recalculating every frame.
    mesh.geometry.boundingSphere.radius += .08;
  }
  scene?.add(group);
  return { group, wires, tape, binding, atRest: true };
}

export function updateNetVisual(net, event, age = 0) {
  const moving = event?.kind === 'net' && Number.isFinite(age) && age > 0 && age < 1.2;
  if (!moving && net.atRest) return;
  for (const mesh of net.group.children) {
    const positions = mesh.geometry.attributes.position, rest = mesh.userData.restPositions;
    for (let i = 0; i < positions.count; i++) {
      const offset = i * 3;
      positions.setZ(i, rest[offset + 2] + (moving ? sampleNetDeflection(rest[offset], rest[offset + 1], event, age) : 0));
    }
    positions.needsUpdate = true;
  }
  net.atRest = !moving;
}
