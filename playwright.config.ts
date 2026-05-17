import { defineConfig, devices } from "@playwright/test";

// E2E config per pozadavky #7.
// - Boots `npm run dev` against a separate test DB file (./prisma/test.db) so
//   tests don't trample the dev seed.
// - Chromium-only for MVP (multi-browser is stretch).
// - HTML report uploaded as a CI artifact when the e2e job is enabled.
//
// To run locally:
//   npm run e2e

const PORT = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false, // serialized — single dev server + shared SQLite test DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "node scripts/test-db-reset.mjs && next dev --port " + PORT,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      PROBE_SECRET: "e2e-secret",
      TICKETS_API_TOKEN: "e2e-token",
      NODE_ENV: "development",
      // Per src/middleware.ts: bypass NextAuth in dev test runs so the
      // existing Playwright suite doesn't need an OAuth dance. Gated on
      // NODE_ENV!=production in middleware, so this can't accidentally
      // leak into Vercel prod.
      E2E_AUTH_BYPASS: "1",
      // Stubs so NextAuth can initialise without real credentials.
      AUTH_SECRET: "e2e-test-secret-not-for-prod",
      AUTH_GITHUB_ID: "e2e-stub",
      AUTH_GITHUB_SECRET: "e2e-stub",
      ALLOWED_GITHUB_LOGINS: "e2e-tester",
    },
  },
});
