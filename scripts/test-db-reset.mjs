// Reset the E2E test database to a known good seed before Playwright runs.
// Idempotent — safe to run repeatedly.

import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const dbPath = "./prisma/test.db";
const url = `file:${dbPath}`;
process.env.DATABASE_URL = url;
// Signal to prisma/seed.ts that this is a test fixture — skip external
// Monitor seeds so /api/probe doesn't cascade through 4 timeouts under
// Turbopack dev workers (see comment in prisma/seed.ts).
process.env.E2E_SEED = "1";
// Re-enable the demo task/release/release_approval seeds for tests — the
// task-lifecycle spec asserts on the seeded "Release: dark mode toggle"
// release_approval ticket. Production deploys keep the default (no seeds).
process.env.SEED_DEMO_TASKS = "1";

if (existsSync(dbPath)) unlinkSync(dbPath);
if (existsSync(`${dbPath}-journal`)) unlinkSync(`${dbPath}-journal`);

console.log(`[test-db-reset] applying migrations to ${dbPath}`);
execSync("npx prisma migrate deploy", { stdio: "inherit" });

console.log("[test-db-reset] seeding minimal fixture (E2E_SEED=1)");
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });

console.log("[test-db-reset] done");
