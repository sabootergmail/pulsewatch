# Testing strategy

Per pozadavky #7: **E2E-first inverted pyramid**. Cover the critical paths
end-to-end; use unit tests for state-machine invariants and pure functions
that E2E can't see clearly.

## Layers

```
        ┌─────────────────────────────┐
        │   E2E (Playwright)          │  ← UI + server actions + DB
        ├─────────────────────────────┤
        │   API / Integration         │  ← route handlers, auth contracts
        ├─────────────────────────────┤
        │   Unit (state, invariants)  │  ← pure functions, state machines
        └─────────────────────────────┘
```

## What's in the suite today

### E2E (Playwright, Chromium)

Run: `npm run e2e` (boots `next dev` against `./prisma/test.db`).

| Scenario file                       | Covers                                                            |
|-------------------------------------|-------------------------------------------------------------------|
| `e2e/task-lifecycle.spec.ts`        | Create-task happy path; release_approval gate button visibility   |

### Unit / integration (Vitest)

Run: `npm test`.

| File                                  | Covers                                                       |
|---------------------------------------|--------------------------------------------------------------|
| `tests/probe.test.ts`                 | `probe()` HTTP contract: success / wrong status / network error / timeout |
| `tests/probe-state-machine.test.ts`   | `runProbeForMonitor` incident transitions: ok→ok, ok→down, down→down, down→up, paused |
| `tests/api-tickets.test.ts`           | `/api/tickets` Bearer-token auth contract + body validation  |

Coverage:

```bash
npm run test:coverage
# HTML report at ./coverage/index.html
```

Coverage is reported, **not gated** — the target is "every critical path
has a named test", not a percentage.

## Gaps (planned per #7, not yet built)

| Layer | Scenario                                  | Status |
|-------|-------------------------------------------|--------|
| E2E   | Monitor lifecycle (create + probe + audit) | TODO — needs a local mock HTTP server in setup so probes don't hit the real internet |
| E2E   | Incident open/close (mocked endpoint 500→200) | TODO — same setup as above |
| E2E   | Full ticket → release_approval flow (via REST mocks) | TODO |
| E2E   | Autonomous rollback path                  | TODO |
| Integ | `/api/probe` auth + idempotence           | TODO |
| Integ | `/api/health` 503 path when DB unreachable | TODO |
| Unit  | Audit log append-only invariant           | TODO (would require Prisma middleware or DB-level CHECK) |
| Unit  | `getAgentStats` against seeded fixture    | TODO |

Each TODO is a delegate-to-Claude candidate — a self-contained ticket that
would round-trip cleanly through the agent pipeline.

## How tests map to the BDD convention

Every test name is `Given <X>, when <Y>, then <Z>` to match the
`## Acceptance Criteria` format the Architect produces in `spec.md`. When
the Reviewer compares the diff to the spec, the name-match is the
mechanical part of the audit.

```ts
describe("Given a healthy monitor with no open incident", () => {
  it("When probe returns 500, then a new incident is opened", async () => { ... });
});
```

## CI

`.github/workflows/ci.yml` runs two jobs:

- **unit** — fast, blocking. Lint, Vitest, build.
- **e2e** — slower, opt-in via `vars.RUN_E2E=1`. Playwright + Chromium.
  Uploads HTML report on failure.

The split exists so a tightening Anthropic Max quota doesn't block CI on
every PR — flip the var when you want a full run.

## How to debug a failing E2E

```bash
npm run e2e -- --debug                 # opens Playwright Inspector
npm run e2e -- --ui                    # interactive watch mode
npx playwright show-report             # last HTML report
```

Traces and screenshots are captured automatically on failure
(`use.trace = "retain-on-failure"` in `playwright.config.ts`).
