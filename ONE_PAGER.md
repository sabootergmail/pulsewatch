# PulseWatch — AI-first challenge submission

**Submission for:** challenge@abletocompete.ai
**Author:** Jaroslav Novotný (sabooter@gmail.com)
**Repo:** https://github.com/sabootergmail/pulsewatch
**Live demo:** https://pulsewatch-sigma.vercel.app
**Health check:** https://pulsewatch-sigma.vercel.app/api/health
**Time budget:** 1 hour (the spec offered 5; the operator gave me 60 minutes)
**Date:** 2026-05-17

---

## Framing

PulseWatch is a **hybrid**: Betterstack-style uptime monitoring **and**
Trello-style ticketing in one application, **wired together so that the
agent processes tickets and PulseWatch monitors the resulting prod
deploys**. This isn't two products bolted on — it's the same data model,
audit log, and dashboard.

## What I built

- **Task management (Trello half).** Kanban board with backlog · in
  progress · done. Tasks are first-class objects with priority and audit
  history. Each task can be **delegated to Claude** — one click opens a
  GitHub issue with `@claude`, triggering a **4-role agent pipeline**
  (Architect → Implementer → Reviewer → Release/Ops) that implements the
  work, opens a PR, preview-deploys on Vercel, files a `release_approval`
  ticket back into PulseWatch, and (after the user's one approve click)
  merges to prod with autonomous rollback on smoke-test failure.
- **Operational reliability (Betterstack half).** HTTP monitors with
  configurable interval/expected-status/timeout; auto-opening incidents on
  failure and auto-resolving on recovery; uptime % and latency sparklines;
  append-only audit log; self-liveness `/api/health`; second-source DR probe
  via GitHub Actions; Discord alerting on `incident.{open,resolve}` and
  `release.{merge,rollback}`.
- **Agent performance dashboard.** Alongside the service monitoring stats,
  the home page shows tickets done in 24h/7d, success rate, avg
  ticket→merge time, and time since last release/rollback — all derived
  from the audit log, no extra data source.

The point isn't either of the two halves on its own — it's that they share
the same audit log, the same dashboard, and the same deploy pipeline. The
**demo** is the AI-first workflow itself: open a task, click *Delegate to
Claude*, the system extends itself in prod within minutes.

## What's in the repo against the assignment's 9 evaluation criteria

| Criterion                          | Where it shows up                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Expert generalist (many hats)      | Data model, backend, UI, tests, CI, IaC, runbooks, AI runtime, MCP — one person                                   |
| Working with AI agents             | `.github/workflows/claude.yml` orchestrator → 4 subagents in `.claude/agents/*.md` with file-based handoff         |
| Specification / test / BDD         | Architect role enforces `Given/When/Then` spec.md; `tests/probe.test.ts` BDD-style; tests named after scenarios   |
| Code review & AI testing           | Reviewer role with read-only tools, mandatory `request_changes` triggers, 1 retry cap                              |
| Release process                    | `RELEASE.md`: semver + CHANGELOG + git tag + GitHub Release. Hotfix path explicit. CI workflow gates every PR     |
| Audit log & disaster recovery      | Append-only `AuditLog` with closed-union vocab; `DR.md` documents Turso PITR + restore drill + second-source probe |
| Monitoring & incident response     | Product itself; `/api/health`; incident state machine; `INCIDENTS.md` 3-scenario runbook; Discord webhook         |
| AI/ML/MCP integration readiness    | **Functional MCP server in `mcp/`** with `list_tickets` / `create_ticket` / `get_audit_log` + Claude Desktop config |
| Analytics                          | Agent-performance panel: throughput 24h/7d, success rate, avg ticket→done, last release. Service-monitoring stats |

## What I cut, and why

- **Auth** — single-user MVP; adding NextAuth doesn't change what's being
  evaluated.
- **Turso DB swap** — `DR.md` documents it (PITR, restore drill); the
  Prisma adapter swap is one file. Held back behind a Turso account
  provisioning step that needs the user. SQLite snapshot is hydrated to
  `/tmp` on cold start for the demo.
- **Drag-and-drop kanban** — status dropdown is enough; D&D doesn't change
  the agent loop.
- **GitHub webhook for PR-merge → task-done** — would close the loop
  automatically; the demo is legible with Release/Ops closing the task via
  REST after smoke test. Webhook is a candidate task to delegate.

## Why the result still looks human-made

I had Claude Code write the code, but the **shape of the system** — the
scope cuts, the priority order, the DR pattern, the fact that the audit log
is a closed-union typed vocabulary instead of free-text strings — is the
work of a generalist making trade-offs against a clock. The README and
ARCHITECTURE doc explain *why* each choice was made, not just what was
chosen.

## What I would do with the next budget

1. **Turso provision + adapter swap** (20 min) — one CLI session +
   `lib/db.ts` import change; per `DR.md`.
2. **Wire the demo loop end-to-end live** (30 min) — `CLAUDE_CODE_OAUTH_TOKEN`
   in GH Secrets, `GITHUB_TOKEN` on Vercel, one delegated task all the way
   from `/tasks/new` to merged PR to closed task. Record it for the demo
   video.
3. **Auth + multi-tenancy** (45 min) — NextAuth, scope monitors per user.
4. **Playwright E2E** (30 min) — one happy-path test from create monitor →
   force a probe → see incident open and resolve

The first four are linearly composable from the current shape; nothing in the
hour's work pre-decides against them.

## How to verify

```bash
git clone https://github.com/sabootergmail/pulsewatch && cd pulsewatch
npm install && cp .env.example .env
npm run db:migrate && npm run db:seed
npm test            # 4 BDD specs against the probe contract
npm run probe:once  # runs every due probe, prints results
npm run dev         # http://localhost:3000  (Dashboard, Tasks, Incidents, Audit)
```

## How to fire the AI-first demo loop

Requires the repo's `CLAUDE_CODE_OAUTH_TOKEN` secret (one-time, see README).
Then either:

- **From PulseWatch UI**: `/tasks/new` → write a task → on the kanban click
  *Delegate to Claude 🤖*. (Needs `GITHUB_TOKEN` env var on Vercel.)
- **From GitHub**: open an issue here, mention `@claude` and describe what
  you want. The workflow fires within seconds.

In either case: a PR appears on the repo within 1–2 minutes, Vercel posts a
preview deploy link in the PR, merging promotes to prod, and PulseWatch's
own monitors keep an eye on the result.
