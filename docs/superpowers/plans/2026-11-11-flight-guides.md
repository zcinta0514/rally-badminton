# Flight guides implementation plan

Goal: playable incoming cyan and held-shot pink dashed arcs, preview first.
Base: initially e8b74bb; integrated verified main 12f1f721 (audio 1.19.0) before merge. Final flight release is 1.20.0.
Architecture: pure presentation guidance samples shared flight physics. One reusable Three.js line-segment buffer renders the chosen guide. No authority or network protocol change.

- [x] Add behavioral tests: opponent-only incoming, both sides, held serve, reachable future contact, release, pause/reset and phantom suppression.
- [x] Add src/flight-guide.js with trajectory selection and sampled intention arc. Export existing liveFlightPoint for net-aware sampling; never change physics.
- [x] Add src/flight-guide-view.js using fixed buffers, distance-spaced dashes and fading tail. Integrate into CourtView; clearing on point/side changes and lobby/entrance, freezing on pause.
- [x] Run relevant tests, full suite and build; verify mobile 844x390 and 568x320 with actual held/drag/release input plus deterministic incoming fixtures. Save screenshots and report.
- [x] Commit, open Draft PR when remote transport permits, open verified local preview in Codex. Merge waits for user acceptance.

Design: cyan previews up to .65 seconds ahead; pink previews from current eligible contact or reachable intercept to the intended target using shared launch duration and gravity. Pink takes priority only with a credible touch point. Line ends soften; aim responds immediately. Outgoing real ball and scoring clear guides. Phantom shots suppress prediction until ghosts disappear. Risk is represented by fading and the existing target risk ring, never artificial noise. Actual drift remains authoritative.
