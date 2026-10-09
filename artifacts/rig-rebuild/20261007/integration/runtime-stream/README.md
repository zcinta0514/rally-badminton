# Full-resolution CPU morph streaming for the diagnostic preview

This transport preserves the original GLB and all 961 position/normal targets in CPU
memory. It prevents Three.js from allocating a 961-layer morph texture and compiling
the corresponding shader loop. Every render uploads one current position buffer and
one current normal buffer; the original skeleton, skinning shader and racket remain.

Call `prepare` immediately after GLTFLoader, **before the first render or compile**.
The browser must map bare `three` to the same Three.js instance used by the viewer.

```js
import { prepare } from './morph-stream.mjs';

const stream = prepare(gltf);
const mixer = new THREE.AnimationMixer(gltf.scene);
const action = mixer.clipAction(stream.clip);
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.play();

function sample(t) { // 0 <= t <= 4, the same local seconds for both paths
  mixer.setTime(t);
  stream.update(t);
  renderer.render(scene, camera);
}
```

`prepare(gltf)` returns `{ clip, update(t), stats }`. `clip` removes only the body's
morph-weight track. Its 483 bone/prop tracks are retained as-is. `update(t)` evaluates
the original weight interpolant in float64, computes every original relative position
and normal delta, and rounds only when writing the standard float32 vertex buffers.
Normals remain unnormalized until Three's standard shader performs skinning and normal
transforms. The method does not normalize normals early or silently drop tiny weights.

Finiteness, complete normal coverage, all 961 targets, one/two nonzero weights, unit
weight sum, and time range are enforced. An unexpected third nonzero target produces
an error instead of silently dropping a corrective. This is deliberately scoped to
the fully sampled diagnostic clip, not a generic multi-layer animation blend system.

## Validation, 2026-10-07

```sh
node artifacts/rig-rebuild/20261007/integration/runtime-stream/check-runtime.mjs artifacts/rig-rebuild/20261007/integration/final-export
node artifacts/rig-rebuild/20261007/integration/runtime-stream/test-contract.mjs
```

`runtime-parity.json` records source/GLB/runtime hashes and all 961 half-frame poses,
all body vertices/UV splits, all 8 racket meshes, and all 10 marker transforms. The
original fixture remains unchanged and the same 10 micrometre threshold applies.

- Maximum fixture surface difference: **5.047952 micrometres**.
- Maximum marker difference: **2.418002 micrometres**.
- Maximum difference from original `THREE.SkinnedMesh.getVertexPosition` across all
  body vertices and all 961 poses: **0.021662 micrometres**.
- Maximum morph-normal component difference: **2.98023224e-8**.
- Retained CPU target storage: **167,928,984 bytes**.
- Streamed position + normal buffers: **174,744 bytes**; GPU morph target count: **0**.

These are CPU/runtime encoding checks. They do not assert browser frame rate, GPU
stability, photographic fidelity, or visual acceptance. The browser must be reopened
with this module before those claims can be checked.
