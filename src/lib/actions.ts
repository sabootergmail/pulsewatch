"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./db";
import { audit } from "./audit";
import { runProbeForMonitor } from "./probe";

const monitorSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  url: z.string().url("Must be a valid URL"),
  method: z.enum(["GET", "HEAD", "POST"]).default("GET"),
  expectedStatus: z.coerce.number().int().min(100).max(599).default(200),
  intervalSeconds: z.coerce.number().int().min(10).max(3600).default(60),
  timeoutMs: z.coerce.number().int().min(500).max(30000).default(5000),
});

export async function createMonitor(formData: FormData) {
  const parsed = monitorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const monitor = await prisma.monitor.create({ data: parsed.data });
  await audit({
    action: "monitor.create",
    entityType: "Monitor",
    entityId: monitor.id,
    metadata: parsed.data,
  });
  revalidatePath("/");
  redirect(`/monitors/${monitor.id}`);
}

export async function updateMonitor(id: string, formData: FormData) {
  const parsed = monitorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await prisma.monitor.update({ where: { id }, data: parsed.data });
  await audit({
    action: "monitor.update",
    entityType: "Monitor",
    entityId: id,
    metadata: parsed.data,
  });
  revalidatePath("/");
  revalidatePath(`/monitors/${id}`);
}

export async function deleteMonitor(id: string) {
  await prisma.monitor.delete({ where: { id } });
  await audit({ action: "monitor.delete", entityType: "Monitor", entityId: id });
  revalidatePath("/");
  redirect("/");
}

export async function togglePause(id: string) {
  const m = await prisma.monitor.findUnique({ where: { id } });
  if (!m) return;
  const paused = !m.paused;
  await prisma.monitor.update({
    where: { id },
    data: { paused, status: paused ? "paused" : "unknown" },
  });
  await audit({
    action: paused ? "monitor.pause" : "monitor.resume",
    entityType: "Monitor",
    entityId: id,
  });
  revalidatePath("/");
  revalidatePath(`/monitors/${id}`);
}

export async function probeNow(id: string) {
  await runProbeForMonitor(id);
  revalidatePath("/");
  revalidatePath(`/monitors/${id}`);
}
