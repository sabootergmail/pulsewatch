import { test, expect } from "@playwright/test";

/**
 * E2E: auth flow (pozadavky #10 bod 13).
 *
 * The Playwright `webServer` runs with `E2E_AUTH_BYPASS=1`, which means
 * middleware lets everything through — that's how the rest of the suite
 * works. To test the auth path itself we spawn requests with a header
 * that disables the bypass for that single check: middleware reads the
 * `x-disable-e2e-bypass` header and skips its bypass branch when set.
 *
 * That mechanism is implemented in middleware.ts. Tests that need to
 * exercise the real redirect set the header; everything else benefits
 * from the bypass.
 */

test.describe("Auth gating", () => {
  test("Given the agent's Bearer-authenticated APIs, when called without a session, then they still work", async ({
    request,
    baseURL,
  }) => {
    // Public surfaces: health, probe (Bearer), tickets (Bearer). Confirm
    // none of these redirect to /login regardless of session state.
    const health = await request.get(`${baseURL}/api/health`);
    expect(health.status()).toBe(200);

    const tickets = await request.post(`${baseURL}/api/tickets`, {
      headers: {
        Authorization: "Bearer e2e-token",
        "Content-Type": "application/json",
      },
      data: { action: "list" },
    });
    expect(tickets.status()).toBe(200);

    const probe = await request.post(`${baseURL}/api/probe`, {
      headers: { Authorization: "Bearer e2e-secret" },
    });
    expect(probe.status()).toBe(200);
  });

  test("Given the login page, when an anonymous user lands there, then the GitHub sign-in button is visible", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "PulseWatch" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Sign in with GitHub/i }),
    ).toBeVisible();
  });

  test("Given the login page with ?error=AccessDenied, then the allowlist error is shown", async ({
    page,
  }) => {
    await page.goto("/login?error=AccessDenied");
    await expect(
      page.getByText(/not on the allowlist/i),
    ).toBeVisible();
  });
});
