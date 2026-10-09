#!/bin/sh
# Run from repository root. Use a NEW output directory, never the frozen final.
set -eu
RALLY_TOOLS=artifacts/rig-refine/20261008
RALLY_PREVIOUS=artifacts/rig-rebuild/20261007/integration
RALLY_BLENDER=${RALLY_BLENDER:-artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender}
RALLY_OUTPUT=${1:?Usage: rebuild-candidate.sh NEW_OUTPUT_DIRECTORY}
if [ -e "$RALLY_OUTPUT" ]; then
  echo "Output already exists; choose a new directory: $RALLY_OUTPUT" >&2
  exit 1
fi
mkdir -p "$RALLY_OUTPUT"
run_blender() { "$RALLY_BLENDER" --background --python-exit-code 1 --python "$@"; }
run_blender "$RALLY_TOOLS/torso/apply.py" -- "$RALLY_PREVIOUS/final/rebuild.blend" "$RALLY_OUTPUT/upper"
run_blender "$RALLY_TOOLS/torso/repair-surface.py" -- "$RALLY_OUTPUT/upper/rebuild.blend" "$RALLY_OUTPUT/upper-surface"
run_blender "$RALLY_TOOLS/lunge/apply.py" -- --input "$RALLY_OUTPUT/upper-surface/rebuild.blend" --output "$RALLY_OUTPUT/combined"
run_blender "$RALLY_TOOLS/lunge/solve-lower.py" -- "$RALLY_OUTPUT/combined/rebuild.blend" "$RALLY_OUTPUT/lower"
run_blender "$RALLY_TOOLS/torso/repair-hips.py" -- "$RALLY_OUTPUT/combined/rebuild.blend" "$RALLY_OUTPUT/hips-base" .010
# The quarter-frame probe supplies residual geometry only. It is NOT exported.
run_blender "$RALLY_TOOLS/torso/repair-hips.py" -- "$RALLY_OUTPUT/hips-base/rebuild.blend" "$RALLY_OUTPUT/hips-probe" .010 198.75,199.25
run_blender "$RALLY_TOOLS/torso/half-grid-envelope.py" -- "$RALLY_OUTPUT/hips-base/rebuild.blend" "$RALLY_OUTPUT/hips-probe/rebuild.blend" "$RALLY_OUTPUT/hips"
run_blender "$RALLY_TOOLS/merge-residuals.py" -- "$RALLY_OUTPUT/combined/rebuild.blend" "$RALLY_OUTPUT/final" "$RALLY_OUTPUT/lower/rebuild.blend" Oct08Lower_ "$RALLY_OUTPUT/hips/rebuild.blend" Oct08HipResidual_
for RALLY_HZ in 240 480; do
  run_blender "$RALLY_TOOLS/audit-final.py" -- --input "$RALLY_OUTPUT/final/rebuild.blend" --output "$RALLY_OUTPUT/final" --racket-manifest "$RALLY_PREVIOUS/final/racket-manifest.json" --support-contract "$RALLY_PREVIOUS/final/source-contact-contract.json" --sample-hz "$RALLY_HZ"
done
run_blender "$RALLY_PREVIOUS/check-final-fingers.py" -- "$RALLY_OUTPUT/final"
run_blender "$RALLY_PREVIOUS/export-tools/export.py" -- --input "$RALLY_OUTPUT/final/rebuild.blend" --output "$RALLY_OUTPUT/final-export"
node "$RALLY_PREVIOUS/export-tools/check-export.mjs" "$RALLY_OUTPUT/final-export"
node "$RALLY_TOOLS/check-runtime.mjs" "$RALLY_OUTPUT/final-export"
