# Home multiplayer server

User approved running their own Windows PC as the multiplayer server now, then replacing the temporary address with a purchased domain. Baseline: origin/main a23ef2c, version 1.21.12. Other worktrees and public deployments must remain intact.

Use the existing authoritative Node/WebSocket room implementation, bound to loopback. Initially expose a separate game preview through an outbound HTTPS Cloudflare Quick Tunnel (not a production uptime or domestic-latency promise). This temporary endpoint serves its own current assets and invitations; existing Pages/Vercel entry points remain unchanged pending preview acceptance. Fixed-domain ingress is a later configuration step, not automatically provisioned by purchasing a domain.

Server mode supports two-player singles; preserve doubles on existing peer builds, explicitly reject unsupported server doubles. Limit this trial to 10 rooms and 40 connections. Only exact local/public origins may upgrade WebSockets. Do not expose the filesystem, credentials, shell, or database files.

Install a separate runtime snapshot under LocalAppData/RallyServer, with hidden supervisor, per-user logon startup, process restarts, bounded logs, persistent leaderboard, status/stop commands, and task-scoped sleep prevention. Do not change global firewall or power policy. Temporary tunnel restarts can change the URL, so record the current URL in local status. Shutdown disconnects active matches.

Verify baseline tests, room limits, unsupported modes, invalid origins, two independent browser clients in mobile landscape, public HTTP/WSS round trip, snapshot/version, and clean stop/restart. Same-host public routing tests do not establish real cross-carrier phone latency. Keep that limitation explicit.
