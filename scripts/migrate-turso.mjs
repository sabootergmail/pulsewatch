#!/usr/bin/env node
// One-shot: apply all Prisma migrations to a fresh Turso DB.
//
// Prisma 7's `migrate deploy` doesn't directly speak libsql over HTTP, so
// for a one-time bootstrap we use @libsql/client to execute each migration
// .sql file in order. Idempotency is not guaranteed — only run against an
// empty DB.
//
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-turso.mjs

import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
  process.exit(2);
}

const client = createClient({ url, authToken });

// Drop any partial state from prior failed runs.
console.error("dropping any existing tables…");
const existing = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE '_libsql%'",
);
for (const row of existing.rows) {
  const name = row.name;
  console.error(`  drop ${name}`);
  await client.execute(`DROP TABLE IF EXISTS "${name}"`);
}

function splitStatements(sql) {
  // Strip leading -- comments from each candidate statement so they aren't
  // accidentally filtered out by a startsWith("--") check, and so PRAGMAs
  // adjacent to comments still execute.
  return sql
    .split(/;\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

const migrationsDir = "prisma/migrations";
const dirs = readdirSync(migrationsDir)
  .filter((d) => statSync(join(migrationsDir, d)).isDirectory())
  .sort();

for (const dir of dirs) {
  const sqlPath = join(migrationsDir, dir, "migration.sql");
  let sql;
  try {
    sql = readFileSync(sqlPath, "utf8");
  } catch {
    console.error(`  skip ${dir} (no migration.sql)`);
    continue;
  }
  console.error(`applying ${dir}…`);
  for (const stmt of splitStatements(sql)) {
    try {
      await client.execute(stmt);
    } catch (err) {
      console.error(`  failed on: ${stmt.slice(0, 80)}…`);
      throw err;
    }
  }
  console.error(`  ✓ ${dir}`);
}

console.error("done — schema applied");
process.exit(0);
