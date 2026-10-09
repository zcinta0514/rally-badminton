import { AnimationClip, BufferAttribute, DynamicDrawUsage, PropertyBinding } from 'three';

const requireValue = (ok, message) => { if (!ok) throw new Error(`RALLY morph stream: ${message}`); };
const preparedScenes = new WeakSet();

function packed(attribute, label) {
  requireValue(attribute?.isBufferAttribute && !attribute.isInterleavedBufferAttribute && attribute.itemSize === 3 && !attribute.normalized, `${label} must be a packed, unnormalized vec3 BufferAttribute`);
  const array = attribute.array;
  requireValue(array.length > 0 && array instanceof Float32Array, `${label} must have nonempty float32 storage`);
  for (const value of array) requireValue(Number.isFinite(value), `nonfinite ${label}`);
  return array;
}

/**
 * Call once immediately after GLTFLoader resolves, BEFORE renderer.compile/render.
 * const stream = prepare(gltf);
 * mixer.clipAction(stream.clip).play();
 * // On every seek/render (same local seconds used for the mixer):
 * mixer.setTime(t); stream.update(t); renderer.render(scene, camera);
 *
 * CPU retains every original target and its original interpolation. GPU receives
 * only one streamed position/normal surface plus the unchanged skeleton. This is
 * a preview transport; neither the GLB nor its authored motion is modified.
 */
export function prepare(model) {
  const scene = model.scene;
  requireValue(scene && model.animations?.length === 1, 'expected one scene and one merged clip');
  requireValue(!preparedScenes.has(scene), 'scene was already prepared');
  const sourceClip = model.animations[0];
  requireValue(Number.isFinite(sourceClip.duration) && sourceClip.duration > 0, 'invalid duration');
  const bodyRoot = scene.getObjectByName('SuperHero_Male');
  requireValue(bodyRoot, 'missing SuperHero_Male');
  const bodyMeshes = [];
  bodyRoot.traverse(object => { if (object.isMesh) bodyMeshes.push(object); });
  requireValue(bodyMeshes.length > 0, 'empty body');
  const bodySet = new Set(bodyMeshes);
  const tracksByObject = new Map(), retainedTracks = [];
  for (const track of sourceClip.tracks) {
    const binding = PropertyBinding.parseTrackName(track.name);
    const object = PropertyBinding.findNode(scene, binding.nodeName);
    if (binding.propertyName === 'morphTargetInfluences' && bodySet.has(object)) {
      requireValue(!tracksByObject.has(object), `multiple weight tracks for ${object.name}`);
      requireValue(binding.propertyIndex === undefined, `indexed weight track ${track.name} is unsupported`);
      tracksByObject.set(object, track);
    } else {
      retainedTracks.push(track);
    }
  }
  requireValue(tracksByObject.size === bodyMeshes.length, 'incomplete body weight-track coverage');
  const states = [], uniqueGeometries = new Set();
  for (const object of bodyMeshes) {
    const geometry = object.geometry, track = tracksByObject.get(object);
    requireValue(!uniqueGeometries.has(geometry), 'shared body geometry needs separate stream storage');
    uniqueGeometries.add(geometry);
    requireValue(!geometry.morphAttributes.color, 'color morphs must not be silently dropped');
    const positions = geometry.morphAttributes.position, normals = geometry.morphAttributes.normal;
    requireValue(positions?.length === 961 && normals?.length === 961, 'expected all 961 position AND normal targets');
    requireValue(track.getValueSize() === 961 && object.morphTargetInfluences?.length === 961, 'weight/target count mismatch');
    const basePosition = packed(geometry.attributes.position, 'base position');
    const baseNormal = packed(geometry.attributes.normal, 'base normal');
    requireValue(basePosition.length === baseNormal.length, 'base normal coverage mismatch');
    const positionArrays = positions.map((a, i) => packed(a, `position target ${i}`));
    const normalArrays = normals.map((a, i) => packed(a, `normal target ${i}`));
    requireValue([...positionArrays, ...normalArrays].every(a => a.length === basePosition.length), 'target vertex coverage mismatch');
    for (const value of track.times) requireValue(Number.isFinite(value), 'nonfinite track time');
    for (const value of track.values) requireValue(Number.isFinite(value), 'nonfinite track weight');
    // PropertyMixer uses a Float64Array result buffer. Preserve that precision.
    const weights = new Float64Array(961), interpolant = track.createInterpolant(weights);
    const positionBuffer = new BufferAttribute(basePosition.slice(), 3).setUsage(DynamicDrawUsage);
    const normalBuffer = new BufferAttribute(baseNormal.slice(), 3).setUsage(DynamicDrawUsage);
    const state = { object, geometry, track, interpolant, weights, basePosition, baseNormal, positionArrays, normalArrays, positionBuffer, normalBuffer, relative: geometry.morphTargetsRelative, lastActiveCount: 0, maxActiveCount: 0 };
    states.push(state);
    geometry.setAttribute('position', positionBuffer);
    geometry.setAttribute('normal', normalBuffer);
    // Clearing BEFORE first render prevents WebGLMorphtargets from constructing a
    // 961-layer position+normal texture or compiling a 961-target shader loop.
    geometry.morphAttributes = {};
    object.morphTargetInfluences = [];
    object.morphTargetDictionary = {};
    object.frustumCulled = false; // original bound may exclude an animated surface
  }
  const clip = new AnimationClip(sourceClip.name, sourceClip.duration, retainedTracks, sourceClip.blendMode);
  const stats = { mode: 'cpu-position-normal-stream-with-standard-skinning', durationSeconds: sourceClip.duration, bodyMeshes: states.length, retainedTargetCount: 961, gpuMorphTargetCount: 0, retainedCpuTargetBytes: states.reduce((n,s)=>n+s.positionArrays.reduce((a,v)=>a+v.byteLength,0)+s.normalArrays.reduce((a,v)=>a+v.byteLength,0),0), streamedBufferBytes: states.reduce((n,s)=>n+s.positionBuffer.array.byteLength+s.normalBuffer.array.byteLength,0), removedWeightTracks: tracksByObject.size, retainedBoneAndPropTracks: retainedTracks.length, updateCount: 0, maxActiveCount: 0, lastTime: null };
  function update(time) {
    requireValue(Number.isFinite(time) && time >= 0 && time <= clip.duration, `time outside [0, ${clip.duration}]: ${time}`);
    for (const state of states) {
      requireValue(Object.keys(state.geometry.morphAttributes).length === 0, 'GPU morph attributes were reintroduced');
      state.interpolant.evaluate(time);
      const active = []; let sum = 0;
      for (let index = 0; index < state.weights.length; index++) {
        const weight = state.weights[index];
        requireValue(Number.isFinite(weight) && weight >= 0 && weight <= 1, `invalid weight ${index}: ${weight}`);
        sum += weight;
        if (weight !== 0) active.push([index, weight]); // no epsilon pruning
      }
      requireValue(active.length >= 1 && active.length <= 2, `expected one or two active samples, got ${active.length}`);
      requireValue(Math.abs(sum - 1) < 1e-9, `sample weights do not sum to one: ${sum}`);
      state.lastActiveCount = active.length; state.maxActiveCount = Math.max(state.maxActiveCount, active.length);
      stats.maxActiveCount = Math.max(stats.maxActiveCount, active.length);
      const baseFactor = state.relative ? 1 : 1 - sum;
      const pOut = state.positionBuffer.array, nOut = state.normalBuffer.array;
      for (let component = 0; component < pOut.length; component++) {
        let p = state.basePosition[component] * baseFactor, n = state.baseNormal[component] * baseFactor;
        for (const [index, weight] of active) {
          p += state.positionArrays[index][component] * weight;
          n += state.normalArrays[index][component] * weight;
        }
        requireValue(Number.isFinite(p) && Number.isFinite(n), 'nonfinite streamed surface');
        pOut[component] = p; nOut[component] = n;
      }
      // Do not normalize here: Three's normal shader performs normalization after
      // morphing and skinning; changing that order changes the result.
      state.positionBuffer.needsUpdate = true;
      state.normalBuffer.needsUpdate = true;
    }
    stats.updateCount++; stats.lastTime = time;
    return stats;
  }
  preparedScenes.add(scene);
  return { clip, update, stats };
}
