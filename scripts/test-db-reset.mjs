// Reset the E2E test database to a known good seed before Playwright runs.
// Idempotent — safe to run repeatedly.

import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const dbPath = "./prisma/test.db";
const url = `file:${dbPath}`;
process.env.DATABASE_URL = url;

if (existsSync(dbPath)) unlinkSync(dbPath);
if (existsSync(`${dbPath}-journal`)) unlinkSync(`${dbPath}-journal`);

console.log(`[test-db-reset] applying migrations to ${dbPath}`);
execSync("npx prisma migrate deploy", { stdio: "inherit" });

console.log("[test-db-reset] seeding minimal fixture");
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

console.log("[test-db-reset] done");
