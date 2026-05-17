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
    console.log(`seeded: ${s.name}`);
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
