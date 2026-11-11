# Brightness and rubber court preview — 1.18.0

Base: verified remote main `3d451005ce6fbd1bae8a0aac7214a5af7b979167` (1.17.1). Independent `codex/brightness-court-texture` branch. Character experiments in another worktree are untouched.

## Behavior

Settings now starts with a lighting brightness slider, 80–180%, default 125%. It changes scene exposure immediately in both the lobby and matches, preserves the existing soft light ratios, and saves alongside audio and court palette preferences. Old saves receive the new default without losing their volumes or palette. Restore defaults resets brightness too. UI text is not brightened by the scene exposure. No new light, shadow pass or postprocessing overlay is added.

The shared court material uses deterministic 256×256 seamless grain at two scales, subtle recessed pores, and separate red height/green roughness data. High roughness and zero metalness retain rubber rather than glossy plastic. Mipmaps and anisotropic filtering reduce distant shimmer. Existing palette colors remain the material tint. Two maps per material remain; base texture storage grows from 128² to 256², about 512 KiB total before mipmaps per court material, with no new geometry or draw batches.

## Verification

- New feature tests failed on the old behavior, then passed for defaults, old-save migration, invalid values, bounds, persistence, shared-renderer exposure restoration and deterministic matte texture channels.
- Local full suite: 809 tests, 806 pass. Three failures are the known Windows symlink EPERM cases and their parent test; the earlier unchanged worktree reproduced them.
- Relevant final release/update checks: 31 passed. Build `c2153e18416390a0`.
- `scripts/verify-lighting.mjs`: 844×390, 667×375, 568×320 and 390×844. Checks actual slider reachability, min/max, reload persistence, reset, matching scene exposure, horizontal overflow and charging/releasing a real serve. Raw evidence and images are under `artifacts/lighting/`.
- Windows Chrome mobile/touch emulation, not physical phone hardware. Default 125% sample: ~59.9 FPS, P95 16.8 ms in lobby and match; actual adaptive DPR 1.6 and 1024 shadow map. CPU submission sampled 2.1 ms lobby / 3.4 ms match. This does not establish 120 Hz or thermal performance on phones.

## Preview

Local branch server: `http://127.0.0.1:3342/`. Open Settings, drag Lighting brightness, compare the floor and shirt, then enter a match. Review the default 125% and high 180% setting on the intended phone. This branch is for preview, not authorized for merge by the previous PR's approval.
