#!/bin/sh
# From repository root; create a NEW directory. Does not switch a preview or publish.
set -eu
RALLY_MOTION=artifacts/rig-tempo/20261009/motion
RALLY_FROZEN=artifacts/rig-refine/20261008/final/rebuild.blend
RALLY_AUDIT=artifacts/rig-refine/20261008/audit-final.py
RALLY_OLD=artifacts/rig-rebuild/20261007/integration
RALLY_BLENDER=${RALLY_BLENDER:-artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender}
RALLY_OUTPUT=${1:?Usage: rebuild-motion.sh NEW_OUTPUT_DIRECTORY}
if [ -e "$RALLY_OUTPUT" ]; then
  echo "Output already exists; select a new directory: $RALLY_OUTPUT" >&2
  exit 1
fi
mkdir -p "$RALLY_OUTPUT"
run_blender() { "$RALLY_BLENDER" --background --python-exit-code 1 --python "$@"; }
run_blender "$RALLY_MOTION/retime.py" -- --input "$RALLY_FROZEN" --output "$RALLY_OUTPUT/retime" --advance 1.6
run_blender "$RALLY_MOTION/repair-ankle.py" -- "$RALLY_OUTPUT/retime/rebuild.blend" "$RALLY_OUTPUT/ankle"
# Frozen inferred control landmarks are part of this artifact, not regenerated
# from a claim of measured 3D. Optional refit scripts are documented separately.
run_blender "$RALLY_MOTION/apply-start-relative.py" -- "$RALLY_OUTPUT/ankle/rebuild.blend" "$RALLY_MOTION/rear-leg-relative-fit-02.json" "$RALLY_OUTPUT/start"
run_blender "$RALLY_MOTION/rebake-left-leg-full-weights.py" -- "$RALLY_OUTPUT/start/rebuild.blend" "$RALLY_OUTPUT/volume"
run_blender "$RALLY_MOTION/repair-start-leg.py" -- "$RALLY_OUTPUT/volume/rebuild.blend" "$RALLY_OUTPUT/surface"
run_blender "$RALLY_MOTION/contact.py" -- --input "$RALLY_OUTPUT/surface/rebuild.blend" --output "$RALLY_OUTPUT/final" --impact-rate-scale .30
cp "$RALLY_OLD/final/source-contact-contract.json" "$RALLY_OUTPUT/final/source-contact-contract.json"
cp "$RALLY_OLD/final/racket-manifest.json" "$RALLY_OUTPUT/final/racket-manifest.json"
for RALLY_HZ in 240 480; do
  run_blender "$RALLY_AUDIT" -- --input "$RALLY_OUTPUT/final/rebuild.blend" --output "$RALLY_OUTPUT/final" --racket-manifest "$RALLY_OUTPUT/final/racket-manifest.json" --support-contract "$RALLY_OUTPUT/final/source-contact-contract.json" --sample-hz "$RALLY_HZ"
done
run_blender "$RALLY_OLD/check-final-fingers.py" -- "$RALLY_OUTPUT/final"
run_blender "$RALLY_MOTION/check-preservation.py" -- "$RALLY_OUTPUT/ankle/rebuild.blend" "$RALLY_OUTPUT/final/rebuild.blend" "$RALLY_OUTPUT/final/preservation.json"
