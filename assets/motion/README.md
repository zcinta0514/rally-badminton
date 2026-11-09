# V4 expert motion references

`v4-expert-clips.json` contains six short body-motion excerpts from the public
MultiSenseBadminton dataset, participant **Sub11**, annotated **Expert** and
**Good** striking sound: forehand clear strokes 133/140/151 and backhand drive 1/2/4.

- Dataset article: https://figshare.com/articles/dataset/Data_Archive_Part_2/25383001
- Collection: https://doi.org/10.6084/m9.figshare.c.6725706.v1
- Authors' repository: https://github.com/dailyminiii/MultiSenseBadminton
- Data license: **CC0 1.0**, verified from the article API on 2026-09-20:
  https://api.figshare.com/v2/articles/25383001
- License text: https://creativecommons.org/publicdomain/zero/1.0/

The repository's MIT code license is separate from the dataset license. No
upstream Python code, neural weights, personal survey answers, or video frames
are included here. Original downloads and their CRC32/SHA256 manifests stay in
`artifacts/motion-reference/multisense/`.

## Reproduction

1. `python3 scripts/fetch-multisense-motion.py --subject Sub11 --kind skeleton`
2. Download the collection's CC0 `Documentations.zip` (file 44974654) to
   `artifacts/motion-reference/multisense/documentations.zip`.
3. Run `scripts/prepare-multisense-clips.py` using Python with numpy, scipy,
   and h5py. It writes the review extraction under artifacts.
4. The reviewed selection is stored here, and its matching marker metadata
   is in `src/v4-capture-metadata.js`. Build with `build-v4-court-rig.py`.

To review the broader source pool before changing that selection, run the
extractor with `--all`, run `scripts/export-v4-leg-proxy.py` with Blender on
the current rest rig, then run `scripts/screen-multisense-clips.py` with the
same Python environment. The screen measures the current character's
retargeted lower-leg spacing, shin tilt, pelvis travel and hand-speed changes.
It does not replace deformed-surface checks or normal-speed review.

Positions use metres and Blender coordinates: X right, Y forward, Z up.
Original timestamps are retained. Resampling is 60 Hz with a five-sample,
second-order Savitzky-Golay filter. Source bone lengths are not applied to the
character; retargeting transfers segment directions and stable hinge planes.

The `contactPhase` is a **hand-speed peak estimate**, not a sensor measurement
of racket/shuttle contact. The runtime aligns it to the authoritative game
contact and solves actual racket position. Fingers, racket grip and foot-ground
adaptation are authored. Only clear and backhand drive have captured source
data; other motion families must not be described as motion capture.

Axial shoulder rotation is inferred rather than copied from sensor orientation.
The offline retargeter searches a bounded, temporally continuous roll path
against the character's actual axillary skin, preserving shoulder, elbow and
wrist targets, then smooths the path before local contact correctives are baked.
Deformation-helper rotations use the same twist fractions offline and in the
Three.js runtime. This does not certify arbitrary runtime blends; those are
checked separately on actual Three.js deformed geometry.

The selection was screened from 304 annotated Expert/Good strokes. The initial
annotation-order clear samples were replaced after character-proportion checks;
see `v4-clip-selection.json` for retained and rejected screening measurements.
Screening is not final acceptance: each retained clip still passes through the
same skin, garment, actual-racket and runtime-surface checks.
