-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'task',
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assignedTo" TEXT,
    "githubIssueUrl" TEXT,
    "githubPrUrl" TEXT,
    "githubPrNumber" INTEGER,
    "previewUrl" TEXT,
    "summary" TEXT,
    "relatedTaskId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "rolledBackAt" DATETIME,
    "rollbackReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);
INSERT INTO "new_Task" ("assignedTo", "completedAt", "createdAt", "description", "githubIssueUrl", "githubPrUrl", "id", "priority", "status", "title", "updatedAt") SELECT "assignedTo", "completedAt", "createdAt", "description", "githubIssueUrl", "githubPrUrl", "id", "priority", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_type_idx" ON "Task"("type");
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");
CREATE INDEX "Task_relatedTaskId_idx" ON "Task"("relatedTaskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
