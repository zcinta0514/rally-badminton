import * as THREE from 'three';

// The waistband splits at the crotch into two leg openings. The centre seam
// shares actual vertices so it stays closed even when the thighs turn apart.
export function makeAthleteShorts(material, colors) {
  const positions = [], colorsRGB = [], weights = [], legIndices = [], triangles = [];
  const cloth = new THREE.Color(0x203f4a), waist = new THREE.Color(colors.dark);
  const stripe = cloth.clone().lerp(new THREE.Color(colors.accent), .23);
  function vertex(x, y, z, leg, weight, color) {
    positions.push(x, y, z);
    weights.push(1 - weight, weight, 0, 0);
    legIndices.push(leg);
    colorsRGB.push(color.r, color.g, color.b);
    return legIndices.length - 1;
  }
  function panel(upper, lower, sign, first = 0, count = 24) {
    for (let step = first; step < first + count; step++) {
      const i = step % 24, j = (i + 1) % 24;
      const a = upper[i], b = upper[j], c = lower[i], d = lower[j];
      if (sign > 0) triangles.push(a, b, c, b, d, c);
      else triangles.push(a, c, b, b, c, d);
    }
  }
  const centre = new Map();
  for (const sign of [-1, 1]) {
    const leg = sign < 0 ? 1 : 2;
    let previous;
    for (const [row, [y, rx, rz, weight]] of [
      [.924, .181, .121, 0], [.911, .183, .122, 0], [.877, .198, .128, .07],
      [.837, .218, .136, .22], [.795, .236, .139, .44]
    ].entries()) {
      const split = row === 4, ring = [];
      for (let i = 0; i < 24; i++) {
        const inner = i >= 8 && i <= 16;
        if (inner && !split && i !== 8 && i !== 16) continue;
        const seamKey = row * 24 + i;
        if (inner && centre.has(seamKey)) { ring[i] = centre.get(seamKey); continue; }
        const angle = (i <= 8 ? i : i - 24) * Math.PI / 16;
        const side = inner ? 0 : Math.cos(angle);
        const z = inner ? Math.cos((i - 8) * Math.PI / 8) : Math.sin(angle);
        const rise = split && inner ? -.052 * Math.sin((i - 8) * Math.PI / 8) : 0;
        ring[i] = vertex(sign * rx * side, y + rise, rz * z, leg, weight * side, row === 0 ? waist : cloth);
        if (inner) centre.set(seamKey, ring[i]);
      }
      if (previous) panel(previous, ring, sign, 16, 16);
      previous = ring;
    }
    // Move gradually from the shared fork to fully thigh-weighted cuffs.
    for (const [y, rx, rz, following, blend] of [
      [.731, .107, .119, .72, .66], [.68, .101, .109, .98, 1],
      [.654, .100, .105, 1, 1], [.647, .099, .104, 1, 1],
      [.648, .094, .099, 1, 1]
    ]) {
      const ring = [];
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12, x = .145 + rx * Math.cos(angle), z = rz * Math.sin(angle);
        const fork = i >= 8 && i <= 16 ? 0 : Math.cos((i <= 8 ? i : i - 24) * Math.PI / 16);
        const legWeight = following * THREE.MathUtils.lerp(fork, 1, blend);
        ring.push(vertex(sign * x, y, z, leg, legWeight, y <= .648 ? stripe : cloth));
      }
      panel(previous, ring, sign);
      previous = ring;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsRGB, 3));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  const shorts = new THREE.SkinnedMesh(geometry, material);
  shorts.name = 'athlete-shorts';
  shorts.castShadow = shorts.receiveShadow = true;
  shorts.frustumCulled = false;
  // Both body skins have the same pelvis and upper-leg bind positions. Reuse
  // the active skeleton, including after the GLB replaces the procedural body.
  shorts.userData.bindToBody = (skeleton, names) => {
    const indices = names.map(name => skeleton.bones.findIndex(bone => bone.name === name));
    const skinIndex = legIndices.flatMap(leg => [indices[0], indices[leg], 0, 0]);
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    shorts.bind(skeleton, new THREE.Matrix4());
  };
  return shorts;
}
