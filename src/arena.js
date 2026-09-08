import * as THREE from 'three';

/** Small repeatable rubber-grain texture; works in Node and needs no image request. */
export function makeCourtMaterial(color = 0x096247) {
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 93417;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 234 + ((seed >>> 24) % 18);
    data.set([grain, grain, grain, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'fine-rubber-grain';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 20);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color, map: texture, roughness: .98, metalness: 0 });
}

/** Static venue kept outside the playable floor; no spectator skeletons or shadows. */
export function makeArena(scene) {
  const arena = new THREE.Group();
  arena.name = 'indoor-arena';
  scene.add(arena);
  const batches = new Map();
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    head: new THREE.SphereGeometry(1, 8, 6),
    limb: new THREE.CylinderGeometry(1, 1, 1, 6),
    bag: new THREE.CapsuleGeometry(.5, 1, 3, 8),
  };
  const solid = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .92, metalness: 0 });
  const unlit = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const transform = new THREE.Object3D();
  const place = (kind, color, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, light = false, frame = null) => {
    const key = `${kind}:${light ? 'light' : 'solid'}`;
    if (!batches.has(key)) batches.set(key, { kind, light, items: [] });
    transform.position.set(x, y, z); transform.rotation.set(rx, ry, rz); transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    const matrix = transform.matrix.clone();
    if (frame) matrix.premultiply(frame);
    batches.get(key).items.push({ matrix, color: new THREE.Color(color) });
  };
  const box = (color, x, y, z, sx, sy, sz, ry = 0) => place('box', color, x, y, z, sx, sy, sz, ry);
  const metal = 0x35454b, seat = 0x264c58, wall = 0x132733, trim = 0x43706c;
  const seatedPeople = [];
  const contactShadows = [];
  // Every part uses this same local frame, including knees, shoes and hair.
  // seatY is the actual top surface; footY is the floor or raised footrest top.
  const seated = ({ x, seatY, z, yaw, shirt, skin, footY = 0, role = 'spectator' }) => {
    const frame = new THREE.Matrix4().makeRotationY(yaw); frame.setPosition(x, seatY, z);
    const part = (kind, color, px, py, pz, sx, sy, sz, rx = 0, rz = 0) =>
      place(kind, color, px, py, pz, sx, sy, sz, 0, rx, rz, false, frame);
    const foot = footY - seatY;
    part('box', shirt, 0, .34, .015, .36, .48, .25);
    part('head', skin, 0, .74, -.005, .126, .155, .126);
    part('head', 0x253038, 0, .80, .018, .128, .095, .128);
    for (const side of [-1, 1]) {
      if (role === 'spectator') {
        part('limb', shirt, side * .205, .29, -.075, .062, .35, .062, -.25, side * -.12);
      } else {
        part('limb', shirt, side * .222, .32, -.015, .061, .30, .061, -.2, side * .08);
        part('limb', skin, side * .224, .205, -.145, .044, .27, .044, -Math.PI / 2);
        part('head', skin, side * .224, .20, -.282, .05, .04, .068);
      }
      part('box', 0x293840, side * .10, .075, -.15, .14, .15, .38);
      const shinTop = .075, shinBottom = foot + .09;
      part('limb', 0x293840, side * .10, (shinTop + shinBottom) / 2, -.345,
        .061, shinTop - shinBottom, .061);
      part('box', 0x485860, side * .10, foot + .035, -.405, .145, .07, .25);
    }
    if (role !== 'spectator') part('box', skin, 0, .726, -.13, .032, .046, .039);
    seatedPeople.push({ role, x, z, seatY, footY, yaw });
  };
  const lowChair = (x, z, yaw) => {
    contactShadows.push({ x, z, sx: .46, sz: .5 });
    const frame = new THREE.Matrix4().makeRotationY(yaw); frame.setPosition(x, 0, z);
    const part = (color, px, py, pz, sx, sy, sz) => place('box', color, px, py, pz, sx, sy, sz, 0, 0, 0, false, frame);
    part(seat, 0, .41, 0, .48, .075, .44);
    part(seat, 0, .69, .195, .46, .46, .055);
    for (const sx of [-.19, .19]) for (const sz of [-.16, .16]) part(metal, sx, .20, sz, .042, .40, .042);
  };

  // Low end galleries remain beneath the sightline to the near baseline from
  // either player's camera. Side furniture starts beyond the net posts.
  for (const end of [-1, 1]) {
    box(wall, 0, 1.5, end * 13.4, 23, 3.4, .16);
    box(0x1f414b, 0, .3, end * 12.7, 14, .65, .7);
    box(trim, 0, 2.7, end * 13.28, 21, .05, .04);
    for (let column = -4; column <= 4; column++) {
      box(0x203f4a, column * 2.35, 1.46, end * 13.24, .055, 2.35, .08);
    }
    // Discrete overhead strip fixtures suggest the hall without extra lights.
    for (const x of [-5, 0, 5]) {
      box(0x304853, x, 3.02, end * 13.20, 2.48, .14, .095);
      place('box', 0xe6ecdc, x, 3.02, end * 13.14, 2.3, .05, .035, 0, 0, 0, true);
    }
    for (let row = 0; row < 3; row++) {
      const z = end * (9.55 + row * .92), level = row * .28;
      box(0x20343d, 0, (level - .20) / 2, z, 11, level + .20, .87);
      for (let column = 0; column < 14; column++) {
        const x = (column - 6.5) * .7;
        box(seat, x, .41 + level, z, .48, .075, .42);
        box(seat, x, .65 + level, z + end * .21, .46, .42, .065);
        box(metal, x, .20 + level, z, .085, .40, .10);
        if ((column + row * 3) % 11 === 0) continue;
        const facing = end < 0 ? Math.PI : 0;
        const skin = [0xc99a76, 0xa47758, 0xddb28e, 0x785748][(column + row) % 4];
        const shirt = [0x607e88, 0x9b7761, 0x42635d, 0x9fa6a3, 0x405771, 0x865959][(column * 3 + row) % 6];
        seated({ x, seatY: .4475 + level, z, yaw: facing, shirt, skin, footY: level });
      }
    }
    // Courtside barrier fronts are graphic blocks, not tiny unreadable lettering.
    for (const x of [-4.25, -1.42, 1.42, 4.25]) {
      box(0x1b4148, x, .30, end * 8.65, 2.72, .65, .10);
      box(0x66a391, x, .58, end * 8.59, 2.68, .035, .025);
      for (const stripe of [-1, 0, 1]) box(0x6ba294, x + stripe * .12, .29, end * 8.59, .065, .21, .025, 0);
    }
  }
  for (const side of [-1, 1]) {
    // Bring the equipment aisle up to shoe/bench level; the surrounding hall
    // base in CourtView is lower than the raised playing apron.
    box(0x132b34, side * 7.775, -.10, 0, 5.85, .20, 26.7);
    box(wall, side * 10.7, 1.5, 0, .14, 3.4, 26.7);
    for (let i = -3; i <= 3; i++) box(0x24434d, side * 10.59, 1.5, i * 3.5, .08, 3.2, .09);
    // Low wall skirting and ceiling-line fixtures add depth but stay outside the
    // court sightline. These share existing instanced batches, with no new lights.
    box(0x36565b, side * 10.55, .10, 0, .07, .15, 26.5);
    for (const z of [-8.4, -2.8, 2.8, 8.4]) {
      box(0x2b4652, side * 10.54, 3.03, z, .11, .12, 3.45);
      place('box', side < 0 ? 0xc3dfe7 : 0xe3ddc8, side * 10.47, 3.03, z, .028, .045, 3.24, 0, 0, 0, true);
    }
    // Four low benches with legs, backs, a bag and a folded towel.
    for (const end of [-1, 1]) {
      const x = side * 5.65, z = end * 4.7;
      contactShadows.push({ x, z, sx: .65, sz: 1.3 });
      const staffHere = side * end === -1;
      box(0x88785d, x, .44, z, .49, .085, 2.1);
      box(0x88785d, x + side * .2, .71, z, .06, .42, 2.1);
      for (const dz of [-.78, .78]) box(metal, x, .19, z + dz, .38, .4, .055);
      place('bag', side < 0 ? 0x465b68 : 0x77534b, x - side * .49, .22, z - (staffHere ? .68 : .35), .38, .44, .32, 0, Math.PI / 2);
      box(0xced8cf, x, .50, z + .60, .36, .035, .35);
      if (staffHere) seated({ x, seatY: .4825, z: z + .08, yaw: side * Math.PI / 2,
        shirt: 0x9baaa8, skin: side < 0 ? 0xa47758 : 0xc99a76, role: 'staff' });
      // Side barriers remain beyond the apron; no spectator overlaps the court.
      box(0x1b4148, side * 7.35, .31, end * 3.8, .10, .68, 3.4);
      box(0x66a391, side * 7.29, .62, end * 3.8, .025, .035, 3.36);
    }
  }
  // A single elevated umpire chair beside the net, entirely outside tramlines.
  const chairX = -4.13;
  contactShadows.push({ x: chairX, z: 0, sx: .58, sz: .58 });
  for (const x of [chairX - .25, chairX + .25]) for (const z of [-.30, .30]) {
    box(0x7c9198, x, .78, z, .055, 1.58, .055);
  }
  box(0x314f5b, chairX, 1.55, 0, .64, .11, .69);
  box(0x314f5b, chairX - .29, 1.87, 0, .075, .59, .68);
  for (let step = 0; step < 5; step++) box(0x7c9198, chairX, .17 + step * .29, .32, .56, .045, .06);
  for (const z of [-.32, .32]) box(0x7c9198, chairX, 1.90, z, .63, .045, .045);
  // Raised front footrest is separate from the side access ladder.
  box(0x7c9198, chairX + .415, 1.13, 0, .38, .045, .62);
  seated({ x: chairX, seatY: 1.605, z: 0, yaw: -Math.PI / 2,
    shirt: 0x729baa, skin: 0xc99a76, footY: 1.1525, role: 'umpire' });
  for (const side of [-1, 1]) {
    const x = side * 4.45, z = -side * 6.7, yaw = side * Math.PI / 2;
    lowChair(x, z, yaw);
    seated({ x, seatY: .4475, z, yaw, shirt: 0x577b89,
      skin: side < 0 ? 0x997051 : 0xd0a382, role: 'line-judge' });
  }
  arena.userData.seatedPeople = seatedPeople;

  for (const [name, batch] of batches) {
    const mesh = new THREE.InstancedMesh(geometries[batch.kind], batch.light ? unlit : solid, batch.items.length);
    mesh.name = `arena-${name}`;
    mesh.castShadow = false; mesh.receiveShadow = false;
    batch.items.forEach((item, index) => { mesh.setMatrixAt(index, item.matrix); mesh.setColorAt(index, item.color); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    arena.add(mesh);
  }
  // Static furniture receives soft grounding even when adaptive quality disables
  // dynamic shadows. Vertex alpha avoids a texture request and costs one batch.
  const shadowPositions = [0, 0, 0], shadowColors = [1, 1, 1, .24], shadowIndices = [];
  const segments = 24;
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    shadowPositions.push(Math.cos(angle), 0, Math.sin(angle)); shadowColors.push(1, 1, 1, 0);
    shadowIndices.push(0, 1 + (i + 1) % segments, i + 1);
  }
  const contactGeometry = new THREE.BufferGeometry();
  contactGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));
  contactGeometry.setAttribute('color', new THREE.Float32BufferAttribute(shadowColors, 4));
  contactGeometry.setIndex(shadowIndices);
  const shadows = new THREE.InstancedMesh(contactGeometry,
    new THREE.MeshBasicMaterial({ color: 0x061713, transparent: true, vertexColors: true, depthWrite: false }), contactShadows.length);
  shadows.name = 'furniture-contact-shadows';
  contactShadows.forEach(({ x, z, sx, sz }, index) => {
    transform.position.set(x, .004, z); transform.rotation.set(0, 0, 0); transform.scale.set(sx, 1, sz); transform.updateMatrix();
    shadows.setMatrixAt(index, transform.matrix);
  });
  shadows.instanceMatrix.needsUpdate = true; shadows.computeBoundingSphere(); arena.add(shadows);
  return arena;
}
