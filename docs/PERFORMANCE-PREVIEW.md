# 1.17.1 rendering preview

Base: origin/main b51e819 (1.17.0), fetched 2026-11-11. Isolated branch `codex/soft-light-performance`; no merge or production release.

## Changes

- Maximum DPR 1.6 → 2, preserving antialiasing and material detail. Adaptive tiers reduce shadow maps before pixels; persistent median or P95 overload lowers quality, 12 healthy seconds restore one tier. Sustained observed 120/144 Hz cadence tightens the budget; requestAnimationFrame remains uncapped.
- Local 60 Hz simulation has display-rate interpolation for players and shuttle. Contact, score, phase and reset discontinuities snap to authority. Rules and network playback remain unchanged. Interpolation adds at most one physics step of visual latency (16.7 ms).
- Lobby shadow updates at most 30 times per second for the planted character; camera and character render every frame. Both scenes invalidate material variants when shadows toggle and dispose old maps when size changes.
- Softer key/top lights and emitters, exposure 1.0, slightly raised match ambient fill. Existing court palettes, entrance and reduced-motion behavior retained.

## Browser evidence

Windows Chrome, 844×390 mobile/touch emulation, DPR 2 requested; not physical iPhone or 120 Hz hardware. `scripts/measure-render.mjs` saves raw samples and screenshots under `artifacts/performance/`. CPU submission is not GPU execution time. Short samples do not establish sustained thermal performance.

| Sample | Lobby median / P95 | Match median / P95 | Actual DPR / shadow map |
| --- | --- | --- | --- |
| Original | 16.7 / 16.8 ms | 16.7 / 16.8 ms | 1.6 / 2048 |
| Final adaptive | 16.7 / 16.9 ms | 16.7 / 16.8 ms | 1.6 / 1024 |

Both runs ~59.9 FPS. Lobby CPU submission sampled 3.1 → 2.3 ms; a cached-shadow frame uses 72 draws instead of 108. Match CPU submission 3.3 → 3.6 ms, so no measured match CPU speedup is claimed. An initial 2× trial had P95 33.4 ms; the final tail-aware policy retained stable delivery by lowering quality. The 2× ceiling is available when hardware sustains it, not a guarantee that every device can run it.

`verify-match-entrance.mjs` passed: 844×390 entrance freezes rule time, charging/release starts a real rally, 667×375 survives portrait rotation and return, reduced motion skips entrance, no uncaught errors. Unit coverage includes 120/144 Hz intermediate positions, authority isolation, discontinuities, recurring drops and shadow resource transitions.

## Acceptance

Open the branch preview, try both ordinary AI and hell mode, rotate the phone, and compare the court, shirt highlights and ceiling lights. Check the performance readout after 20 seconds of play. Physical phone high-refresh, thermal behavior and subjective light comfort remain user acceptance items.

## Full checks

- Final `npm test`: 806 tests, 803 pass, 3 fail. Failures are two Windows symlink EPERM cases plus their parent test in project-handoff; the same failures reproduce in the unchanged 1.17.0 worktree. No game test failures.
- `npm run build`: successful, asset build `6e20ccb1c0071f71`.
- Preview server: this worktree, port 3341. Local preview only; not the production URL.
