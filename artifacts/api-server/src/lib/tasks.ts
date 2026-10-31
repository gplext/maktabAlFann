import {
  db, authAccountsTable, staffMemberTitlesTable, staffTitlesTable, staffTitlePermissionsTable,
  taskTypesTable, tasksTable, taskEventsTable, artworksTable, artistsTable, type Task,
} from "@workspace/db";
import { and, eq, gt, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { decrypt } from "./crypto";
import { sendMessage } from "./notify";

/** Tells a staff member a task is waiting for them (SMS/WhatsApp or email, if configured). */
export async function alertAssignee(accountId: string, title: string, dueAt: Date | null, note = "") {
  try {
    const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, accountId)).limit(1);
    if (!a || a.status !== "active") return;
    const due = dueAt ? ` Due ${dueAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}.` : "";
    const subject = note ? `${note.trim()}: ${title}` : `New task: ${title}`;
    const sent = await sendMessage({ phone: decrypt(a.phoneEnc), email: decrypt(a.emailEnc) },
      subject, `Maktaba Al-Fann — ${note}task for you: "${title}".${due} Open the staff console to handle it.`);
    // No email/SMS keys yet: show the alert in the API window so it can still be checked.
    if (!sent && process.env.NODE_ENV !== "production") logger.info({ to: decrypt(a.fullNameEnc), subject }, "DEV ONLY — task alert (email/SMS not configured)");
  } catch (err) {
    logger.warn({ err }, "Task alert not sent");
  }
}

/**
 * The verification/task engine. Code decides WHEN a task is created (triggers
 * below); the task_types table decides WHO handles it, the SLA and whether it
 * is auto-assigned — editable on the staff Rules tab.
 */
export const OPEN_STATUSES = ["open", "assigned", "in_progress", "needs_info"];
const HIGH_VALUE_PKR = 500_000;

const SEED_TITLES: { name: string; description: string; permissions: string[] }[] = [
  { name: "Framer", description: "Prepares and fits frames for orders", permissions: ["orders.view"] },
  { name: "Glass purchaser", description: "Buys glass/acrylic glazing for frames", permissions: ["orders.view"] },
  { name: "Collage coordinator", description: "Coordinates collage and mixed-media pieces", permissions: ["artworks.view"] },
  { name: "Packer", description: "Packs artwork for delivery", permissions: ["orders.view"] },
  { name: "Photographer", description: "Photographs artworks for listings", permissions: ["artworks.view"] },
  { name: "Courier liaison", description: "Books couriers and tracks shipments", permissions: ["orders.view"] },
  { name: "Authenticity checker", description: "Checks provenance and authenticity", permissions: ["artworks.view", "artworks.approve"] },
];

const SEED_TYPES: { code: string; label: string; trigger: string; requiredRole: string; title?: string; slaHours: number }[] = [
  { code: "artist_verification", label: "Verify new artist", trigger: "A new artist registers and is not auto-verified", requiredRole: "curator", slaHours: 48 },
  { code: "artist_claim_review", label: "Review artist claim", trigger: "Someone claims an existing artist profile", requiredRole: "admin", slaHours: 24 },
  { code: "merge_request_review", label: "Review merge request", trigger: "Someone asks to merge with an artist record", requiredRole: "admin", slaHours: 48 },
  { code: "artwork_review", label: "Review artwork", trigger: "An artist or gallery submits an artwork", requiredRole: "curator", slaHours: 48 },
  { code: "gallery_verification", label: "Verify gallery", trigger: "A new gallery registers", requiredRole: "manager", slaHours: 48 },
  { code: "order_confirmation", label: "Confirm order", trigger: "A new order is placed", requiredRole: "manager", slaHours: 12 },
  { code: "high_value_order", label: "Approve high-value order", trigger: `Order total is PKR ${HIGH_VALUE_PKR.toLocaleString()} or more`, requiredRole: "manager", slaHours: 12 },
  { code: "frame_preparation", label: "Prepare frame", trigger: "An order includes a framed artwork or a frame", requiredRole: "assistant", title: "Framer", slaHours: 72 },
  { code: "glass_purchase", label: "Buy frame glass", trigger: "A frame in the order needs glass", requiredRole: "assistant", title: "Glass purchaser", slaHours: 48 },
  { code: "collage_coordination", label: "Coordinate collage piece", trigger: "Created manually for collage / mixed-media work", requiredRole: "assistant", title: "Collage coordinator", slaHours: 72 },
  { code: "packing", label: "Pack order", trigger: "An order confirmation task is completed", requiredRole: "assistant", title: "Packer", slaHours: 24 },
  { code: "delivery_confirmation", label: "Confirm delivery", trigger: "An order is shipped (checkout phase)", requiredRole: "coordinator", slaHours: 72 },
  { code: "international_order_check", label: "Check international order", trigger: "An international order is placed (checkout phase)", requiredRole: "admin", slaHours: 24 },
  { code: "manual", label: "General task", trigger: "Created by hand on the Tasks page", requiredRole: "assistant", slaHours: 48 },
];

/** Built-in rules the site's code creates tasks for — they can be edited or turned off, not deleted. */
export const SYSTEM_TASK_CODES = new Set(SEED_TYPES.map((t) => t.code));

export async function seedStaffDefaults() {
  try {
    // Artists added from the admin panel used to be saved as "verified", which the public site never shows.
    await db.update(artistsTable).set({ isVerified: "approved" }).where(eq(artistsTable.isVerified, "verified"));
    for (const t of SEED_TITLES) {
      const [row] = await db.insert(staffTitlesTable).values({ name: t.name, description: t.description })
        .onConflictDoNothing().returning();
      if (row) {
        await db.insert(staffTitlePermissionsTable)
          .values(t.permissions.map((permission) => ({ titleId: row.id, permission }))).onConflictDoNothing();
      }
    }
    const titles = await db.select().from(staffTitlesTable);
    const titleId = (name?: string) => (name ? titles.find((t) => t.name === name)?.id ?? null : null);
    await db.insert(taskTypesTable).values(SEED_TYPES.map((t) => ({
      code: t.code, label: t.label, trigger: t.trigger, requiredRole: t.requiredRole,
      requiredTitleId: titleId(t.title), slaHours: t.slaHours,
      autoAssign: t.code === "manual" ? "none" : "least_busy",
    }))).onConflictDoNothing();
  } catch (err) {
    logger.error({ err }, "Staff defaults not seeded");
  }
}

/** Least-busy active account with the right role (and title, if the rule needs one). */
export async function pickAssignee(role: string, titleId: number | null): Promise<string | null> {
  const base = db.select({ id: authAccountsTable.id }).from(authAccountsTable);
  const candidates = titleId
    ? await base.innerJoin(staffMemberTitlesTable, eq(staffMemberTitlesTable.accountId, authAccountsTable.id))
        .where(and(eq(authAccountsTable.role, role), eq(authAccountsTable.status, "active"), eq(staffMemberTitlesTable.titleId, titleId)))
    : await base.where(and(eq(authAccountsTable.role, role), eq(authAccountsTable.status, "active")));
  if (candidates.length === 0) return null;
  const loads = await db.select({ id: tasksTable.assigneeId, n: sql<number>`count(*)::int` }).from(tasksTable)
    .where(and(inArray(tasksTable.assigneeId, candidates.map((c) => c.id)), inArray(tasksTable.status, OPEN_STATUSES)))
    .groupBy(tasksTable.assigneeId);
  const load = new Map(loads.map((l) => [l.id, l.n]));
  return candidates.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]!.id;
}

export async function addTaskEvent(taskId: number, kind: string, message = "", actorId = "system") {
  await db.insert(taskEventsTable).values({ taskId, kind, message, actorId });
}

/** Creates a task from a rule. Never throws — a failed task must not break the user's request. */
export async function createTask(input: {
  typeCode: string; title: string; entityType?: string; entityId?: string | number;
  data?: Record<string, unknown>; createdBy?: string; assigneeId?: string | null;
}): Promise<Task | null> {
  try {
    const [type] = await db.select().from(taskTypesTable).where(eq(taskTypesTable.code, input.typeCode)).limit(1);
    if (!type || !type.active) return null;
    const entityId = input.entityId != null ? String(input.entityId) : null;
    if (input.entityType && entityId) {
      const [dupe] = await db.select().from(tasksTable).where(and(
        eq(tasksTable.typeCode, type.code), eq(tasksTable.entityType, input.entityType),
        eq(tasksTable.entityId, entityId), inArray(tasksTable.status, OPEN_STATUSES))).limit(1);
      if (dupe) return dupe;
    }
    const assigneeId = input.assigneeId !== undefined ? input.assigneeId
      : type.autoAssign === "least_busy" ? await pickAssignee(type.requiredRole, type.requiredTitleId) : null;
    const [task] = await db.insert(tasksTable).values({
      typeCode: type.code, title: input.title.slice(0, 200),
      status: assigneeId ? "assigned" : "open",
      entityType: input.entityType ?? null, entityId,
      assigneeId, requiredRole: type.requiredRole, requiredTitleId: type.requiredTitleId,
      data: input.data ?? {}, createdBy: input.createdBy ?? "system",
      // Both times come from the app clock: the database's own now() can be in a different time zone.
      createdAt: new Date(), updatedAt: new Date(),
      dueAt: new Date(Date.now() + type.slaHours * 3_600_000),
    }).returning();
    await addTaskEvent(task!.id, "created", type.trigger, input.createdBy ?? "system");
    if (assigneeId) {
      await addTaskEvent(task!.id, "assigned", input.assigneeId ? "Assigned by hand" : `Auto-assigned (${type.autoAssign.replace("_", " ")})`, "system");
      void alertAssignee(assigneeId, task!.title, task!.dueAt);
    }
    logger.info({ taskId: task!.id, type: type.code, assigneeId }, "Task created");
    return task!;
  } catch (err) {
    logger.error({ err, typeCode: input.typeCode }, "Task not created");
    return null;
  }
}

// ── Triggers used by existing routes ─────────────────────────────────────────
export async function onOrderCreated(order: { id: number; totalAmount: unknown; contactName?: string | null },
  lines: { artworkId: number | null; title: string }[]) {
  const ref = `Order #${order.id + 10000}${order.contactName ? ` — ${order.contactName}` : ""}`;
  await createTask({ typeCode: "order_confirmation", title: `Confirm ${ref}`, entityType: "order", entityId: order.id });
  if (Number(order.totalAmount) >= HIGH_VALUE_PKR) {
    await createTask({ typeCode: "high_value_order", title: `Approve high-value ${ref}`, entityType: "order", entityId: order.id });
  }
  const artworkIds = lines.map((l) => l.artworkId).filter((x): x is number => x != null);
  const framed = artworkIds.length
    ? await db.select({ id: artworksTable.id, title: artworksTable.title, frameDescription: artworksTable.frameDescription })
        .from(artworksTable).where(and(inArray(artworksTable.id, artworkIds), eq(artworksTable.frameIncluded, true)))
    : [];
  const frameLines = lines.filter((l) => /frame/i.test(l.title));
  if (framed.length || frameLines.length) {
    const items = [...framed.map((f) => f.title), ...frameLines.map((l) => l.title)];
    await createTask({ typeCode: "frame_preparation", title: `Prepare frame for ${ref}`, entityType: "order", entityId: order.id, data: { items } });
  }
  if (framed.some((f) => /glass|glaz|acrylic/i.test(f.frameDescription ?? "")) || lines.some((l) => /glass/i.test(l.title))) {
    await createTask({ typeCode: "glass_purchase", title: `Buy glass for ${ref}`, entityType: "order", entityId: order.id });
  }
}

/** Follow-up rules when a task is completed. */
export async function onTaskDone(task: Task) {
  if (task.typeCode === "order_confirmation" && task.entityId) {
    await createTask({ typeCode: "packing", title: `Pack Order #${Number(task.entityId) + 10000}`, entityType: "order", entityId: task.entityId });
  }
}

/** Overdue tasks get escalated once: flagged, logged, and re-routed to a manager if unassigned. */
export async function escalateOverdue() {
  try {
    const overdue = await db.select().from(tasksTable).where(and(
      lt(tasksTable.dueAt, new Date()), isNull(tasksTable.escalatedAt),
      notInArray(tasksTable.status, ["done", "rejected"])));
    for (const t of overdue) {
      const manager = t.assigneeId ? null : await pickAssignee("manager", null);
      await db.update(tasksTable).set({
        escalatedAt: new Date(), updatedAt: new Date(),
        ...(manager ? { assigneeId: manager, status: "assigned" } : {}),
      }).where(eq(tasksTable.id, t.id));
      await addTaskEvent(t.id, "escalated", manager ? "Overdue — escalated to a manager" : "Overdue");
      const who = manager ?? t.assigneeId;
      if (who) void alertAssignee(who, t.title, t.dueAt, "OVERDUE ");
    }
    if (overdue.length) logger.warn({ count: overdue.length }, "Tasks escalated");
  } catch (err) {
    logger.error({ err }, "Escalation run failed");
  }
}

/** Share of the SLA time left at which a task counts as "due soon" (0.25 = last quarter). */
export const DUE_SOON_SHARE = 0.25;

/** Due soon = not overdue yet, and less than 25% of the rule's SLA hours left. */
export function isDueSoon(t: { dueAt: Date | null; status: string }, slaHours: number | undefined, now = Date.now()): boolean {
  if (!t.dueAt || !slaHours || ["done", "rejected"].includes(t.status)) return false;
  const left = t.dueAt.getTime() - now;
  return left > 0 && left <= slaHours * 3_600_000 * DUE_SOON_SHARE;
}

/** Current SLA hours per rule code. */
export async function slaByType(): Promise<Map<string, number>> {
  const types = await db.select({ code: taskTypesTable.code, slaHours: taskTypesTable.slaHours }).from(taskTypesTable);
  return new Map(types.map((t) => [t.code, t.slaHours]));
}

/** Sends one "due soon" reminder per task to the person it's assigned to. */
export async function remindDueSoon() {
  try {
    // Time maths in JS (not SQL now()) so it is right whatever the database's time zone is.
    const open = await db.select().from(tasksTable).where(and(
      isNotNull(tasksTable.assigneeId), gt(tasksTable.dueAt, new Date()), notInArray(tasksTable.status, ["done", "rejected"]),
      sql`not exists (select 1 from ${taskEventsTable} e where e.task_id = ${tasksTable.id} and e.kind = 'due_soon')`));
    const sla = await slaByType();
    const rows = open.filter((t) => isDueSoon(t, sla.get(t.typeCode)));
    for (const t of rows) {
      await addTaskEvent(t.id, "due_soon", "Due soon — reminder sent");
      void alertAssignee(t.assigneeId!, t.title, t.dueAt, "REMINDER — due soon ");
    }
    if (rows.length) logger.info({ count: rows.length }, "Due-soon reminders sent");
  } catch (err) {
    logger.error({ err }, "Due-soon reminder run failed");
  }
}

/**
 * When staff decide something on a review screen (approve an artwork, verify a gallery…), the open
 * task for that item is closed automatically so nobody works on it twice.
 */
export async function closeEntityTasks(entityType: string, entityId: string | number, outcome: string, actorId = "system") {
  try {
    const rows = await db.update(tasksTable)
      .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasksTable.entityType, entityType), eq(tasksTable.entityId, String(entityId)),
        notInArray(tasksTable.status, ["done", "rejected"])))
      .returning({ id: tasksTable.id });
    for (const r of rows) await addTaskEvent(r.id, "status", `done — closed automatically: ${outcome}`, actorId);
  } catch (err) {
    logger.warn({ err, entityType, entityId }, "Related task not closed");
  }
}

let started = false;
export function startTaskScheduler() {
  if (started) return;
  started = true;
  void seedStaffDefaults();
  setInterval(() => { void escalateOverdue(); void remindDueSoon(); }, 15 * 60_000).unref();
  setTimeout(() => void remindDueSoon(), 30_000).unref();
}
