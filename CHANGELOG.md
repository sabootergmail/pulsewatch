# Changelog

All notable changes to PulseWatch are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The Implementer role appends an entry to this file in every PR; the
Release/Ops role updates the `[Unreleased]` heading to a versioned section
when cutting a release and tagging it.

## [Unreleased]

### Added
- Fire-and-forget Beeceptor webhook (`BEECEPTOR_HOOK_URL`) on `incident.open` events; silent no-op when env var is absent (`cmpa1avwl000004jp9jzt6d1f`)

## [0.1.1] — 2026-05-17

### Added
- Multi-agent pipeline scaffolding under `.claude/agents/` (architect /
  implementer / reviewer / release-ops role prompts).
- `RELEASE.md`, `DR.md`, `INCIDENTS.md` runbooks.
- Documentation: README "AI velocity" comparison table, hybrid framing
  (monitoring + ticketing + self-extension).

### Changed
- DB target documented as **Turso (LibSQL)** in production; SQLite remains
  for local dev. Adapter swap and connection-string env vars described in
  `DR.md`.

## [0.2.0] — 2026-05-17

### Added
- Task management half: kanban board (`/tasks`), Task model, CRUD via server
  actions, "Delegate to Claude" action that opens a GitHub issue mentioning
  `@claude`.
- Release-approval flow: `release_approval` task type, **Approve & deploy**
  button as the sole human gate, autonomous rollback on smoke-test failure.
- REST API at `/api/tickets` for agent ↔ pulsewatch communication.
- `.github/workflows/release-verify.yml` — post-deploy smoke + rollback.
- `.github/workflows/claude.yml` — Claude Code Action on `@claude` mentions.

### Changed
- Dashboard now surfaces task counters alongside monitor stats.

## [0.1.0] — 2026-05-17

### Added
- Initial MVP: HTTP uptime monitoring with auto-opening incidents, append-only
  audit log, dashboard, latency sparkline, `/api/health` self-liveness.
- Prisma schema (Monitor / Check / Incident / AuditLog) + SQLite via
  better-sqlite3 driver adapter.
- Vercel deploy with daily cron probe + GitHub Actions DR heartbeat (5 min).
- BDD-style Vitest specs for the probe contract.
- CI workflow (lint · test · build).
