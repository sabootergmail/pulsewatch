import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const tables = await c.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log("Tables in Turso:");
for (const r of tables.rows) console.log("  - " + r.name);

const audit = await c.execute('SELECT COUNT(*) as n FROM "AuditLog"');
console.log(`AuditLog rows: ${audit.rows[0].n}`);

const monitor = await c.execute('SELECT COUNT(*) as n FROM "Monitor"');
console.log(`Monitor rows: ${monitor.rows[0].n}`);
