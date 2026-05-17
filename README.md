# PulseWatch

> Lightweight uptime monitoring with incident tracking, audit logs, and a
> dashboard you can hand to a non-engineer.

Built as a 1-hour AI-first challenge for **abletocompete.ai**. The point isn't
to out-feature Betterstack — it's to show how much production-shaped surface
area an AI-orchestrated developer can lay down in a single sitting:
data model, monitoring engine, dashboards, incidents, audit log, tests, CI,
disaster-recovery heartbeat, and deployment.

[**Live demo →**](https://pulsewatch-sigma.vercel.app) · [Architecture](./ARCHITECTURE.md) · [One-pager](./ONE_PAGER.md) · [GitHub](https://github.com/sabootergmail/pulsewatch)

> **Production note on persistence.** The live demo uses SQLite seeded into
> the Vercel function bundle and hydrated to `/tmp` on cold start. Each
> serverless instance has its own copy, so writes from one request may not
> be visible in the next — fine for the demo, but in production you'd swap
> `DATABASE_URL` for hosted Postgres (Neon / Vercel Postgres). The schema and
> client code are identical; only `lib/db.ts` changes one line.

---

## What it does

- **Watches HTTP endpoints** on a configurable interval (10s — 1h)
- **Records every check** — status, HTTP code, latency, error
- **Opens incidents** automatically when a monitor goes down, **resolves**
  them when it recovers
- **Audit log** of every privileged action (CRUD, pause, probe runs, incident
  lifecycle) — append-only, designed for post-incident review
- **Dashboard** with uptime %, latency sparkline, and a Betterstack-style
  status table
- **Disaster-recovery heartbeat**: a GitHub Actions cron pings the prod probe
  endpoint as a second-source scheduler, so a Vercel-side outage can't silently
  freeze monitoring

## Quick start

```bash
npm install
cp .env.example .env       # SQLite DB + PROBE_SECRET
npm run db:migrate          # applies schema
npm run db:seed             # 3 healthy + 1 always-failing demo monitor
npm run dev                 # http://localhost:3000

# Trigger a one-shot probe of every due monitor
npm run probe:once
```

For continuous monitoring locally, leave `npm run dev` running and hit the
probe endpoint on a loop (or set up Vercel Cron in production):

```bash
curl -H "Authorization: Bearer dev-secret-change-me" http://localhost:3000/api/probe
```

## Tech stack

| Layer        | Choice                                  | Why                                                 |
| ------------ | --------------------------------------- | --------------------------------------------------- |
| Framework    | Next.js 16 (App Router, RSC, Actions)   | One repo, one deploy, type-safe data flow           |
| Database     | SQLite via Prisma 7 + better-sqlite3    | Zero-ops for MVP; swap to Postgres by changing one line |
| Styling      | Tailwind v4                             | Fast UI iteration                                   |
| Validation   | Zod                                     | Single source of truth on the action boundary       |
| Testing      | Vitest                                  | BDD-style specs against the probe contract         |
| Deployment   | Vercel + Vercel Cron                    | One command from `main`                             |
| Monitoring   | `/api/health` endpoint + audit log      | Self-observable                                     |

## Architecture in one diagram

```
                   ┌──────────────┐   user actions
   user ─────────▶ │  Next.js App │ ───────────────┐
                   │  (RSC + SA)  │                │
                   └──────┬───────┘                ▼
                          │                  ┌──────────┐
                          │                  │ AuditLog │
                          │                  └──────────┘
   Vercel Cron ─┐         ▼                       ▲
   (1 min)      │   ┌────────────┐                │
                ├─▶ │ /api/probe │ ─── audit ─────┘
   GH Actions ──┘   └─────┬──────┘
   (5 min DR)             │
                          ▼
                   ┌────────────────┐
                   │ runDueProbes() │
                   │  ─ fetch URL   │
                   │  ─ write Check │
                   │  ─ open/close  │
                   │    Incident    │
                   └────────┬───────┘
                            ▼
                   ┌────────────────┐
                   │  SQLite (dev)  │
                   │  Postgres(prod)│
                   └────────────────┘
```

## Project map

```
src/
  app/
    page.tsx                 — dashboard (status overview)
    monitors/new/page.tsx    — create monitor (server action)
    monitors/[id]/page.tsx   — detail: metrics, incidents, audit
    incidents/page.tsx       — incident inbox
    audit/page.tsx           — append-only audit log table
    api/probe/route.ts       — cron endpoint (Vercel/GH Actions)
    api/health/route.ts      — liveness probe for the watcher itself
  lib/
    db.ts                    — Prisma client singleton
    probe.ts                 — HTTP probe + incident state machine
    actions.ts               — server actions (CRUD + probe-now)
    audit.ts                 — typed audit log writer
  components/
    StatusBadge.tsx
    LatencySparkline.tsx
prisma/
  schema.prisma              — Monitor / Check / Incident / AuditLog
  seed.ts
tests/
  probe.test.ts              — BDD specs for the probe contract
.github/workflows/
  ci.yml                     — lint · test · build on every PR
  probe.yml                  — DR heartbeat (5-min external scheduler)
vercel.json                  — Vercel Cron (1-min probe)
```

## Operational details worth knowing

**Audit log is append-only.** Every server action and every probe run writes
one row. The action vocabulary is closed (typed `AuditAction` union), so the
log is machine-greppable for post-incident timelines.

**Incident state machine** lives in `runProbeForMonitor` (`src/lib/probe.ts`).
A monitor is "open" if its most recent check was `down` and the previous check
created an incident that hasn't been resolved. Recovery (`up` while an
incident is open) automatically closes it with a `resolvedAt` timestamp.

**Probe endpoint is authenticated.** Cron hits `/api/probe` with a shared
secret (`Authorization: Bearer $PROBE_SECRET`). Without it, the route 401s —
so the endpoint is safe to leave public.

**Two-source scheduling.** Vercel Cron probes every minute. GitHub Actions
probes every 5 minutes as a fallback. If either side fails, the other still
runs. If both fail, the `/api/health` endpoint and the audit log gap make the
outage obvious.

## What's deliberately out of scope (and why)

- **Multi-user auth** — the spec asked for an MVP in 1 hour. Adding NextAuth
  doubles the surface area without changing what's being judged.
- **Notification fan-out (Slack/email/PagerDuty)** — the audit log + dashboard
  show incidents immediately; integrations are a stub away (one server
  function in `lib/notify.ts` would do it).
- **Postgres** — schema is identical; flip `provider` in `schema.prisma` and
  the adapter import in `lib/db.ts`.

## AI-first build notes

This MVP was driven end-to-end with Claude Code:

- The spec was negotiated in plain text. The agent picked the stack, made the
  scope cuts, and surfaced only the genuinely-blocking decisions (none, in the
  end — the operator gave it full creative authority).
- The Next.js 16 docs ship in `node_modules/next/dist/docs/`. The agent
  consulted them before writing any route code, since the framework had
  breaking changes vs. its training data.
- Prisma 7 driver adapters were a footgun (the type-system rename
  `PrismaBetterSQLite3` → `PrismaBetterSqlite3` cost about 90 seconds in the
  test loop). Once surfaced by Vitest, fixed in one edit.
- Tests-as-specs: the probe contract is locked down in `tests/probe.test.ts`
  using BDD-style `describe/it` so the engine can be refactored without
  losing intent.

## License

MIT
