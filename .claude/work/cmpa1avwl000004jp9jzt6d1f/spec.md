# Spec: incident BEECEPTOR_HOOK

**Ticket:** `cmpa1avwl000004jp9jzt6d1f` · **Release impact:** minor

## Problem

When PulseWatch opens a new incident it currently notifies Discord but has no mechanism to push a structured JSON payload to an external test endpoint. Teams using Beeceptor (or similar HTTP inspection tools) need a fire-and-forget webhook so they can observe incident.open events without wiring up Discord. The feature must be silent when the env var is absent so existing deployments are unaffected.

## Scope (in)

- Add a `notifyBeeceptor()` function inside `src/lib/notify.ts` that POSTs the specified JSON payload to `BEECEPTOR_HOOK_URL` with a 3-second `AbortController` timeout.
- Call `notifyBeeceptor()` from `runProbeForMonitor` in `src/lib/probe.ts` immediately after the existing `notify("incident.open", …)` call, passing the freshly created incident and monitor data.
- Add `"incident.webhook_sent"` to the `AuditAction` union in `src/lib/audit.ts`, and call `audit({ action: "incident.webhook_sent", … })` inside `notifyBeeceptor()` only on HTTP 2xx.
- On non-2xx response or timeout/network error, log a `log.warn(…)` via `src/lib/log.ts` and return without throwing — incident processing must not fail because of a webhook failure.
- Env var absent → immediate no-op, no fetch call.

## Scope (out)

- `incident.resolve` webhook — only `incident.open` in this PR.
- Retry logic or queue — fire-and-forget is sufficient for v1.
- HMAC/signature — Beeceptor is a test endpoint; no auth needed.
- Other notification sinks (Slack, PagerDuty, etc.).
- Changes to the Discord notify path.

## Touched files

- `src/lib/notify.ts` — add exported `notifyBeeceptor(monitor, incident)` function; no changes to existing `notify()` signature.
- `src/lib/probe.ts` — import and call `notifyBeeceptor` in the `up→down` branch after `notify("incident.open", …)`.
- `src/lib/audit.ts` — add `"incident.webhook_sent"` to the `AuditAction` union type.
- `tests/notify-beeceptor.test.ts` — new Vitest spec (see Test plan).

## Acceptance Criteria

**Scenario:** Env var not set — no fetch call issued

- **Given** `BEECEPTOR_HOOK_URL` is unset
- **When** `notifyBeeceptor()` is called with any monitor/incident
- **Then** `fetch` is never called and the function resolves without error

**Scenario:** Env var set — correct URL and payload sent

- **Given** `BEECEPTOR_HOOK_URL` is set to `https://app.beeceptor.com/test-hook`
- **When** `notifyBeeceptor()` is called with a monitor `{ id: "m1", name: "API", url: "https://api.test" }` and an incident `{ id: "inc-1", cause: "HTTP 500", startedAt: <Date> }`
- **Then** `fetch` is called once with method `POST`, `Content-Type: application/json`, and a body matching:
  ```json
  {
    "event": "incident.open",
    "monitor": { "id": "m1", "name": "API", "url": "https://api.test" },
    "incident": { "id": "inc-1", "cause": "HTTP 500", "startedAt": "<ISO string>" },
    "timestamp": "<ISO string>"
  }
  ```

**Scenario:** Env var set — 2xx response → audit log written

- **Given** `BEECEPTOR_HOOK_URL` is set and fetch resolves with HTTP 200
- **When** `notifyBeeceptor()` completes
- **Then** `audit` is called once with `action: "incident.webhook_sent"` and no error is thrown

**Scenario:** Non-2xx response — warning logged, no throw

- **Given** `BEECEPTOR_HOOK_URL` is set and fetch resolves with HTTP 500
- **When** `notifyBeeceptor()` completes
- **Then** `log.warn` is called, `audit` is NOT called, and no exception propagates to the caller

**Scenario:** Timeout — warning logged, no throw

- **Given** `BEECEPTOR_HOOK_URL` is set and fetch never resolves within 3 000 ms
- **When** the 3-second `AbortController` timeout fires
- **Then** `log.warn` is called and no exception propagates to the caller

## Test plan

- Unit tests at `tests/notify-beeceptor.test.ts` using the pattern established in `tests/probe-state-machine.test.ts` (vi.mock for `../src/lib/audit` and `../src/lib/log`; mock `globalThis.fetch`):
  - `it("Given BEECEPTOR_HOOK_URL is unset, when notifyBeeceptor is called, then fetch is not called")`
  - `it("Given BEECEPTOR_HOOK_URL is set, when notifyBeeceptor is called, then fetch receives the correct URL and payload")`
  - `it("Given BEECEPTOR_HOOK_URL is set and fetch returns 2xx, when notifyBeeceptor resolves, then audit is called with incident.webhook_sent")`
  - `it("Given BEECEPTOR_HOOK_URL is set and fetch returns non-2xx, when notifyBeeceptor resolves, then log.warn is called and audit is not called")`
  - `it("Given BEECEPTOR_HOOK_URL is set and fetch times out, when the AbortController fires, then log.warn is called and no error is thrown")`
- Manual smoke step: set `BEECEPTOR_HOOK_URL=https://app.beeceptor.com/<your-endpoint>` in `.env.local`, start `next dev`, trigger a probe failure via `curl -s http://localhost:3000/api/probe` against a monitor pointing at a downed URL, and confirm the request appears in the Beeceptor dashboard.
