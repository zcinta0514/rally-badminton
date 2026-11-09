export const NET_PHYSICS = Object.freeze({
  halfWidth: 3.17,
  bottom: .79,
  top: 1.52,
  columns: 32,
  rows: 16,
  step: 1 / 120,
  iterations: 5,
  duration: 1.4,
  tapeHalfHeight: .031,
  corkRadius: .0125,
});

const SHUTTLE_MASS = .005;
const WAVE_SPEED_X = 4.8;
const WAVE_SPEED_Y = 2.35;
const WAVE_PACKET_SECONDS = .17;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const vector = value => value && typeof value === 'object' && !Array.isArray(value)
  && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const magnitude = value => Math.hypot(value.x, value.y, value.z);

// A small, dissipative contact model. Parameters are tuned game approximations,
// not measured nylon/cork material constants. Tape grazing is deterministic.
export function netTopAt(x = 0) {
  return NET_PHYSICS.top + .018 * (clamp(x, -NET_PHYSICS.halfWidth, NET_PHYSICS.halfWidth) / NET_PHYSICS.halfWidth) ** 2;
}

export function validNetImpact(value) {
  return value?.version === 1 && vector(value.impulse) && vector(value.rebound)
    && magnitude(value.impulse) <= .120001 && magnitude(value.rebound) <= 40
    && ['mesh', 'tape'].includes(value.material) && typeof value.crosses === 'boolean'
    && Number.isFinite(value.hold) && value.hold >= 0 && value.hold <= .12;
}

export function resolveNetImpact(event) {
  if (event?.kind !== 'net' || !Number.isFinite(event.x) || !Number.isFinite(event.y)
    || Math.abs(event.x) > NET_PHYSICS.halfWidth + NET_PHYSICS.corkRadius
    || event.y < NET_PHYSICS.bottom - NET_PHYSICS.corkRadius
    || event.y > netTopAt(event.x) + NET_PHYSICS.tapeHalfHeight + NET_PHYSICS.corkRadius) return null;
  if (validNetImpact(event.netImpact)) return { ...event.netImpact,
    impulse: { ...event.netImpact.impulse }, rebound: { ...event.netImpact.rebound } };
  const side = Math.sign(-finite(event.vz)) || (event.hitSide === 1 ? -1 : 1);
  const incoming = { x: finite(event.vx), y: finite(event.vy), z: finite(event.vz, -side * 8) };
  const material = event.y >= netTopAt(event.x) - NET_PHYSICS.tapeHalfHeight - NET_PHYSICS.corkRadius ? 'tape' : 'mesh';
  let rebound;
  if (material === 'tape') {
    const ny = clamp((event.y - netTopAt(event.x)) / (NET_PHYSICS.tapeHalfHeight + NET_PHYSICS.corkRadius), -1, 1);
    const nz = side * Math.sqrt(Math.max(0, 1 - ny * ny));
    const vn = Math.min(0, incoming.y * ny + incoming.z * nz);
    rebound = { x: clamp(incoming.x * .6, -3, 3),
      y: clamp((incoming.y - vn * ny) * .6 - vn * ny * .06, -3, 2.5),
      z: clamp((incoming.z - vn * nz) * .6 - vn * nz * .06, -30, 30) };
  } else rebound = { x: clamp(incoming.x * .25, -.6, .6),
    y: clamp(incoming.y * .22, -1.6, .15), z: side * clamp(Math.abs(incoming.z) * .055, .08, .45) };
  // Tangential energy cannot create a second hard shot at the tape.
  const energyLimit = magnitude(incoming) * .65, speed = magnitude(rebound);
  if (speed > energyLimit && speed > 0) for (const axis of ['x', 'y', 'z']) rebound[axis] *= energyLimit / speed;
  const crosses = material === 'tape' && rebound.z * incoming.z > 0 && Math.abs(rebound.z) > .08;
  if (!crosses) {
    rebound.x = clamp(rebound.x, -.7, .7); rebound.y = clamp(rebound.y, -1.6, .35);
    rebound.z = side * clamp(Math.abs(rebound.z), .06, .45);
  }
  const impulse = { x: SHUTTLE_MASS * (incoming.x - rebound.x),
    y: SHUTTLE_MASS * (incoming.y - rebound.y), z: SHUTTLE_MASS * (incoming.z - rebound.z) };
  const length = magnitude(impulse);
  if (length > .12) for (const axis of ['x', 'y', 'z']) impulse[axis] *= .12 / length;
  return { version: 1, material, crosses, impulse, rebound,
    hold: crosses ? 0 : material === 'mesh' && magnitude(incoming) < 6 ? .075 : .025 };
}

function constraintBuilder(rest) {
  const a = [], b = [], length = [], stiffness = [];
  return {
    add(first, second, strength) {
      const ia = first * 3, ib = second * 3;
      a.push(first); b.push(second);
      length.push(Math.hypot(rest[ib] - rest[ia], rest[ib + 1] - rest[ia + 1], rest[ib + 2] - rest[ia + 2]));
      stiffness.push(strength);
    },
    finish() {
      return { a: Uint16Array.from(a), b: Uint16Array.from(b),
        length: Float64Array.from(length), stiffness: Float64Array.from(stiffness) };
    },
  };
}

export function createNetCloth({ columns = NET_PHYSICS.columns, rows = NET_PHYSICS.rows } = {}) {
  columns = Math.max(2, Math.floor(columns)); rows = Math.max(2, Math.floor(rows));
  const count = (columns + 1) * (rows + 1);
  const rest = new Float64Array(count * 3), positions = new Float64Array(count * 3);
  const previous = new Float64Array(count * 3), inverseMass = new Float64Array(count);
  const index = (column, row) => row * (columns + 1) + column;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const node = index(column, row), offset = node * 3;
    const x = (column / columns - .5) * NET_PHYSICS.halfWidth * 2;
    const top = NET_PHYSICS.top + .018 * (x / NET_PHYSICS.halfWidth) ** 2;
    rest[offset] = x; rest[offset + 1] = NET_PHYSICS.bottom + (top - NET_PHYSICS.bottom) * row / rows;
    rest[offset + 2] = 0; inverseMass[node] = column === 0 || column === columns ? 0 : 1;
  }
  positions.set(rest); previous.set(rest);
  const builder = constraintBuilder(rest);
  for (let row = 0; row <= rows; row++) for (let column = 0; column < columns; column++)
    builder.add(index(column, row), index(column + 1, row), row === rows ? .96 : .72);
  for (let row = 0; row < rows; row++) for (let column = 0; column <= columns; column++)
    builder.add(index(column, row), index(column, row + 1), .68);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    builder.add(index(column, row), index(column + 1, row + 1), .42);
    builder.add(index(column + 1, row), index(column, row + 1), .42);
  }
  for (let row = 0; row <= rows; row++) for (let column = 0; column < columns - 1; column++)
    builder.add(index(column, row), index(column + 2, row), .18);
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column <= columns; column++)
    builder.add(index(column, row), index(column, row + 2), .18);
  return { columns, rows, count, rest, positions, previous, inverseMass, constraints: builder.finish(),
    age: 0, steps: 0, quietSteps: 0, settled: true, impact: null, waves: [], lastImpactAt: 0 };
}

export function resetNetCloth(cloth) {
  cloth.positions.set(cloth.rest); cloth.previous.set(cloth.rest);
  cloth.age = 0; cloth.steps = 0; cloth.quietSteps = 0; cloth.settled = true; cloth.impact = null; cloth.waves = []; cloth.lastImpactAt = 0;
  return cloth;
}

export function applyNetImpact(cloth, event) {
  const impact = resolveNetImpact(event);
  if (!impact) return false;
  const length = magnitude(impact.impulse);
  if (!(length > 0)) return false;
  const direction = { x: impact.impulse.x / length, y: impact.impulse.y / length, z: impact.impulse.z / length };
  const contactX = clamp(finite(event.x), -NET_PHYSICS.halfWidth, NET_PHYSICS.halfWidth);
  const contactY = clamp(finite(event.y), NET_PHYSICS.bottom, NET_PHYSICS.top);
  const speed = clamp(length * 18, .24, 1.45), dt = NET_PHYSICS.step;
  const normalSpeed = Math.abs(finite(event.vz));
  const impactWeight = Math.max(clamp((length - .012) / .075, 0, 1), clamp((normalSpeed - 2) / 16, 0, 1));
  cloth.waves = cloth.waves.filter(wave => cloth.age - wave.at < NET_PHYSICS.duration);
  cloth.waves.push({ at: cloth.age, x: contactX, y: contactY, direction: direction.z < 0 ? -1 : 1,
    amplitude: (impact.material === 'tape' ? .018 : .026) + impactWeight * .054 });
  cloth.lastImpactAt = cloth.age; cloth.quietSteps = 0;
  for (let node = 0; node < cloth.count; node++) {
    if (cloth.inverseMass[node] === 0) continue;
    const offset = node * 3, dx = (cloth.rest[offset] - contactX) / .18, dy = (cloth.rest[offset + 1] - contactY) / .18;
    const weight = Math.exp(-(dx * dx + dy * dy) / 2);
    if (weight < .0001) continue;
    cloth.previous[offset] -= direction.x * speed * weight * dt;
    cloth.previous[offset + 1] -= direction.y * speed * weight * dt;
    cloth.previous[offset + 2] -= direction.z * speed * weight * dt;
  }
  cloth.settled = false; cloth.impact = impact;
  return true;
}

function pinAndLimit(cloth) {
  const { columns, rows, rest, positions, previous, inverseMass } = cloth;
  let maxDisplacement = 0, maxVelocity = 0;
  for (let node = 0; node < cloth.count; node++) {
    const offset = node * 3;
    if (inverseMass[node] === 0) {
      positions[offset] = rest[offset]; positions[offset + 1] = rest[offset + 1]; positions[offset + 2] = rest[offset + 2];
      previous[offset] = rest[offset]; previous[offset + 1] = rest[offset + 1]; previous[offset + 2] = rest[offset + 2];
      continue;
    }
    const row = Math.floor(node / (columns + 1)), top = row / rows;
    positions[offset] = clamp(positions[offset], rest[offset] - .025, rest[offset] + .025);
    positions[offset + 1] = clamp(positions[offset + 1], rest[offset + 1] - .025, rest[offset + 1] + .025);
    const zLimit = .11 - .05 * top ** 4;
    positions[offset + 2] = clamp(positions[offset + 2], -zLimit, zLimit);
    const dx = positions[offset] - rest[offset], dy = positions[offset + 1] - rest[offset + 1], dz = positions[offset + 2];
    maxDisplacement = Math.max(maxDisplacement, Math.hypot(dx, dy, dz));
    maxVelocity = Math.max(maxVelocity, Math.hypot(positions[offset] - previous[offset],
      positions[offset + 1] - previous[offset + 1], positions[offset + 2] - previous[offset + 2]) / NET_PHYSICS.step);
  }
  return { maxDisplacement, maxVelocity };
}

function stepNetCloth(cloth) {
  if (cloth.settled) return;
  const { positions, previous, rest, inverseMass, constraints } = cloth;
  for (let node = 0; node < cloth.count; node++) {
    if (inverseMass[node] === 0) continue;
    const offset = node * 3;
    for (let axis = 0; axis < 3; axis++) {
      const current = positions[offset + axis], velocity = (current - previous[offset + axis]) * .985;
      previous[offset + axis] = current;
      positions[offset + axis] = current + velocity + (rest[offset + axis] - current) * .03;
    }
  }
  for (let iteration = 0; iteration < NET_PHYSICS.iterations; iteration++) {
    for (let c = 0; c < constraints.a.length; c++) {
      const a = constraints.a[c], b = constraints.b[c], wa = inverseMass[a], wb = inverseMass[b], total = wa + wb;
      if (total === 0) continue;
      const ia = a * 3, ib = b * 3, dx = positions[ib] - positions[ia];
      const dy = positions[ib + 1] - positions[ia + 1], dz = positions[ib + 2] - positions[ia + 2];
      const distance = Math.hypot(dx, dy, dz);
      if (distance < 1e-9) continue;
      const correction = (distance - constraints.length[c]) / distance * constraints.stiffness[c];
      const ca = correction * wa / total, cb = correction * wb / total;
      positions[ia] += dx * ca; positions[ia + 1] += dy * ca; positions[ia + 2] += dz * ca;
      positions[ib] -= dx * cb; positions[ib + 1] -= dy * cb; positions[ib + 2] -= dz * cb;
    }
    pinAndLimit(cloth);
  }
  const motion = pinAndLimit(cloth);
  cloth.age += NET_PHYSICS.step; cloth.steps++;
  if (cloth.age - cloth.lastImpactAt > .35 && motion.maxDisplacement < .0015 && motion.maxVelocity < .01) cloth.quietSteps++;
  else cloth.quietSteps = 0;
  if (cloth.quietSteps >= 8 || cloth.age - cloth.lastImpactAt + 1e-9 >= NET_PHYSICS.duration) {
    const age = cloth.age, steps = cloth.steps;
    resetNetCloth(cloth); cloth.age = age; cloth.steps = steps;
  }
}

export function advanceNetCloth(cloth, age) {
  const targetSteps = Math.max(0, Math.floor(finite(age) / NET_PHYSICS.step + 1e-7));
  if (targetSteps < cloth.steps) throw new RangeError('net cloth cannot rewind without reset');
  while (!cloth.settled && cloth.steps < targetSteps) stepNetCloth(cloth);
  if (cloth.settled) { cloth.steps = targetSteps; cloth.age = targetSteps * NET_PHYSICS.step; }
  return cloth;
}

export function sampleNetWave(cloth, x, y, target = { x: 0, y: 0, z: 0 }) {
  target.x = 0; target.y = 0; target.z = 0;
  for (const wave of cloth?.waves || []) {
    const age = finite(cloth.age) - wave.at;
    if (!(age > 0) || age >= NET_PHYSICS.duration) continue;
    x = clamp(finite(x), -NET_PHYSICS.halfWidth, NET_PHYSICS.halfWidth);
    y = clamp(finite(y), NET_PHYSICS.bottom, NET_PHYSICS.top);
    const dx = x - wave.x, dy = y - wave.y;
    const arrival = Math.hypot(dx / WAVE_SPEED_X, dy / WAVE_SPEED_Y);
    const localAge = age - arrival;
    if (localAge < 0) continue;
    const u = (x + NET_PHYSICS.halfWidth) / (NET_PHYSICS.halfWidth * 2);
    const postPin = Math.sin(Math.PI * u) ** .72;
    const distance = Math.hypot(dx, dy * 1.7);
    const packetPhase = localAge / WAVE_PACKET_SECONDS;
    const packet = packetPhase <= 1 ? Math.sin(Math.PI * packetPhase) : 0;
    const wake = Math.sin(localAge * Math.PI * 13) * Math.exp(-5.2 * localAge);
    const local = Math.exp(-.5 * ((dx / .24) ** 2 + (dy / .15) ** 2))
      * Math.sin(Math.min(1, age / .055) * Math.PI / 2) * Math.exp(-4.3 * age);
    const decay = Math.exp(-1.45 * age - .12 * distance);
    const z = clamp(wave.direction * wave.amplitude * postPin * decay
      * (packet * .82 + wake * .27 + local * .42), -.082, .082);
    const radial = Math.hypot(dx, dy);
    const pull = Math.min(.016, Math.abs(z) * .19);
    if (radial > 1e-6) {
      target.x += -dx / radial * pull;
      target.y += -dy / radial * pull;
    }
    target.z += z;
  }
  return target;
}

export function sampleNetOffset(cloth, x, y, target = { x: 0, y: 0, z: 0 }) {
  const u = clamp((finite(x) + NET_PHYSICS.halfWidth) / (NET_PHYSICS.halfWidth * 2), 0, 1) * cloth.columns;
  const v = clamp((finite(y) - NET_PHYSICS.bottom) / (NET_PHYSICS.top - NET_PHYSICS.bottom), 0, 1) * cloth.rows;
  const column = Math.min(cloth.columns - 1, Math.floor(u)), row = Math.min(cloth.rows - 1, Math.floor(v));
  const tx = u - column, ty = v - row, stride = cloth.columns + 1;
  const nodes = [row * stride + column, row * stride + column + 1, (row + 1) * stride + column, (row + 1) * stride + column + 1];
  const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  target.x = 0; target.y = 0; target.z = 0;
  for (let i = 0; i < 4; i++) {
    const offset = nodes[i] * 3, weight = weights[i];
    target.x += (cloth.positions[offset] - cloth.rest[offset]) * weight;
    target.y += (cloth.positions[offset + 1] - cloth.rest[offset + 1]) * weight;
    target.z += (cloth.positions[offset + 2] - cloth.rest[offset + 2]) * weight;
  }
  const wave = sampleNetWave(cloth, x, y, {});
  target.x = clamp(target.x + wave.x, -.025, .025);
  target.y = clamp(target.y + wave.y, -.025, .025);
  target.z = clamp(target.z + wave.z, -.11, .11);
  return target;
}
