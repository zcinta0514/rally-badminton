# Tournament lobby implementation plan

> **For agentic workers:** Use subagent-driven-development for the venue module and independent review; the primary agent integrates the menu and verifies the real browser.

**Goal:** Build the user's approved B concept as an interactive home-screen sample: dark indoor badminton venue, illuminated court, sideline waiting athlete, restrained Chinese navigation.

**Architecture:** A dedicated TournamentLobby owns a lightweight presentation scene but shares CourtView's WebGL renderer and existing athlete asset pipeline. Gameplay retains its current simulation and camera. A menu-only stylesheet and the existing main navigation controller provide a two-level solo entry, preserve existing modes and controls, and respect reduced motion. No generated concept image is used as the live scene.

**Tech Stack:** Three.js 0.185.1, native HTML/CSS/ES modules, node:test, Playwright browser QA.

## Approved design and scope

- B selected by user on 2026-11-11. Dark charcoal/green walls, matte green floor, quiet neutral overhead light, dim but readable crowd, contrasting ivory navigation with restrained lime selection.
- Desktop and landscape phone are first-class. Main actions are 单人对战 and 好友对战; 普通人机 and 地狱挑战 are reachable from the solo selector. Preserve existing settings, rules, community, guide and available leaderboard entries.
- Current athlete is a temporary integration asset. The independent character project is not overwritten; do not claim concept-character fidelity.
- One functional lobby with subtle idle motion, opening camera ease and brief match reveal; no new rules, network protocols, purchases or production deployment.
- A readable screen overlay is intentional; UI is not a 3D billboard.

## Tasks

- [x] Verify remote main and existing worktrees. Baseline is 8164ed8 (1.16.6); source checkout has the same tree. Character worktree contains ongoing unrelated work.
- [x] Baseline node tests: 778/781; three Windows symlink EPERM failures recorded.
- [x] Implement src/tournament-lobby.js and tests/tournament-lobby.test.js. Public API: `new TournamentLobby({loadAthlete=true}={})`, `render(renderer,dt,width,height,{reducedMotion=false}={})`, `setCourtPalette(name)`, `dispose()`. Geometry/material tests must run without WebGL; async asset completion must not leak after disposal. Keep frame scratch objects reusable.
- [x] Integrate in src/view.js: create once, route menu render into lobby, propagate palette and disposal. Stop simulating demonstration matches while in menu/waiting in src/main.js. Preserve gameplay rendering and camera behavior.
- [x] Extend existing openEntry in src/main.js rather than duplicate the controller. Add behavior coverage to tests/connection-recovery.test.js for home/solo/ai/hell/friends routing and back behavior. Use src/ui-feedback.js for presentation-only transitions. Add scoped src/ui-tournament.css after existing styles. Keep menu IDs consumed by existing code; use entry stages instead of cloning gameplay handlers.
- [x] Update index.html brand and menu. Main actions at least 44px touch targets, readable at 844x390 and 667x375; short screens scroll only setup content. Check 390x844 portrait fallback. Keyboard-visible focus and prefers-reduced-motion required.
- [x] Browser QA script scripts/verify-tournament-lobby.mjs captures 1440x900, 844x390, 667x375, portrait, AI setup, challenge setup and actual match. Assert visible elements in viewport, no horizontal overflow, all routes functional, pause/return works, source build ID matches, no uncaught page errors. Document software-rendered browser results separately from device performance.
- [x] Run node tests and production build, independent spec review then code-quality review. Fix findings. Capture final screenshots from restarted server snapshot.
- [x] Set next feature version 1.17.0 consistently, update release notes/docs, commit, create Draft PR, open actual local sample in Codex. Request user visual acceptance before any merge; no production deployment in this task.

## Verification commands

```powershell
$env:TEMP=(Resolve-Path artifacts/tmp).Path
$env:TMP=$env:TEMP
node --test tests/tournament-lobby.test.js tests/connection-recovery.test.js
npm test
npm run build
node scripts/verify-tournament-lobby.mjs
```

## Acceptance

The scene is real Three.js, not a raster backdrop. Arena silhouette and materials are differentiated; foreground feet/bench contact is grounded. Main choices read clearly over the background. Solo, challenge and friend preparation remain accessible. Returning from a match restores the lobby. Tests/build and actual phone-sized browser checks are recorded honestly. Version and preview source are verified before presenting.

## Result

Draft PR #33: https://github.com/zcinta0514/rally-badminton/pull/33 . Local preview http://127.0.0.1:3320/ serves verified build 6e34e48c9c831166. Spec and code reviews passed; user visual acceptance remains pending. No merge or production deployment.
