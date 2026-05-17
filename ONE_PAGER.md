# PulseWatch — AI-first challenge submission

**Submission for:** challenge@abletocompete.ai
**Author:** Jaroslav Novotný (sabooter@gmail.com)
**Repo:** https://github.com/sabootergmail/pulsewatch
**Live demo:** https://pulsewatch.vercel.app
**Time budget:** 1 hour (the spec offered 5; the operator gave me 60 minutes)
**Date:** 2026-05-17

---

## What I built

A working clone of the operational-monitoring slice of Betterstack: configure
HTTP endpoints, get probed every N seconds, see live status with uptime %
and latency sparklines, get incidents auto-opened on failure and auto-resolved
on recovery, and read an append-only audit log of every privileged action.

It runs in production on Vercel with a 1-minute Vercel Cron and a 5-minute
GitHub Actions DR-heartbeat as a second-source scheduler.

## What's in the repo against the assignment's 9 evaluation criteria

| Criterion                          | Where it shows up                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Expert generalist (many hats)      | Data model, backend, UI, tests, CI, IaC (vercel.json), docs — one person, one hour                                 |
| Working with AI agents             | End-to-end Claude Code session: agent picked stack, consulted vendored Next.js 16 docs, drove the whole loop      |
| Specification / test / BDD         | `tests/probe.test.ts` — BDD-style `describe/it` against the probe contract; passes in CI                          |
| Code review & AI testing           | `npm test` in CI; types enforced; Zod on every server-action boundary                                              |
| Release process                    | `.github/workflows/ci.yml` (lint · test · build on every PR); Vercel auto-deploys from `main`                     |
| Audit log & disaster recovery      | `AuditLog` table, typed action vocabulary, append-only by convention; DR heartbeat via second-source GH Action     |
| Monitoring & incident response     | The product itself; `/api/health` self-liveness; incident state machine in `runProbeForMonitor`                    |
| AI/ML/MCP integration readiness    | `lib/probe.ts` exports a pure `probe()` and a typed result — an MCP `pulsewatch.monitors.*` tool is one file away  |
| Analytics                          | Dashboard: counters (operational/down/incidents), per-monitor uptime %, latency sparkline, 60-point recent history |

## What I cut, and why

- **Auth** — single-user MVP; adding NextAuth is meaningful work that doesn't
  change what's being evaluated.
- **Notifications (Slack/Email/PagerDuty)** — the audit log + dashboard surface
  incidents in <60s; integrations are one server function away.
- **Postgres** — schema is identical, swap one line. SQLite kept the deploy
  loop tight enough to fit the hour.

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
npm run dev         # dashboard at http://localhost:3000
```
