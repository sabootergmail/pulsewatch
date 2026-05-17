-- CreateTable
CREATE TABLE "Monitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "expectedStatus" INTEGER NOT NULL DEFAULT 200,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastCheckedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Check_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "cause" TEXT,
    "summary" TEXT,
    CONSTRAINT "Incident_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Monitor_status_idx" ON "Monitor"("status");

-- CreateIndex
CREATE INDEX "Check_monitorId_checkedAt_idx" ON "Check"("monitorId", "checkedAt");

-- CreateIndex
CREATE INDEX "Incident_monitorId_status_idx" ON "Incident"("monitorId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
