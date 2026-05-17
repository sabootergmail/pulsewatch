# PulseWatch

> A self-extending operational tool. Half Trello (the **Task** board), half
> Betterstack (uptime monitors, incidents, audit log). The two halves are
> wired together: a task in the backlog can be **delegated to Claude** —
> Claude Code Action implements it, opens a PR, Vercel previews the change,
> merging deploys to prod. PulseWatch monitors its own production.

Built as an AI-first challenge for **abletocompete.ai**. The thing being
demonstrated isn't the dashboard — it's the **task → PR → deploy loop**
where the agent extends the product itself. The dashboard is just the
substrate that holds the backlog and watches the result.

[**Live demo →**](https://pulsewatch-sigma.vercel.app) · [Architecture](./ARCHITECTURE.md) · [One-pager](./ONE_PAGER.md) · [GitHub](https://github.com/sabootergmail/pulsewatch)

> **Production note on persistence.** The live demo uses SQLite seeded into
> the Vercel function bundle and hydrated to `/tmp` on cold start. Each
> serverless instance has its own copy, so writes from one request may not
> be visible in the next — fine for the demo, but in production you'd swap
> `DATABASE_URL` for hosted Postgres (Neon / Vercel Postgres). The schema and
> client code are identical; only `lib/db.ts` changes one line.

---

## What it does

**Task management (the Trello half)**
- Kanban board: backlog · in progress · done
- Each task has title, description, priority, GitHub issue/PR links
- **Delegate to Claude** button opens a GitHub issue with `@claude`, which
  triggers `.github/workflows/claude.yml` — Claude Code Action implements it,
  opens a PR, Vercel previews it, merge deploys to prod
- Every action lands in the audit log

**Operational reliability (the Betterstack half)**
- Watches HTTP endpoints on a configurable interval (10s — 1h)
- Records every check — status, HTTP code, latency, error
- Opens incidents automatically when a monitor goes down, resolves them when
  it recovers
- Audit log of every privileged action (CRUD, pause, probe runs, incident
  lifecycle, task lifecycle) — append-only, designed for post-incident review
- Dashboard with uptime %, latency sparkline, status table
- **Disaster-recovery heartbeat**: GitHub Actions cron pings the prod probe
  endpoint as a second-source scheduler, so a Vercel-side outage can't
  silently freeze monitoring

## The demo loop (this is the actual product)

```
user opens /tasks/new
    │ writes "Export audit log to CSV"
    ▼
user clicks "Delegate to Claude 🤖"
    │ server action POSTs to GitHub /issues with @claude in the body
    ▼
.github/workflows/claude.yml triggers (issue opened, @claude mention)
    │ runs anthropics/claude-code-action on a GH Actions runner
    ▼
agent reads the task, implements it, opens a PR against main
    │ Vercel auto-builds a preview deploy from the PR branch
    ▼
human reviews the PR, merges
    │ Vercel deploys to prod
    ▼
PulseWatch's own monitors verify prod is healthy
    │ /api/health returns ok; audit log records the deploy chain
    ▼
task transitions to "done"
```

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
| Database     | SQLite (dev) → **Turso (LibSQL) in prod** via Prisma 7 driver adapters | Same Prisma schema both sides; Turso adds PITR + persistence on Vercel |
| Styling      | Tailwind v4                             | Fast UI iteration                                   |
| Validation   | Zod                                     | Single source of truth on the action boundary       |
| Testing      | Vitest                                  | BDD-style specs against the probe contract         |
| Deployment   | Vercel + Vercel Cron                    | One command from `main`                             |
| Monitoring   | `/api/health` endpoint + audit log      | Self-observable                                     |
| AI runtime   | `anthropics/claude-code-action` on GHA, **4-role multi-agent pipeline** | Architect → Implementer → Reviewer → Release/Ops with file-based handoff |
| Logging      | Pino (JSON in prod, pretty-print in dev) | Structured log entries with `ticket_id`, `role`, `event` |
| Alerting     | Discord webhook (`DISCORD_WEBHOOK_URL`) | Triggers on incident open/resolve, rollback, release approved |

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
    page.tsx                 — dashboard (monitors + task counters)
    tasks/page.tsx           — kanban board (the Trello half)
    tasks/new/page.tsx       — create a task to feed Claude
    tasks/[id]/page.tsx      — task detail + audit trail
    monitors/new/page.tsx    — create monitor (server action)
    monitors/[id]/page.tsx   — detail: metrics, incidents, audit
    incidents/page.tsx       — incident inbox
    audit/page.tsx           — append-only audit log table
    api/probe/route.ts       — cron endpoint (Vercel/GH Actions)
    api/health/route.ts      — liveness probe for the watcher itself
  lib/
    db.ts                    — Prisma client singleton
    probe.ts                 — HTTP probe + incident state machine
    actions.ts               — server actions (monitor CRUD + probe-now)
    tasks.ts                 — server actions (task CRUD + delegateToClaude)
    audit.ts                 — typed audit log writer
  components/
    StatusBadge.tsx
    LatencySparkline.tsx
    TaskCard.tsx
prisma/
  schema.prisma              — Monitor / Check / Incident / Task / AuditLog
  seed.ts
tests/
  probe.test.ts              — BDD specs for the probe contract
.github/workflows/
  ci.yml                     — lint · test · build on every PR
  probe.yml                  — DR heartbeat (5-min external scheduler)
  claude.yml                 — Claude Code Action: @claude → PR (the demo loop)
vercel.json                  — Vercel Cron (1-min probe)
```

## Enabling the demo loop (Claude Code Action)

The `claude.yml` workflow needs an OAuth token from your Claude Max
subscription (not an API key). One-time setup:

1. Locally, run `claude setup-token` and follow the OAuth flow.
2. Copy the token it prints.
3. In the repo, **Settings → Secrets and variables → Actions → New repository
   secret**, name it `CLAUDE_CODE_OAUTH_TOKEN`, paste the value.
4. (Optional, for in-app delegation) Create a fine-grained personal access
   token with `Issues: read+write` on this repo, add it to Vercel env vars as
   `GITHUB_TOKEN` and `GITHUB_REPO=sabootergmail/pulsewatch`.

Verify by opening a GitHub issue: `@claude make the dashboard page title bold`.
Workflow run starts within ~10 s; a PR appears in 1–2 min.

> **Token security.** Never commit tokens — GitHub scans pushes in real time
> and leaked tokens are bot-harvested within minutes. Use GH Secrets and
> Vercel env vars only.

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

**Loop closes itself on merge.** The GitHub webhook at
`/api/webhooks/github` (HMAC-SHA256 with `GITHUB_WEBHOOK_SECRET`) listens
for `pull_request.closed && merged`. When a release_approval task's PR is
merged — by the Approve & deploy button, by Release/Ops, or directly on
GitHub — the webhook closes the release_approval and its originating task.
No human follow-up needed.

**Release tagging is automated.** After the post-deploy smoke test passes,
`.github/workflows/release-verify.yml` runs `npm version patch`, promotes
`[Unreleased]` in `CHANGELOG.md` to the new version, pushes a tag, and
creates a GitHub Release with auto-generated notes.

## What's deliberately out of scope (and why)

- **Multi-user RBAC** — single-user MVP. Auth itself is implemented
  (NextAuth + GitHub OAuth with allowlist via `ALLOWED_GITHUB_LOGINS`); the
  pieces above this point — teams, per-resource permissions — are not.
- **Notification fan-out (Slack/email/PagerDuty)** — Discord webhook is
  implemented in `lib/notify.ts`; additional channels are one function each.
- **Postgres** — schema is identical; flip `provider` in `schema.prisma`
  and the adapter import in `lib/db.ts` (Turso auto-detection wired —
  set `TURSO_DATABASE_URL` and the runtime picks LibSQL automatically).

## Authentication

Public surfaces: `/api/health`, `/api/probe` (Bearer `PROBE_SECRET`),
`/api/tickets` (Bearer `TICKETS_API_TOKEN`), `/api/webhooks/*` (HMAC
verified), `/api/auth/*`, `/login`.

Everything else (dashboard, tasks, monitors, audit, releases, server
actions) requires a NextAuth session whose GitHub `login` is in
`ALLOWED_GITHUB_LOGINS` (comma-separated). Non-allowlisted users get
`AccessDenied` at the OAuth callback and never receive a session.

Required env vars on Vercel + locally: `AUTH_SECRET` (`openssl rand -base64
32`), `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` (from a GitHub OAuth App
registered at github.com/settings/developers), `ALLOWED_GITHUB_LOGINS`.

## AI velocity (what this pipeline buys you)

Rough orientation, not benchmarks. Numbers are typical for this repo's
ticket sizes and are honest about overhead (the agent spends real wall-clock
time reading the codebase, running tests, etc.).

| Phase                         | Typical human time | Agent pipeline time |
|-------------------------------|--------------------|---------------------|
| Spec + design                 | 2–4 h              | < 2 min             |
| Implementation of MVP feature | 4–8 h              | 5–15 min            |
| Code review                   | 30–60 min          | < 1 min             |
| Release tag + smoke test      | 15–30 min          | < 2 min             |
| Rollback on bad deploy        | 5–30 min, manual   | < 30 s, autonomous  |

What this **doesn't** buy: judgment about *what* to build, scope
trade-offs, whether a refactor is worth the disruption. Those still belong
to the human who files the ticket — and to the user clicking "Approve & deploy".

## Extending via MCP

PulseWatch also exposes its ticketing surface as a Model Context Protocol
server in `mcp/`. Tools:

- `list_tickets(filter?)` — returns the current backlog / in-progress / done
- `create_ticket({ title, body, type })` — files a new task
- `get_audit_log({ since?, ticket_id? })` — pulls audit entries

Plug it into Claude Desktop by adding this to your config:

```jsonc
{
  "mcpServers": {
    "pulsewatch": {
      "command": "node",
      "args": ["/absolute/path/to/pulsewatch/mcp/server.mjs"],
      "env": {
        "PULSEWATCH_URL": "https://pulsewatch-sigma.vercel.app",
        "TICKETS_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

The MCP server is parallel to the REST API at `/api/tickets`. REST is the
agent pipeline's primary channel (per pozadavky #4); MCP is for ad-hoc
LLM clients (e.g., a Claude Desktop session asking about PulseWatch state).

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
