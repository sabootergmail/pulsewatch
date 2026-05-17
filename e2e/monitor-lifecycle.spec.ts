import { test, expect } from "@playwright/test";

/**
 * E2E: monitor lifecycle (pozadavky #7 scénář 1, #9 item 4).
 *
 *   Given an empty dashboard (well, plus the seed)
 *   When the user creates a monitor for http://localhost:3000/api/health
 *        and triggers "Probe now"
 *   Then the monitor appears with status "up", a non-zero latency, and
 *        the audit log contains monitor.create + probe.run entries.
 *
 * The clever bit: the monitor targets pulsewatch itself. Playwright's
 * webServer already boots the dev server at port 3000, so the probe has a
 * reachable, deterministic, network-free target — no mock HTTP server in
 * the test setup, no flakiness from third-party uptime.
 */

test.describe("Monitor lifecycle", () => {
  test("Given a fresh monitor, when probed, then status=up, latency is recorded, and audit log captures both events", async ({
    page,
  }) => {
    const monitorName = `E2E self-monitor ${Date.now()}`;
    const targetUrl = "http://localhost:3000/api/health";

    // 1. Create the monitor through the UI.
    await page.goto("/monitors/new");
    await expect(page.getByRole("heading", { name: "New monitor" })).toBeVisible();
    await page.locator("input[name=name]").fill(monitorName);
    await page.locator("input[name=url]").fill(targetUrl);
    await page.locator("input[name=intervalSeconds]").fill("60");
    await page.getByRole("button", { name: "Create monitor" }).click();

    // The createMonitor action redirects to /monitors/<id>.
    await expect(page).toHaveURL(/\/monitors\/[^/]+$/);
    await expect(page.getByRole("heading", { name: monitorName })).toBeVisible();

    // 2. Trigger a probe via the same cron endpoint Vercel hits in prod.
    //    Using `/api/probe` (not the "Probe now" button) goes through
    //    runDueProbes, which writes a `probe.run` audit row at the end —
    //    that's the event we want to assert downstream.
    const probeRes = await page.request.post(
      "http://localhost:3000/api/probe",
      { headers: { Authorization: "Bearer e2e-secret" } },
    );
    expect(probeRes.status()).toBe(200);
    await page.reload();

    // 3. After probe: status badge in the header renders "Operational" (the
    //    user-facing label for status="up" — see StatusBadge.tsx).
    await expect(
      page.locator("header").getByText("Operational").first(),
    ).toBeVisible({ timeout: 10_000 });

    // The latency sparkline caption surfaces the check count — looking for
    //  "Latency · last N checks" with N >= 1 is the cleanest assertion.
    await expect(page.getByText(/Latency.*last [1-9]\d* checks/)).toBeVisible();

    // 4. The audit log contains monitor.create AND probe.run.
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

    // Most recent entries are at the top — both should be among the first ~50.
    const table = page.locator("table");
    await expect(table.locator("td", { hasText: "monitor.create" }).first()).toBeVisible();
    await expect(table.locator("td", { hasText: "probe.run" }).first()).toBeVisible();
  });
});
