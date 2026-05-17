import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const filename = url.replace(/^file:/, "");
const adapter = new PrismaBetterSqlite3({ url: `file:${filename}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  // E2E_SEED=1 (set by scripts/test-db-reset.mjs) skips external monitor seeds.
  // Reason: Playwright's monitor-lifecycle spec POSTs /api/probe, which runs
  // runDueProbes() against every non-paused monitor. With 4 external URLs in
  // the seed, that cascade of 3–5s fetches under Next.js dev (Turbopack)
  // exhausts the SWC worker pool and renders runtime errors. Tests want a
  // single-monitor universe so they can probe exactly the one they created.
  const isE2E = process.env.E2E_SEED === "1";

  const seeds = isE2E
    ? []
    : [
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

  // Task / release / release_approval seeds suppressed by default — the demo
  // works better with a clean kanban that the user fills via real agent runs.
  // Set SEED_DEMO_TASKS=1 locally to re-enable.
  if (process.env.SEED_DEMO_TASKS !== "1") {
    console.log("skipping task/release demo seeds (SEED_DEMO_TASKS != 1)");
    return;
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

  const releaseSeeds = [
    {
      version: "0.2.0",
      gitSha: "de97221b3e4c5a8d9f1027a5c98b1e7d3a82f49d",
      vercelDeployUrl: "https://pulsewatch-de97221-sabooter-7360s-projects.vercel.app",
      status: "live",
      smokeTestStatus: "passed",
    },
    {
      version: "0.1.0",
      gitSha: "94d28080a7c1b8e0a7f2d3b9c4e6a8d5f3df99de",
      vercelDeployUrl: "https://pulsewatch-94d2808-sabooter-7360s-projects.vercel.app",
      status: "previous",
      smokeTestStatus: "passed",
      deployedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 h ago
    },
  ];
  for (const r of releaseSeeds) {
    const existing = await prisma.release.findFirst({ where: { version: r.version } });
    if (existing) continue;
    await prisma.release.create({ data: r });
    console.log(`seeded release: v${r.version}`);
  }

  const demoReleaseTitle = "Release: dark mode toggle";
  const existingRelease = await prisma.task.findFirst({ where: { title: demoReleaseTitle } });
  if (!existingRelease) {
    await prisma.task.create({
      data: {
        type: "release_approval",
        title: demoReleaseTitle,
        summary:
          "Adds a sun/moon icon in the header that toggles dark mode. Tested locally; CI green; preview deployed.",
        status: "ready_for_release",
        priority: "high",
        assignedTo: "agent:claude",
        githubPrUrl: "https://github.com/sabootergmail/pulsewatch/pull/1",
        githubPrNumber: 1,
        previewUrl: "https://pulsewatch-git-dark-mode-sabooter-7360s-projects.vercel.app",
      },
    });
    console.log(`seeded release_approval: ${demoReleaseTitle}`);
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
