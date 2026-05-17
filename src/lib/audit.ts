import { prisma } from "./db";

export type AuditAction =
  | "monitor.create"
  | "monitor.update"
  | "monitor.delete"
  | "monitor.pause"
  | "monitor.resume"
  | "incident.open"
  | "incident.resolve"
  | "probe.run"
  | "task.create"
  | "task.update"
  | "task.delete"
  | "task.delegate"
  | "task.complete"
  | "release.request"
  | "release.approve"
  | "release.merge"
  | "release.smoke_pass"
  | "release.smoke_fail"
  | "release.rollback"
  | "rollback.initiated"
  | "rollback.l1_completed"
  | "rollback.l2_completed"
  | "rollback.l3_completed"
  | "rollback.smoke_passed"
  | "rollback.smoke_failed"
  | "rollback.failed"
  | "maintenance.checks_pruned";

export type AuditEntry = {
  action: AuditAction;
  actor?: string;
  entityType?: "Monitor" | "Incident" | "Check" | "Task" | "Release";
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
