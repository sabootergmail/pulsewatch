import { prisma } from "./db";

export type AuditAction =
  | "monitor.create"
  | "monitor.update"
  | "monitor.delete"
  | "monitor.pause"
  | "monitor.resume"
  | "incident.open"
  | "incident.resolve"
  | "probe.run";

export type AuditEntry = {
  action: AuditAction;
  actor?: string;
  entityType?: "Monitor" | "Incident" | "Check";
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function audit(entry: AuditEntry) {
  await prisma.auditLog.create({
    data: {
      action: entry.action,
      actor: entry.actor ?? "system",
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
  });
}
