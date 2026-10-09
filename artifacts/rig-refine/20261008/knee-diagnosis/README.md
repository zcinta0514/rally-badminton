# Deep-knee independent review — 2026-10-08

Read-only review of `combined-02`, `lunge/surface-05` (43% posterior compression) and `lunge/surface-06` (32%). No main candidate, armature, support contract or source script was changed.

## Result

Prefer **surface-06 / 32%** for the subsequent full-clip audit. At the four difficult authoring frames 170, 174, 178 and 182, an independent BVH query found zero nonadjacent lower-body triangle intersections in both 05 and 06. The original combined source has intersections. This is four-frame coverage only; it does not establish continuous or whole-clip passage.

At frame 174, six close views of each variant were rendered. The reviewer actually inspected left side/back/three-quarter and right side/three-quarter images, including side-by-side mental comparison to the intersecting source and 43% variant. Surface-05 opens a visibly triangular gap behind the left knee. Surface-06 retains a narrow contact crease with appreciably more posterior thigh and calf fullness. No whole-calf sheet-like collapse or reversed knee was visible in these views. Low-poly ridges, concentrated creases and imperfect anatomical detail remain; this is not professional-motion or skin-naturalness acceptance.

The armature bend angles at frame 174 are unchanged across all variants: left 136.93 degrees and right 124.77 degrees, expressed as flexion from a straight limb. Source leg/foot poses were not altered by this review.

## Why the earlier solver stalled

The lower-body agent identified an inconsistent constraint domain: posterior thigh/calf contact extended to approximately 32 cm around the knee, but earlier signed-area and edge protections covered only 16 cm. Moving the broader contact tissue while protecting the smaller region left thin folded patches outside the protected area. Aligning those domains allowed the original edge thresholds and unchanged 12 mm local relaxation cap to pass the four difficult frames. Independent measurements here are consistent with that diagnosis; no evidence was found that a support-foot change or a larger displacement cap was required.

The contact loop also calculates the nearest projected point on a target triangle without using that projection to gate the plane response. It consequently acts on the target plane beyond the actual triangle. This remains a code-quality issue, not an established remaining failure in surface-06. Do not silently rewrite the validated solver during finalization; if investigated later, compare both surface fidelity and exact contact/edge outcomes.

## Measurements and scope

`diagnosis.json` contains fresh evaluated mesh intersection counts and 12 local rest-band scatter measurements per sampled frame. Singular-value products can compare transverse tissue fullness but are **not** actual cross-sectional areas or conserved soft-tissue volumes. At frame 174, the worst two-principal-axis scatter-product retention in the left/right sampled bands is approximately 75.4% for 32% compression versus 67.5% for 43%; the source reference itself intersects, so those percentages are only comparative shape diagnostics.

`inspect.py` reproduces this read-only evaluation and the 18 frame-174 close renders. BVH counts exclude adjacent triangles and are restricted to pairs whose rest vertices are below 0.85 m. Hip/torso are deliberately outside this diagnosis. All scripts and outputs live under this directory.

Next required work remains the lower-body agent's 240 Hz full-span audit, temporal interpolation audit, support checks and final source-to-export parity. Four isolated key-frame successes cannot replace them.
