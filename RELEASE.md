# Release process

## Normal release path (agent-driven)

```
ticket created
  → Architect writes .claude/work/<id>/spec.md (BDD acceptance criteria)
  → Implementer codes + tests + bumps CHANGELOG + opens PR
  → Reviewer writes review.md (approve | request changes)
  → Orchestrator creates release_approval ticket (PR link + preview deploy)
  → user clicks "Approve & deploy" in PulseWatch  ← ONLY human step
  → Release/Ops merges PR, waits for Vercel deploy, runs smoke test
      ├─ ✅ tags vX.Y.Z, publishes GitHub Release, closes original ticket
      └─ ❌ vercel rollback, audit log, rollback_executed ticket
```

## Semver bumping

Default bump is **patch**. The Architect can override in `spec.md`:

```markdown
**Release impact:** minor   # or "major"
```

Implementer reads this when updating `CHANGELOG.md` and `package.json`.

| Change                                              | Bump  |
|-----------------------------------------------------|-------|
| Bug fix, copy change, internal refactor             | patch |
| New feature, new field on an existing model         | minor |
| Breaking API/schema change, env-var rename, removal | major |

## What Release/Ops does on a successful smoke test

1. `npm version <bump> --no-git-tag-version` — updates `package.json`
2. Edits `CHANGELOG.md`: moves `[Unreleased]` content under a new versioned
   section dated today (UTC).
3. Commits `chore(release): vX.Y.Z`.
4. `git tag vX.Y.Z && git push --tags`.
5. `gh release create vX.Y.Z --generate-notes`.
6. Audit log entries: `release.merge`, `release.tag`, `release.smoke_pass`.

## Hotfix path (bypass the agent pipeline)

Only for **emergency production incidents** where the agent loop would be too
slow. Use this sparingly — every hotfix creates a follow-up obligation.

1. Open a branch directly off `main`: `git checkout -b hotfix/<short-name>`.
2. Make the minimum change. **No agent involvement.**
3. PR with `hotfix` label and a one-line description.
4. **A human reviewer is required** — no auto-merge for hotfixes.
5. After merge, the existing `release-verify.yml` workflow still runs and
   will autonomous-rollback if the smoke test fails. Don't disable it.
6. **Post-mortem ticket is mandatory.** File a `bug` ticket in PulseWatch
   within 24 h with the heading `Post-mortem: <hotfix>`. Cover: timeline,
   root cause, why the agent pipeline couldn't handle it, follow-ups.

## Rolling back manually (last resort)

Only if `release-verify.yml` somehow doesn't run or doesn't succeed in
rolling back:

```bash
vercel ls pulsewatch --token "$VERCEL_TOKEN"
vercel rollback <previous-deployment-url> --token "$VERCEL_TOKEN" --yes
```

Then file a `rollback` ticket and tag a runbook follow-up.

## How releases relate to PulseWatch's audit log

Every step above is also captured as an `AuditLog` row with one of:
`release.request`, `release.approve`, `release.merge`, `release.smoke_pass`,
`release.smoke_fail`, `release.rollback`. The audit log is the source of
truth — if a release artifact (tag / changelog entry / ticket) is missing,
the audit log tells you which step skipped.
