-- AlterTable
ALTER TABLE "Task" ADD COLUMN "rollbackLevel" TEXT;
ALTER TABLE "Task" ADD COLUMN "rollbackScope" TEXT;
ALTER TABLE "Task" ADD COLUMN "rollbackTargetId" TEXT;

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "gitSha" TEXT NOT NULL,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'live',
    "vercelDeployUrl" TEXT NOT NULL,
    "sourceTaskId" TEXT,
    "smokeTestStatus" TEXT
);

-- CreateIndex
CREATE INDEX "Release_deployedAt_idx" ON "Release"("deployedAt");

-- CreateIndex
CREATE INDEX "Release_status_idx" ON "Release"("status");
