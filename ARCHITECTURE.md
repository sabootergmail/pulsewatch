# Architecture

## Goals

PulseWatch is a single-page operational tool: watch some HTTP endpoints, tell
me when they break, log everything. The architecture serves three properties
in priority order:

1. **Correctness of the incident state machine.** A wrong "down" wakes someone
   up at 3am; a wrong "up" makes them not get woken up. Both are bad. The
   state machine is small, has one place to look (`runProbeForMonitor`), and
   has a test for every transition.
2. **Audit-ability.** Every meaningful action emits one `AuditLog` row with a
   typed `action` field. After an incident you should be able to reconstruct
   the sequence of events without grepping app logs.
3. **Replaceability of each layer.** SQLite → Postgres is one provider change.
   Vercel Cron → any cron is one URL. The probe engine doesn't know about HTTP
   transport beyond `fetch`.

## Data model

```
Monitor 1───* Check       (every probe attempt)
Monitor 1───* Incident    (auto-opened on down→up transition)
*       *──* AuditLog     (privileged action ledger; no FK, soft-references)
```

- `Monitor` carries config (URL, interval, expected status, timeout) and
  denormalised live state (`status`, `lastCheckedAt`) so the dashboard renders
  without aggregation joins.
- `Check` is the raw time series. We never mutate it. Pruning (TODO) would
  happen on a schedule.
- `Incident` is derived from `Check` history: opened when we see `down`
  without an open incident already, resolved when we see `up` with one. The
  invariant "at most one open incident per monitor" is enforced by the
  detection logic — we always query `findFirst(... status: "open")` first.
- `AuditLog` is append-only by convention. The `action` field is a closed
  union (see `src/lib/audit.ts`).

## The probe loop

```
runDueProbes()
  └── for every non-paused, due Monitor:
        └── runProbeForMonitor(id)
              ├── probe(url, opts)         ← pure I/O, no DB writes
              ├── prisma.check.create()    ← time series append
              ├── if down && no open incident → open one + audit
              ├── if up && open incident → resolve it + audit
              └── prisma.monitor.update()  ← denormalised live state
```

The probe function itself (`probe()`) is intentionally pure: URL → result.
That's what lets the test suite stub `fetch` and exhaustively exercise the
contract without touching the database.

## Why server actions, not API routes

Every CRUD operation on a `Monitor` is a server action (`src/lib/actions.ts`).
That keeps the audit-log write co-located with the mutation in the same
transaction-shaped scope: if the mutation throws, the audit row is never
written (we'd want a real transaction in prod; SQLite + Prisma adapters make
this a one-line addition).

API routes are used only where the caller isn't the browser: the cron probe
endpoint and the health check.

## Failure modes considered

| Failure                              | Mitigation                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Vercel Cron pauses / our deploy dies | GH Actions probe.yml hits prod every 5 min as a second source           |
| Prod DB unreachable                  | `/api/health` returns 503; status page shows last successful audit row  |
| Probe endpoint abused                | Bearer-token auth required; secret rotates via env var                  |
| Slow target endpoint hangs probe     | AbortController + per-monitor timeout (default 5s)                      |
| Monitor mid-edit during probe        | Probe reads its own snapshot of Monitor; race is bounded to one cycle   |
| Audit log fills disk                 | SQLite VACUUM cron (out of scope for MVP, schema-ready)                 |

## Deployment topology

```
GitHub (sabootergmail/pulsewatch)
    │
    ├──▶ Vercel (production)
    │       ├── Next.js runtime
    │       ├── Vercel Cron (1 min)  ─── /api/probe
    │       └── managed Postgres (when promoted from MVP SQLite)
    │
    └──▶ GitHub Actions
            ├── ci.yml (every PR: lint · test · build)
            └── probe.yml (every 5 min: DR heartbeat to prod)
```

## Future cuts that were rejected for scope

- **Auth** — single-user MVP. Adding NextAuth is ~30 min of yak shaving and
  doesn't change what abletocompete is evaluating.
- **Notifications** — the audit log + dashboard surface incidents in <60s.
  Slack/PagerDuty integrations are a single `notify()` call away in
  `runProbeForMonitor`.
- **SLO / error budgets** — uptime % is computed over the last N checks. A
  proper time-windowed SLO needs a cron-driven rollup table; ready when the
  next 5 hours arrive.
