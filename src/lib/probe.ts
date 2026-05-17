import { prisma } from "./db";
import { audit } from "./audit";
import { notify, notifyBeeceptor } from "./notify";
import { logWith } from "./log";

export type ProbeResult = {
  ok: boolean;
  httpStatus?: number;
  latencyMs: number;
  error?: string;
};

export async function probe(
  url: string,
  opts: { method?: string; expectedStatus?: number; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const method = opts.method ?? "GET";
  const expected = opts.expectedStatus ?? 200;
  const timeout = opts.timeoutMs ?? 5000;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "PulseWatch/1.0 (+https://github.com/sabootergmail/pulsewatch)" },
    });
    const latencyMs = Date.now() - started;
    return { ok: res.status === expected, httpStatus: res.status, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timed out after ${timeout}ms`
          : err.message
        : "Unknown error";
    return { ok: false, latencyMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a probe against a single monitor, persist the Check, and open/resolve
 * an incident if the status changed. Returns the new monitor status.
 */
export async function runProbeForMonitor(monitorId: string) {
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);
  if (monitor.paused) return { status: "paused" as const };

  const result = await probe(monitor.url, {
    method: monitor.method,
    expectedStatus: monitor.expectedStatus,
    timeoutMs: monitor.timeoutMs,
  });

  const newStatus = result.ok ? "up" : "down";

  await prisma.check.create({
    data: {
      monitorId: monitor.id,
      status: newStatus,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      error: result.error,
    },
  });

  // Find the currently open incident (if any)
  const openIncident = await prisma.incident.findFirst({
    where: { monitorId: monitor.id, status: "open" },
  });

  if (newStatus === "down" && !openIncident) {
    const incident = await prisma.incident.create({
      data: {
        monitorId: monitor.id,
        cause: result.error ?? `HTTP ${result.httpStatus} (expected ${monitor.expectedStatus})`,
        summary: `${monitor.name} is down`,
      },
    });
    await audit({
      action: "incident.open",
      entityType: "Incident",
      entityId: incident.id,
      metadata: { monitorId: monitor.id, cause: incident.cause },
    });
    logWith({ event: "incident.open", monitor_id: monitor.id, incident_id: incident.id }).warn(
      { cause: incident.cause },
      "incident opened",
    );
    await notify("incident.open", {
      title: `🔴 ${monitor.name} is down`,
      description: incident.cause ?? "(no cause recorded)",
      url: monitor.url,
      fields: [
        { name: "Expected", value: `${monitor.method} → ${monitor.expectedStatus}` },
        { name: "Got", value: result.httpStatus ? `HTTP ${result.httpStatus}` : "no response" },
      ],
    });
    await notifyBeeceptor(monitor, incident);
  } else if (newStatus === "up" && openIncident) {
    await prisma.incident.update({
      where: { id: openIncident.id },
      data: { status: "resolved", resolvedAt: new Date() },
    });
    await audit({
      action: "incident.resolve",
      entityType: "Incident",
      entityId: openIncident.id,
      metadata: { monitorId: monitor.id },
    });
    logWith({ event: "incident.resolve", monitor_id: monitor.id, incident_id: openIncident.id }).info(
      "incident resolved",
    );
    await notify("incident.resolve", {
      title: `🟢 ${monitor.name} recovered`,
      description: `Resolved after ${Math.round((Date.now() - openIncident.startedAt.getTime()) / 1000)}s`,
      url: monitor.url,
    });
  }

  await prisma.monitor.update({
    where: { id: monitor.id },
    data: { status: newStatus, lastCheckedAt: new Date() },
  });

  return { status: newStatus, latencyMs: result.latencyMs, httpStatus: result.httpStatus };
}

/**
 * Run probes for every non-paused monitor whose interval has elapsed
 * (or which has never been checked).
 */
export async function runDueProbes() {
  const now = Date.now();
  const monitors = await prisma.monitor.findMany({ where: { paused: false } });
  const due = monitors.filter((m) => {
    if (!m.lastCheckedAt) return true;
    return now - m.lastCheckedAt.getTime() >= m.intervalSeconds * 1000;
  });

  const results = [];
  for (const m of due) {
    try {
      const r = await runProbeForMonitor(m.id);
      results.push({ monitorId: m.id, ...r });
    } catch (err) {
      results.push({
        monitorId: m.id,
        status: "error" as const,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  await audit({
    action: "probe.run",
    metadata: { checked: results.length, total: monitors.length },
  });

  return results;
}
