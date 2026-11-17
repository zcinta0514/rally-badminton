# Home Server Implementation Plan

> Execute in this session with subagent-driven-development for the isolated room/UI task; root owns host lifecycle and integration.

**Goal:** Run the current game on this PC behind an HTTPS endpoint, ready for friend invitation testing and a future domain.

**Architecture:** Existing Node room authority on loopback, outbound temporary tunnel, Windows supervisor and isolated installed snapshot. Preserve existing public sites.

**Tech Stack:** Node 24+, ws, PowerShell, cloudflared, Playwright.

- [x] Fetch and verify latest baseline and all worktrees. Create isolated branch. Baseline `npm test`: 868 pass.
- [ ] Agent: test and implement two-player server compatibility and configurable room/client admission limits. Preserve peer mode doubles.
- [ ] Root: pass limits through createServer and environment; reject invalid limits before listening. Verify origin and capacity behavior with integration tests.
- [ ] Root: implement `scripts/home-server.ps1` actions Start/Run/Stop/Status. Supervisor binds port 3210 to loopback, uses port 3211 only for tunnel metrics, records current public URL and process state, restarts child processes, retains logs and leaderboard outside source.
- [ ] Run unit suite and build. Run existing two-client landscape QA, then public URL two-client QA with invite links. Save reports under ignored artifacts.
- [ ] Commit and open draft PR; install exact committed snapshot under LocalAppData/RallyServer/app, install hidden per-user logon launcher, run and verify actual build and WSS.
- [ ] Open actual preview in Codex, give URL and local start/stop/status instructions. Clearly label temporary ingress and missing real-phone cross-carrier acceptance. Do not merge or change old public entry points without repo-required acceptance.
