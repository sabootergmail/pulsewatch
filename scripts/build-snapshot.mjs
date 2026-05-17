// Build a seeded SQLite snapshot that ships with the deployment.
// At runtime on Vercel, lib/db.ts copies this into /tmp on cold start so the
// dashboard has something to show. Writes in prod don't persist beyond a
// function-instance lifetime, but the snapshot keeps the UI honest.
import { execSync } from "node:child_process";
import { existsSync, unlinkSync, copyFileSync } from "node:fs";

const snapshotPath = "prisma/snapshot.db";
const workPath = "prisma/build-snapshot.db";

if (existsSync(workPath)) unlinkSync(workPath);

process.env.DATABASE_URL = `file:./${workPath.replace(/\\/g, "/")}`;

execSync("npx prisma migrate deploy", { stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

if (existsSync(snapshotPath)) unlinkSync(snapshotPath);
copyFileSync(workPath, snapshotPath);
unlinkSync(workPath);

console.log(`✓ Built ${snapshotPath}`);
