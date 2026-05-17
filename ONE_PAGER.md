# PulseWatch — AI-first challenge submission

**Submission for:** challenge@abletocompete.ai
**Author:** Jaroslav Novotný (sabooter@gmail.com)
**Repo:** https://github.com/sabootergmail/pulsewatch
**Live demo:** https://pulsewatch-sigma.vercel.app
**Health check:** https://pulsewatch-sigma.vercel.app/api/health
**Time budget:** 1 hour (the spec offered 5; the operator gave me 60 minutes)
**Date:** 2026-05-17

---

## What I built

A self-extending operational tool that fuses the two halves of the brief:

- **Task management (Trello half).** Kanban board with backlog · in
  progress · done. Tasks are first-class objects with priority and audit
  history. Each task can be **delegated to Claude** — one click opens a
  GitHub issue with `@claude`, triggering `anthropics/claude-code-action` to
  implement the work, open a PR, preview-deploy on Vercel, and (after merge)
  promote to prod. The task auto-links to its issue and PR.
- **Operational reliability (Betterstack half).** HTTP monitors with
  configurable interval/expected-status/timeout; auto-opening incidents on
  failure and auto-resolving on recovery; uptime % and latency sparklines;
  append-only audit log; self-liveness `/api/health`; second-source DR probe
  via GitHub Actions.

The point isn't either of the two halves on its own — it's that they share
the same audit log, the same dashboard, and the same deploy pipeline. The
**demo** is the AI-first workflow itself: open a task, click *Delegate to
Claude*, the system extends itself in prod within minutes.

## What's in the repo against the assignment's 9 evaluation criteria

| Criterion                          | Where it shows up                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Expert generalist (many hats)      | Data model, backend, UI, tests, CI, IaC, docs, AI runtime — one person                                            |
| Working with AI agents             | `.github/workflows/claude.yml` runs Claude Code Action on `@claude`; the product itself extends via this loop      |
| Specification / test / BDD         | `tests/probe.test.ts` — BDD-style `describe/it` against the probe contract; passes in CI                          |
| Code review & AI testing           | `npm test` in CI; types enforced; Zod on every server-action boundary                                              |
| Release process                    | `ci.yml` (lint·test·build); Vercel auto-deploys preview from PR branch, prod from `main`                          |
| Audit log & disaster recovery      | `AuditLog` table, typed action vocabulary (monitor.* + task.* + incident.*), append-only; DR heartbeat workflow    |
| Monitoring & incident response     | Product itself; `/api/health`; incident state machine in `runProbeForMonitor`                                      |
| AI/ML/MCP integration readiness    | `lib/probe.ts` and `lib/tasks.ts` are pure contracts — an MCP `pulsewatch.{monitors,tasks}.*` tool is one file     |
| Analytics                          | Dashboard: 6-stat overview, per-monitor uptime % + latency sparkline, task counters, audit log                     |

## What I cut, and why

- **Auth** — single-user MVP; adding NextAuth is meaningful work that doesn't
  change what's being evaluated.
- **Notifications (Slack/Email/PagerDuty)** — the audit log + dashboard surface
  incidents in <60s; one of the seeded tasks is *literally* "Slack notification
  on incident open", waiting to be delegated to Claude.
- **Postgres** — schema is identical, swap one line. SQLite kept the deploy
  loop tight; the README documents the persistence caveat.
- **Drag-and-drop kanban** — tasks have a status dropdown / next-step button.
  D&D doesn't change the agent loop; we shipped the loop.
- **GitHub webhook for PR-merge → task-done** — could close the loop
  automatically, but the demo is just as legible with the user closing the
  task after merge. Webhook is also a candidate first task to delegate.

## Why the result still looks human-made

I had Claude Code write the code, but the **shape of the system** — the
scope cuts, the priority order, the DR pattern, the fact that the audit log
is a closed-union typed vocabulary instead of free-text strings — is the
work of a generalist making trade-offs against a clock. The README and
ARCHITECTURE doc explain *why* each choice was made, not just what was
chosen.

## What I would do with the missing 4 hours

1. **Auth + multi-tenancy** (45 min) — NextAuth, scope monitors per user
2. **Notification fan-out** (30 min) — Slack incoming-webhook on incident open
3. **Postgres + cron rollups** (60 min) — daily uptime aggregation table for
   SLO/error-budget views
4. **MCP server** (30 min) — expose `monitors.list / create / pause` as MCP
   tools so an LLM can run ops on the system
5. **Status page** (45 min) — public, brandable, shareable URL
6. **Playwright E2E** (30 min) — one happy-path test from create monitor →
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
