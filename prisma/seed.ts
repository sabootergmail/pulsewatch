import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const filename = url.replace(/^file:/, "");
const adapter = new PrismaBetterSqlite3({ url: `file:${filename}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const seeds = [
    { name: "Google", url: "https://www.google.com", intervalSeconds: 60 },
    { name: "GitHub API", url: "https://api.github.com", intervalSeconds: 60 },
    { name: "Example.com", url: "https://example.com", intervalSeconds: 120 },
    {
      name: "Demo: always fails",
      url: "https://this-domain-does-not-exist.invalid",
      intervalSeconds: 60,
      timeoutMs: 3000,
    },
  ];
  for (const s of seeds) {
    const existing = await prisma.monitor.findFirst({ where: { url: s.url } });
    if (existing) continue;
    await prisma.monitor.create({ data: s });
    console.log(`seeded monitor: ${s.name}`);
  }

  const taskSeeds = [
    {
      title: "Export audit log to CSV",
      description:
        "Add a download button on /audit that streams the table as CSV. Use a Route Handler. Keep the same column ordering as the UI.",
      priority: "medium",
    },
    {
      title: "Slack notification on incident open",
      description:
        "When runProbeForMonitor opens a new incident, POST to a configured Slack webhook with monitor name, cause, and a link back to /monitors/[id]. Behind an env var SLACK_WEBHOOK_URL — silent no-op if unset.",
      priority: "high",
    },
    {
      title: "Show monitor by tag",
      description: "Add a tags TEXT column on Monitor (comma-separated) and a filter chip strip on the dashboard.",
      priority: "low",
    },
  ];

  for (const t of taskSeeds) {
    const existing = await prisma.task.findFirst({ where: { title: t.title } });
    if (existing) continue;
    await prisma.task.create({ data: t });
    console.log(`seeded task: ${t.title}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
