# Disaster Recovery

> Backup strategy, restore drill, and second-source resilience for PulseWatch.

## Data we care about

| Table        | Why it matters                                         | Recovery RPO |
|--------------|--------------------------------------------------------|--------------|
| `Monitor`    | Configuration — small, change-rarely                   | 24 h         |
| `Check`      | Time series — high volume, derivable                   | 7 days       |
| `Incident`   | Incident history — needed for SLO reporting & audits   | 24 h         |
| `Task`       | Backlog + release_approval state                       | 1 h          |
| `AuditLog`   | Append-only ledger; source of truth for who-did-what   | **0**        |

## Production storage: Turso (LibSQL)

Local dev still uses a SQLite file (`./dev.db`). Production swaps that for
Turso (hosted libSQL):

```ts
// src/lib/db.ts (production branch)
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSQL({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

Env vars required on Vercel:

- `TURSO_DATABASE_URL` — e.g. `libsql://pulsewatch-xxxxx.turso.io`
- `TURSO_AUTH_TOKEN` — token from `turso db tokens create pulsewatch`

## Rollback levels (per pozadavky #8)

PulseWatch supports three rollback levels, each with a different scope and
cost. All are recorded in the `AuditLog` and create a `rollback` ticket.

| Level | Scope            | Mechanism                                       | Use case                              | Duration |
|-------|------------------|-------------------------------------------------|---------------------------------------|----------|
| **L1** | Code only       | Vercel promote previous deployment              | Smoke fail, acute UI bug              | ~30 s    |
| **L2** | Code + DB       | Vercel promote + Turso point-in-time restore    | Data corruption, bad migration        | 1–5 min  |
| **L3** | Full revert     | `git revert <sha>` PR through agent pipeline    | Audit-trail preferred over speed      | 5–15 min |

### Initiating rollbacks

- **Autonomous (L1 only).** The `release-verify.yml` workflow detects a
  failed post-deploy smoke test and calls Vercel's promote API for the
  previous deployment. No human required — autonomy is the safety net.
- **GUI (L1/L2/L3).** Open `/releases`, click **Rollback** on the row, fill
  the form (level, reason, PITR timestamp for L2). Confirmation creates the
  rollback ticket and audit entries.

### L1 — Code-only

```
Backend:    src/lib/rollback.ts → executeL1()
API:        POST https://api.vercel.com/v10/projects/pulsewatch/promote/<deploymentId>
Auth:       VERCEL_TOKEN env var
Status:     working when VERCEL_TOKEN is set; otherwise rollback is recorded
            in the audit log but Vercel is not actually promoted.
```

### L2 — Code + DB PITR

```
1. Lookup target release (the one before the failing one).
2. Turso point-in-time restore to the chosen timestamp:
   POST https://api.turso.tech/v1/organizations/<org>/databases/<name>/restore
   { "timestamp": "<ISO8601>" }
3. Wait for new DB to be ready, capture its connection URL.
4. Update Vercel env DATABASE_URL to the new URL.
5. Trigger Vercel redeploy of the previous code deployment.
6. Audit + smoke test.
```

**Status:** scaffolded in `src/lib/rollback.ts → executeL2()` but not wired
end-to-end — Turso is not yet provisioned. The audit entry is still
recorded so the operator has a paper trail.

### L3 — Full revert PR

```
1. Open a `git revert <release-sha>` PR via the GitHub API.
2. The PR enters the regular agent pipeline (Reviewer, release_approval).
3. Once the user approves the release_approval, the revert is merged and
   deployed like any other release.
```

**Status:** scaffolded but errors with a clear message when invoked. The
PR-opening implementation is a candidate first task for the agent pipeline.

## Backup strategy

Turso has **point-in-time recovery (PITR)** built in (free tier: up to 24 h
of history). This is our primary backup mechanism — we don't run a
separate dump cron.

Secondary backup, weekly:

```bash
turso db shell pulsewatch ".dump" > backups/pulsewatch-$(date +%F).sql
```

Stored as a private artifact in GitHub Releases on every minor/major release.

## Restore drill (run this at least once before relying on it)

```bash
# 1. Inspect available recovery points
turso db inspect pulsewatch --instance default

# 2. Create a new DB from the desired point in time
turso db create pulsewatch-restore-test \
  --from-db pulsewatch \
  --timestamp "2026-05-17T12:00:00Z"

# 3. Point a Vercel preview deploy at the restore DB
vercel env add TURSO_DATABASE_URL preview < <(echo "libsql://pulsewatch-restore-test-xxx.turso.io")
vercel env add TURSO_AUTH_TOKEN preview < <(turso db tokens create pulsewatch-restore-test)
vercel deploy --target preview

# 4. Manually verify dashboard + audit log render the older state

# 5. Tear down
turso db destroy pulsewatch-restore-test --yes
```

The drill is checked in as a `make` target (`make dr-drill`) so it's
runnable on demand. Run it at least quarterly; document the result in a
`dr-drill-<date>.md` audit ticket.

## Second-source scheduling

Even if the primary monitoring path (Vercel Cron) fails silently, GitHub
Actions runs `.github/workflows/probe.yml` every 5 minutes against the prod
probe endpoint. Two systems with different failure modes means:

- Vercel Cron failure → GH Actions still probes (and we see audit log
  entries from `probe.yml` instead of `cron`).
- Prod app down → both schedulers' probes fail, dashboard goes empty, audit
  log gap is obvious, `/api/health` returns 503.

## Failure scenarios mapped

| Failure                                | What happens                                   | Manual action            |
|----------------------------------------|------------------------------------------------|--------------------------|
| Vercel deploy bad (smoke test fails)   | `release-verify.yml` auto-rolls back           | None (verify in `/audit`) |
| Vercel down entirely                   | `/api/health` unreachable; status page empty   | Wait or migrate (see RELEASE.md) |
| Turso instance down                    | `/api/health` returns 503; reads/writes 500    | Failover to PITR restore |
| GitHub Actions cron stops              | Vercel Cron still runs daily                   | Re-enable workflow       |
| Lost `CLAUDE_CODE_OAUTH_TOKEN`         | Pipeline stops accepting new tasks             | `claude setup-token` again, replace secret |
| Audit log corruption (DB write issue)  | Loud failures; product mostly unusable         | Restore from PITR (RPO 0) |

## What we deliberately don't do

- **No multi-region active-active.** Single Turso region for v1. Sufficient
  for the MVP's traffic profile; documented as a known limitation.
- **No SLA monitoring of monitoring.** Turtles all the way down stops here:
  we trust Vercel's status page for the underlying platform.
- **No human paging.** Discord webhook only (see `INCIDENTS.md`).
