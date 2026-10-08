# Complete character/racket export

This validates encoding only. The test fixture does not approve grip, body collisions,
movement, floor support, professional fidelity, or the reconstruction as a whole.

Run from the project root with a **new output directory** and check both exit codes:

```sh
artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python artifacts/rig-rebuild/20261007/integration/export-tools/export.py -- --input path/to/final.blend --output path/to/export
node artifacts/rig-rebuild/20261007/integration/export-tools/check-export.mjs path/to/export
```

Input contract: `SuperHero_Male`, `RALLY_AnatomicalRig_Rebuilt`, the 8 runtime meshes
with `rally_asset_role=racket`, and the complete descendants of `Racket_GripCenter`
attached to `DEF_hand_r`; 120 fps and frames 0 through 480.

The exporter records every original half-frame (961 poses at 240 Hz). Body bind and
world vertices use float32 binary. Racket geometry is stored once per mesh; all rigid
world matrices and marker matrices are recorded for every sample. A changing racket
vertex array is rejected. There is no large per-vertex JSON dump.

Correctives are consolidated into **961 independent half-frame surfaces**, including
corrections that are zero at both neighbouring integer frames. All original integer
and half frames must remain within 2 micrometres. The export COPY is retimed to 240 fps and
frames 0 through 960 for integer-step glTF sampling, retaining exactly 4 seconds.
The source file is not rewritten. Therefore downstream 120 fps motion audits should
operate on the input, not assume that `export.blend` uses the original frame numbers.

Three.js checks all 961 samples, every vertex of all 9 meshes (including all UV and
material splits), all 10 current marker matrices, one nonempty merged animation,
finite data, 4-second duration, and hand-bone ancestry. The original 10 micrometre
limit is unchanged. Source, tool, GLB and fixture binary hashes are checked.

## Independent encoding self-test, 2026-10-07

`test-input.blend` combines the prior pressure-final body with the new runtime racket
using its initial proposed mount. This fixture is intentionally not a motion/grip test.

- `test-export/`: rejected. 120 Hz export matched integers but differed by up to
  0.235667 mm at half-frames; markers differed by up to 0.490094 mm.
- `test-export-240/`: passed all 961 poses, 9 meshes, and 10 markers. Surface error
  maximum 9.804691847 micrometres; marker maximum 1.775474027 micrometres.
  Corrective consolidation error was zero.
- `negative-checks.json`: a 960-sample manifest and a missing-racket manifest were
  both rejected. They cannot produce vacuous coverage passes.

The positive fixture has limited headroom under the 10 micrometre threshold. A new
input must run and pass the complete exporter/checker again; this result cannot be
copied as final-asset acceptance.

## Independent half-frame corrective regression

`make-test-half-frame.py` creates `test-half-input.blend` with isolated 3 mm encoding
signals at source frames 164.5, 169.5, 170.5 and 180.5. Each correction has value 1
only at its half-frame and value 0 at both neighbouring integers. These are encoding
sentinels, not proposed anatomical edits. `test-half-export-final` is the regression
output from the current tool hashes. The checker additionally asserts 961 corrective
targets in each exported body primitive, so integer-only compression cannot pass.

Current regression passed: consolidation maximum 0.510134 micrometres, exported
surface maximum 9.801505 micrometres, marker maximum 1.775474 micrometres. The independent
half-frame keys therefore survive both consolidation and runtime loading. A manifest
claiming only 481 surfaces is explicitly rejected (`negative-half-frame-check.json`).

## Preserve small positive skin weights

The real `final-skin-17` input exposed a further exporter defect: Blender 5.2's
`PrimitiveCreator.__get_bone_data` discards weights at or below `0.0001`, then the
remaining weights are renormalized. Source vertex 847 had a real
`DEF_thigh_l_twist_2` weight of `0.00008902428089641035`. Dropping it produced a
left-knee error above the unchanged 10 micrometre gate. Sampling exactly at float32
key times did not solve this; the skin matrices differed by less than a micrometre.

The exporter now overrides that one method **inside the current Python process** to
keep every positive joint weight. It refuses vertices with more than four positive
deform influences. It does not edit the Blender installation, source file, source
weights, motion, bone lengths, fixture truth, or checker thresholds. No geometry
compensation is applied. `skin-encoding.json` records the old and effective filtering
thresholds, each preserved small weight, and the original installed module's hash.

`source17-keep-weights` passed the full 961-pose check, all 9 meshes and 10 markers:

- 6 vertices retained 6 previously discarded positive weights.
- Maximum surface difference: **5.047955 micrometres**, previously **10.925896**.
- Maximum marker difference: **2.418002 micrometres**.

This is an encoding regression using source17, not motion/collision approval and not
a substitute for exporting and checking the eventual final source again.

## Diagnostic body appearance

The export copy now uses the same neutral PBR body material as the preview. This removes unused inherited body textures from the diagnostic asset and avoids a DOM-only texture loader in the Node geometry checker. Source authoring material and all eight racket-part materials remain unchanged. The failed first production check is preserved in integration/export-failed-texture; it failed before geometry validation and is not a passing result.
