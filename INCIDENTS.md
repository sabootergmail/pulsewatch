# Incident response runbook

> Three scenarios. Each one: what you'll see, how to diagnose, what to do.
> If you find yourself running this runbook, log every step into a PulseWatch
> ticket as you go — the audit trail is what makes the post-mortem useful.

---

## Scenario 1 — PulseWatch is down

**You'll see:**
- `/api/health` returns 503 or fails to load
- Dashboard shows blank state or 500 page
- Discord alerts go silent (because the notifier is in the same process)

**Diagnose:**

```bash
curl -i https://pulsewatch-sigma.vercel.app/api/health
vercel logs pulsewatch --since 10m
vercel ls pulsewatch
```

Three likely root causes:

1. **Bad deploy slipped past smoke test.** Check the latest deployment in
   Vercel dashboard. If `release-verify.yml` didn't run or didn't catch it,
   roll back manually:
   ```bash
   vercel rollback <previous-good-deployment-url> --token "$VERCEL_TOKEN" --yes
   ```
2. **Turso unreachable.** `/api/health` will show `db: fail`. Check
   `https://status.turso.tech`. If Turso is down, there's nothing to do but
   wait or fail over (see `DR.md`).
3. **Vercel platform outage.** `vercel status` or status.vercel.com. Wait.

**After recovery:**
- File a ticket `post-mortem: <date>` in PulseWatch
- Update `INCIDENTS.md` if the failure mode wasn't covered

---

## Scenario 2 — Agent pipeline failing repeatedly

**You'll see:**
- Tickets piling up in `in_progress` without PRs
- `release_approval` tickets that never get created
- GitHub Actions runs failing on `.github/workflows/claude.yml`

**Diagnose:**

1. **Check token validity.** Open `Settings → Secrets and variables → Actions`,
   verify `CLAUDE_CODE_OAUTH_TOKEN` is present and not expired.
   ```bash
   # locally
   claude setup-token   # regenerate if expired
   ```
2. **Look at the workflow logs.** `gh run list --workflow=claude.yml` and
   inspect the most recent run. Common failures: quota exceeded, action
   version drift, missing secret.
3. **Read the audit log in PulseWatch.** Filter for `task.delegate` entries
   that have no follow-on `task.update` from `agent:claude` — those are
   stuck tickets.

**Pause the pipeline:**

```bash
gh workflow disable claude.yml
```

This stops new agent runs while leaving in-flight work to finish. Re-enable
with `gh workflow enable claude.yml`.

**After recovery:**
- File a `post-mortem` ticket
- If the failure mode is generic (quota, token), set a calendar reminder to
  audit before the next 80%-of-quota threshold

---

## Scenario 3 — Rollback failed

**You'll see:**
- A deploy went bad, but the prod URL still shows the broken version
- `release-verify.yml` exited non-zero but didn't actually call
  `vercel rollback` (or the rollback API call failed)

**Diagnose:**

```bash
gh run view --log <run-id>            # the failed release-verify run
vercel ls pulsewatch                  # what's actually live now
vercel inspect <deployment-url>       # state of the broken deploy
```

Common reasons:

1. `VERCEL_TOKEN` secret missing or scope-limited
2. No previous deployment to roll back to (first-ever deploy was bad)
3. Vercel API timeout — try again

**Manual rollback:**

```bash
# 1. Find the last known good deployment
vercel ls pulsewatch --token "$VERCEL_TOKEN" --json | head -200

# 2. Promote it back to production
vercel rollback <good-deployment-url> --token "$VERCEL_TOKEN" --yes

# 3. Verify
curl https://pulsewatch-sigma.vercel.app/api/health
```

**After recovery:**
- Open a high-priority ticket: "release-verify rollback path broken on <date>"
- Treat it as a P0 — the whole autonomous safety net depends on this step

---

## Who to contact

- **Owner:** sabooter@gmail.com (single-engineer project)
- **Discord webhook target:** `#pulsewatch-alerts` (when `DISCORD_WEBHOOK_URL` is set)
- **External dependencies:**
  - Vercel: https://status.vercel.com
  - Turso: https://status.turso.tech
  - GitHub Actions: https://www.githubstatus.com
  - Anthropic (Claude API for the agent): https://status.anthropic.com

## What to write down

Every incident, regardless of severity, gets a `post-mortem` ticket within
24 h. Template:

```markdown
**Timeline (UTC)**
- 14:02 — first sign of trouble (where did you see it?)
- 14:05 — diagnosed cause
- 14:07 — mitigation in place
- 14:12 — fully recovered

**Root cause**
<one paragraph>

**Why we didn't catch it earlier**
<what alerting / smoke test / monitor would have caught this?>

**Follow-ups**
- [ ] <action> — owner — by when
```
