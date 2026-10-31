import { Router, type IRouter } from "express";
import {
  db, authAccountsTable, authEventsTable, staffTitlesTable, staffTitlePermissionsTable, staffMemberTitlesTable,
  taskTypesTable, tasksTable, taskEventsTable, TASK_STATUSES,
} from "@workspace/db";
import { and, desc, eq, gt, gte, inArray, lt, lte, notInArray, sql, type SQL } from "drizzle-orm";
import { decrypt, hashPassword } from "../lib/crypto";
import { revokeSessions } from "../lib/auth";
import { createAccount, findByIdentifier, parseIdentifier, passwordProblem } from "./auth";
import {
  PERMISSIONS, LEVEL_PERMISSIONS, STAFF_ROLES,
  getStaffContext, requirePermission, canManageRole, type StaffContext,
} from "../lib/permissions";
import { addTaskEvent, alertAssignee, createTask, onTaskDone, startTaskScheduler, OPEN_STATUSES, SYSTEM_TASK_CODES, isDueSoon, slaByType } from "../lib/tasks";

/** Staff console API: roles matrix, team, titles, tasks and automation rules. */
const router: IRouter = Router();

/** Rejects non-numeric :id params with 404 instead of a database error. */
router.param("id", (req, res, next, value) => {
  if (!/^\d{1,9}$/.test(String(value)) && !String(value).startsWith("u_")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});
startTaskScheduler();

const PERMISSION_KEYS = new Set<string>(PERMISSIONS.map((p) => p.key));
const staffOf = (req: any) => req.staff as StaffContext;

// ── Who am I ─────────────────────────────────────────────────────────────────
router.get("/staff/me", async (req, res) => {
  const ctx = await getStaffContext(req);
  if (!ctx) return res.status(401).json({ error: "Unauthorized" });
  res.json({ id: ctx.id, role: ctx.role, titles: ctx.titles, permissions: [...ctx.permissions] });
});

// ── Roles page data ──────────────────────────────────────────────────────────
router.get("/staff/catalog", requirePermission("staff.view"), async (_req, res) => {
  const titles = await db.select().from(staffTitlesTable).orderBy(staffTitlesTable.name);
  const perms = await db.select().from(staffTitlePermissionsTable);
  const counts = await db.select({ titleId: staffMemberTitlesTable.titleId, n: sql<number>`count(*)::int` })
    .from(staffMemberTitlesTable).groupBy(staffMemberTitlesTable.titleId);
  res.json({
    permissions: PERMISSIONS,
    levels: Object.entries(LEVEL_PERMISSIONS).map(([role, p]) => ({ role, permissions: p })),
    titles: titles.map((t) => ({
      ...t,
      permissions: perms.filter((p) => p.titleId === t.id).map((p) => p.permission),
      members: counts.find((c) => c.titleId === t.id)?.n ?? 0,
    })),
  });
});

router.post("/staff/titles", requirePermission("roles.manage"), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 60) : "";
  if (name.length < 2) return res.status(400).json({ error: "Title name is required." });
  const [row] = await db.insert(staffTitlesTable)
    .values({ name, description: String(req.body?.description ?? "").slice(0, 200) })
    .onConflictDoNothing().returning();
  if (!row) return res.status(409).json({ error: "A title with this name already exists." });
  res.status(201).json(row);
});

router.patch("/staff/titles/:id", requirePermission("roles.manage"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, description, active, permissions } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim().length >= 2) patch.name = name.trim().slice(0, 60);
  if (typeof description === "string") patch.description = description.slice(0, 200);
  if (typeof active === "boolean") patch.active = active;
  if (Object.keys(patch).length) await db.update(staffTitlesTable).set(patch).where(eq(staffTitlesTable.id, id));
  if (Array.isArray(permissions)) {
    const valid = [...new Set(permissions.filter((p: unknown) => typeof p === "string" && PERMISSION_KEYS.has(p)))] as string[];
    // Only admins can hand out the most powerful permissions through a title.
    if (staffOf(req).role !== "admin" && valid.some((p) => ["staff.manage", "roles.manage"].includes(p))) {
      return res.status(403).json({ error: "Only admins can grant staff permissions through titles." });
    }
    await db.transaction(async (tx) => {
      await tx.delete(staffTitlePermissionsTable).where(eq(staffTitlePermissionsTable.titleId, id));
      if (valid.length) await tx.insert(staffTitlePermissionsTable).values(valid.map((permission) => ({ titleId: id, permission })));
    });
  }
  res.json({ ok: true });
});

// ── Team ─────────────────────────────────────────────────────────────────────
router.get("/staff/members", requirePermission("staff.view"), async (_req, res) => {
  const members = await db.select().from(authAccountsTable)
    .where(inArray(authAccountsTable.role, [...STAFF_ROLES])).orderBy(authAccountsTable.createdAt);
  const links = await db.select().from(staffMemberTitlesTable);
  const loads = await db.select({ id: tasksTable.assigneeId, n: sql<number>`count(*)::int` }).from(tasksTable)
    .where(inArray(tasksTable.status, OPEN_STATUSES)).groupBy(tasksTable.assigneeId);
  res.json(members.map((m) => ({
    id: m.id, role: m.role, status: m.status,
    fullName: decrypt(m.fullNameEnc), email: decrypt(m.emailEnc), phone: decrypt(m.phoneEnc),
    lastLoginAt: m.lastLoginAt,
    titleIds: links.filter((l) => l.accountId === m.id).map((l) => l.titleId),
    openTasks: loads.find((l) => l.id === m.id)?.n ?? 0,
  })));
});

router.patch("/staff/members/:id", requirePermission("staff.manage"), async (req, res) => {
  const actor = staffOf(req);
  const targetId = String(req.params.id);
  if (targetId === actor.id) return res.status(403).json({ error: "You can't change your own access." });
  const [target] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, targetId)).limit(1);
  if (!target || !(STAFF_ROLES as readonly string[]).includes(target.role)) return res.status(404).json({ error: "Staff member not found." });
  if (!canManageRole(actor.role, target.role)) return res.status(403).json({ error: "You can't manage this level." });

  const { role, status, titleIds } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (role !== undefined) {
    if (!(STAFF_ROLES as readonly string[]).includes(role) || !canManageRole(actor.role, role)) {
      return res.status(403).json({ error: "You can't assign that level." });
    }
    patch.role = role;
  }
  if (status !== undefined) {
    if (!["active", "suspended"].includes(status)) return res.status(400).json({ error: "Invalid status." });
    patch.status = status;
  }
  await db.update(authAccountsTable).set(patch).where(eq(authAccountsTable.id, targetId));
  if (Array.isArray(titleIds)) {
    const ids = [...new Set(titleIds.map(Number).filter(Number.isInteger))];
    await db.transaction(async (tx) => {
      await tx.delete(staffMemberTitlesTable).where(eq(staffMemberTitlesTable.accountId, targetId));
      if (ids.length) await tx.insert(staffMemberTitlesTable).values(ids.map((titleId) => ({ accountId: targetId, titleId })));
    });
  }
  // A level change or suspension must take effect now, not when the cookie expires.
  if (role !== undefined || status !== undefined) await revokeSessions(targetId);
  await db.insert(authEventsTable).values({ accountId: targetId, event: `staff_updated_by:${actor.id}`, ip: req.ip ?? null });
  res.json({ ok: true });
});

/** Admin/manager adds a staff member directly: name + email or phone + password. */
router.post("/staff/members", requirePermission("staff.manage"), async (req, res) => {
  const actor = staffOf(req);
  const { fullName, identifier, password, role } = req.body ?? {};
  if (!(STAFF_ROLES as readonly string[]).includes(role) || !canManageRole(actor.role, role)) {
    return res.status(403).json({ error: "You can't add this level." });
  }
  const name = typeof fullName === "string" ? fullName.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) return res.status(400).json({ error: "Please enter the full name." });
  const id = parseIdentifier(identifier);
  if (!id) return res.status(400).json({ error: "Enter a valid email or phone number." });
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const a = await createAccount(role, name, id, password);
  if (a === "exists") return res.status(409).json({ error: "An account with this email/phone already exists." });
  await db.insert(authEventsTable).values({ accountId: a.id, event: `staff_created_by:${actor.id}`, ip: req.ip ?? null });
  res.status(201).json({ id: a.id });
});

/** Any user who forgot their password: admin finds them by email/phone and sets a new one. */
router.post("/staff/accounts/password", requirePermission("staff.manage"), async (req, res) => {
  const actor = staffOf(req);
  if (actor.role !== "admin") return res.status(403).json({ error: "Only admins can reset other users' passwords." });
  const id = parseIdentifier(req.body?.identifier);
  if (!id) return res.status(400).json({ error: "Enter a valid email or phone number." });
  const pwErr = passwordProblem(req.body?.password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const target = await findByIdentifier(id);
  if (!target) return res.status(404).json({ error: "No account with that email or phone." });
  if (target.id === actor.id) return res.status(403).json({ error: "Change your own password from your account page." });
  await db.update(authAccountsTable).set({
    passwordHash: await hashPassword(req.body.password), failedLogins: 0, lockedUntil: null, updatedAt: new Date(),
  }).where(eq(authAccountsTable.id, target.id));
  await revokeSessions(target.id);
  await db.insert(authEventsTable).values({ accountId: target.id, event: `password_set_by:${actor.id}`, ip: req.ip ?? null });
  res.json({ ok: true, role: target.role, fullName: decrypt(target.fullNameEnc) });
});

/** Forgotten password: an admin/manager sets a new one. Signs the person out everywhere. */
router.post("/staff/members/:id/password", requirePermission("staff.manage"), async (req, res) => {
  const actor = staffOf(req);
  const targetId = String(req.params.id);
  if (targetId === actor.id) return res.status(403).json({ error: "Change your own password from your account page." });
  const [target] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, targetId)).limit(1);
  if (!target || !canManageRole(actor.role, target.role)) return res.status(403).json({ error: "You can't manage this person." });
  const pwErr = passwordProblem(req.body?.password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  await db.update(authAccountsTable).set({
    passwordHash: await hashPassword(req.body.password), failedLogins: 0, lockedUntil: null, updatedAt: new Date(),
  }).where(eq(authAccountsTable.id, targetId));
  await revokeSessions(targetId);
  await db.insert(authEventsTable).values({ accountId: targetId, event: `password_set_by:${actor.id}`, ip: req.ip ?? null });
  res.json({ ok: true });
});

// ── Tasks ────────────────────────────────────────────────────────────────────
router.get("/staff/tasks", requirePermission("tasks.work"), async (req, res) => {
  const ctx = staffOf(req);
  const { status, type, mine, overdue, assignee, dueSoon } = req.query as Record<string, string | undefined>;
  const where: SQL[] = [];
  if (!ctx.permissions.has("tasks.view") || mine === "1") where.push(eq(tasksTable.assigneeId, ctx.id));
  else if (assignee) where.push(eq(tasksTable.assigneeId, assignee));
  if (status === "open") where.push(inArray(tasksTable.status, OPEN_STATUSES));
  // "active": everything still open plus rejected tasks, so a rejection stays in front of the manager.
  else if (status === "active") where.push(inArray(tasksTable.status, [...OPEN_STATUSES, "rejected"]));
  else if (status && (TASK_STATUSES as readonly string[]).includes(status)) where.push(eq(tasksTable.status, status));
  if (type) where.push(eq(tasksTable.typeCode, type));
  if (overdue === "1") where.push(lt(tasksTable.dueAt, new Date()), notInArray(tasksTable.status, ["done", "rejected"]));
  if (dueSoon === "1") where.push(gt(tasksTable.dueAt, new Date()), notInArray(tasksTable.status, ["done", "rejected"]));
  // Open work first (soonest due first), then finished tasks (most recent first).
  const closed = sql`case when ${tasksTable.status} in ('done','rejected') then 1 else 0 end`;
  const rows = await db.select().from(tasksTable).where(where.length ? and(...where) : undefined)
    .orderBy(closed, sql`case when ${tasksTable.status} in ('done','rejected') then null else ${tasksTable.dueAt} end asc nulls last`,
      desc(tasksTable.completedAt)).limit(500);
  const now = Date.now();
  const sla = await slaByType();
  const soon = (t: (typeof rows)[number]) => isDueSoon(t, sla.get(t.typeCode), now);
  res.json(rows.filter((t) => dueSoon !== "1" || soon(t)).map((t) => ({ ...t, overdue: Boolean(t.dueAt && t.dueAt.getTime() < now && !["done", "rejected"].includes(t.status)), dueSoon: soon(t) })));
});

router.get("/staff/tasks/:id", requirePermission("tasks.work"), async (req, res) => {
  const ctx = staffOf(req);
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, Number(req.params.id))).limit(1);
  if (!task || (!ctx.permissions.has("tasks.view") && task.assigneeId !== ctx.id)) return res.status(404).json({ error: "Task not found." });
  const events = await db.select().from(taskEventsTable).where(eq(taskEventsTable.taskId, task.id)).orderBy(desc(taskEventsTable.createdAt));
  res.json({ ...task, events });
});

router.post("/staff/tasks", requirePermission("tasks.assign"), async (req, res) => {
  const { typeCode = "manual", title, entityType, entityId, assigneeId, note } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length < 3) return res.status(400).json({ error: "Task title is required." });
  const task = await createTask({
    typeCode, title: title.trim(), entityType, entityId, createdBy: staffOf(req).id,
    ...(assigneeId ? { assigneeId: String(assigneeId) } : {}),
    data: note ? { note: String(note).slice(0, 1000) } : {},
  });
  if (!task) return res.status(400).json({ error: "Unknown or inactive task type." });
  res.status(201).json(task);
});

router.post("/staff/tasks/:id/assign", requirePermission("tasks.assign"), async (req, res) => {
  const id = Number(req.params.id);
  const assigneeId = req.body?.assigneeId ? String(req.body.assigneeId) : null;
  if (assigneeId) {
    const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, assigneeId)).limit(1);
    if (!a || a.status !== "active" || !(STAFF_ROLES as readonly string[]).includes(a.role)) return res.status(400).json({ error: "Pick an active staff member." });
  }
  const [task] = await db.update(tasksTable)
    .set({ assigneeId, status: assigneeId ? "assigned" : "open", updatedAt: new Date() })
    .where(and(eq(tasksTable.id, id), notInArray(tasksTable.status, ["done", "rejected"]))).returning();
  if (!task) return res.status(404).json({ error: "Task not found or already closed." });
  await addTaskEvent(id, "assigned", assigneeId ? `Assigned to ${assigneeId}` : "Unassigned", staffOf(req).id);
  if (assigneeId) void alertAssignee(assigneeId, task.title, task.dueAt);
  res.json(task);
});

router.post("/staff/tasks/:id/status", requirePermission("tasks.work"), async (req, res) => {
  const ctx = staffOf(req);
  const id = Number(req.params.id);
  const { status, message } = req.body ?? {};
  if (!["in_progress", "needs_info", "done", "rejected", "assigned", "open"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  const [current] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
  if (!current) return res.status(404).json({ error: "Task not found." });
  if (current.assigneeId !== ctx.id && !ctx.permissions.has("tasks.assign")) return res.status(403).json({ error: "This task isn't assigned to you." });
  // Reopen: a manager brings a rejected/done task back so it can be reassigned.
  if (status === "open") {
    if (!ctx.permissions.has("tasks.assign")) return res.status(403).json({ error: "Only a manager can reopen a task." });
    if (!["done", "rejected"].includes(current.status)) return res.status(409).json({ error: "This task is already open." });
    const [task] = await db.update(tasksTable)
      .set({ status: "open", assigneeId: null, completedAt: null, updatedAt: new Date() })
      .where(eq(tasksTable.id, id)).returning();
    await addTaskEvent(id, "status", `reopened${message ? ` — ${String(message).slice(0, 1000)}` : ""}`, ctx.id);
    return res.json(task);
  }
  if (["done", "rejected"].includes(current.status)) return res.status(409).json({ error: "This task is already closed." });
  const closing = ["done", "rejected"].includes(status);
  const [task] = await db.update(tasksTable)
    .set({ status, updatedAt: new Date(), completedAt: closing ? new Date() : null })
    .where(eq(tasksTable.id, id)).returning();
  await addTaskEvent(id, "status", `${status.replace("_", " ")}${message ? ` — ${String(message).slice(0, 1000)}` : ""}`, ctx.id);
  if (status === "done") await onTaskDone(task!);
  res.json(task);
});

// Delete a task (e.g. a duplicate). Managers only; its history goes with it (ON DELETE CASCADE).
router.delete("/staff/tasks/:id", requirePermission("tasks.assign"), async (req, res) => {
  const ctx = staffOf(req);
  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, Number(req.params.id))).returning();
  if (!task) return res.status(404).json({ error: "Task not found." });
  await db.insert(authEventsTable).values({ accountId: task.assigneeId, event: `task_deleted_by:${ctx.id}`, ip: req.ip ?? null });
  res.json({ ok: true });
});

router.post("/staff/tasks/:id/comment", requirePermission("tasks.work"), async (req, res) => {
  const ctx = staffOf(req);
  const id = Number(req.params.id);
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 2000) : "";
  if (!message) return res.status(400).json({ error: "Write a comment." });
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
  if (!task || (!ctx.permissions.has("tasks.view") && task.assigneeId !== ctx.id)) return res.status(404).json({ error: "Task not found." });
  await addTaskEvent(id, "comment", message, ctx.id);
  res.json({ ok: true });
});

// ── Automation rules ─────────────────────────────────────────────────────────
router.get("/staff/task-types", requirePermission("tasks.work"), async (_req, res) => {
  const rows = await db.select().from(taskTypesTable).orderBy(taskTypesTable.label);
  res.json(rows.map((r) => ({ ...r, system: SYSTEM_TASK_CODES.has(r.code) })));
});

/** Validates rule fields shared by create and update; returns an error message or the clean patch. */
function ruleFields(body: any, creating: boolean): string | Record<string, unknown> {
  const { label, trigger, requiredRole, requiredTitleId, slaHours, autoAssign, active } = body ?? {};
  const patch: Record<string, unknown> = {};
  if (label !== undefined || creating) {
    const v = typeof label === "string" ? label.trim().replace(/\s+/g, " ") : "";
    if (v.length < 2 || v.length > 80) return "Rule name must be 2–80 characters.";
    patch.label = v;
  }
  if (trigger !== undefined || creating) {
    const v = typeof trigger === "string" ? trigger.trim().replace(/\s+/g, " ") : "";
    if (v.length < 2 || v.length > 200) return "“When” must be 2–200 characters.";
    patch.trigger = v;
  }
  if (requiredRole !== undefined || creating) {
    if (!(STAFF_ROLES as readonly string[]).includes(requiredRole)) return "Invalid role.";
    patch.requiredRole = requiredRole;
  }
  if (requiredTitleId !== undefined) patch.requiredTitleId = requiredTitleId === null || requiredTitleId === "" ? null : Number(requiredTitleId);
  if (slaHours !== undefined || creating) {
    const h = Number(slaHours ?? 48);
    if (!Number.isInteger(h) || h < 1 || h > 720) return "SLA must be 1–720 hours.";
    patch.slaHours = h;
  }
  if (autoAssign !== undefined || creating) {
    const v = autoAssign ?? "least_busy";
    if (!["least_busy", "none"].includes(v)) return "Invalid assignment mode.";
    patch.autoAssign = v;
  }
  if (typeof active === "boolean") patch.active = active;
  return patch;
}

router.post("/staff/task-types", requirePermission("rules.manage"), async (req, res) => {
  const fields = ruleFields(req.body, true);
  if (typeof fields === "string") return res.status(400).json({ error: fields });
  const base = String(fields.label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "rule";
  const code = `custom_${base}_${Date.now().toString(36)}`;
  const [row] = await db.insert(taskTypesTable).values({ code, ...(fields as any) }).returning();
  res.status(201).json({ ...row, system: false });
});

router.patch("/staff/task-types/:code", requirePermission("rules.manage"), async (req, res) => {
  const patch = ruleFields(req.body, false);
  if (typeof patch === "string") return res.status(400).json({ error: patch });
  if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to change." });
  const [before] = await db.select().from(taskTypesTable).where(eq(taskTypesTable.code, String(req.params.code))).limit(1);
  if (!before) return res.status(404).json({ error: "Rule not found." });
  const [row] = await db.update(taskTypesTable).set(patch).where(eq(taskTypesTable.code, String(req.params.code))).returning();
  if (!row) return res.status(404).json({ error: "Rule not found." });
  // A new SLA also moves the deadline of this rule's tasks that are still open:
  // deadline = when the task was created + the new number of hours.
  let updatedTasks = 0;
  if (patch.slaHours !== undefined && row.slaHours !== before.slaHours) {
    // Shift each open deadline by the change (e.g. 24 h → 1 h moves it 23 h earlier). Deadlines were
    // written by the app clock, so this stays right whatever time zone the database uses.
    const open = await db.update(tasksTable)
      .set({ dueAt: sql`${tasksTable.dueAt} + make_interval(hours => ${row.slaHours - before.slaHours})`, escalatedAt: null, updatedAt: new Date() })
      .where(and(eq(tasksTable.typeCode, row.code), notInArray(tasksTable.status, ["done", "rejected"])))
      .returning({ id: tasksTable.id });
    updatedTasks = open.length;
    if (open.length) {
      const ids = open.map((t) => t.id);
      // Let the due-soon reminder fire again against the new deadline.
      await db.delete(taskEventsTable).where(and(inArray(taskEventsTable.taskId, ids), eq(taskEventsTable.kind, "due_soon")));
      for (const id of ids) await addTaskEvent(id, "deadline", `Deadline changed — SLA is now ${row.slaHours} h`, staffOf(req).id);
    }
  }
  res.json({ ...row, system: SYSTEM_TASK_CODES.has(row.code), updatedTasks });
});

router.delete("/staff/task-types/:code", requirePermission("rules.manage"), async (req, res) => {
  const code = String(req.params.code);
  if (SYSTEM_TASK_CODES.has(code)) return res.status(400).json({ error: "Built-in rules can't be deleted — turn them off instead." });
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(tasksTable).where(eq(tasksTable.typeCode, code));
  if (used && used.n > 0) return res.status(409).json({ error: `This rule has ${used.n} task(s). Turn it off instead of deleting.` });
  const [row] = await db.delete(taskTypesTable).where(eq(taskTypesTable.code, code)).returning();
  if (!row) return res.status(404).json({ error: "Rule not found." });
  res.json({ ok: true });
});

// ── Audit ────────────────────────────────────────────────────────────────────
type Who = { name: string | null; email: string | null; phone: string | null; role: string };
const ENV_ADMIN: Who = { name: "Main admin (.env login)", email: null, phone: null, role: "admin" };

router.get("/staff/audit", requirePermission("audit.view"), async (req, res) => {
  // Time window: ?from=&to= (ISO dates) for a custom range, otherwise the last ?hours= (default 4).
  const parse = (v: unknown) => { const d = typeof v === "string" && v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d : null; };
  let from = parse(req.query.from);
  const to = parse(req.query.to);
  if (!from) {
    const h = Number(req.query.hours ?? 4);
    from = new Date(Date.now() - (Number.isFinite(h) && h > 0 ? Math.min(h, 24 * 366) : 4) * 3600_000);
  }
  const where = to ? and(gte(authEventsTable.createdAt, from), lte(authEventsTable.createdAt, to)) : gte(authEventsTable.createdAt, from);
  const rows = await db.select().from(authEventsTable).where(where).orderBy(desc(authEventsTable.createdAt)).limit(2000);
  // Events like "password_set_by:<id>" carry the person who did it.
  const parsed = rows.map((r) => {
    const m = /^(.*)_by:(.+)$/.exec(r.event);
    return { ...r, event: m ? m[1] : r.event, actorId: m ? m[2] : null };
  });
  const ids = new Set<string>();
  for (const r of parsed) { if (r.accountId) ids.add(r.accountId); if (r.actorId) ids.add(r.actorId); }
  ids.delete("env-admin");
  const accounts = ids.size
    ? await db.select({ id: authAccountsTable.id, role: authAccountsTable.role, fullNameEnc: authAccountsTable.fullNameEnc,
        emailEnc: authAccountsTable.emailEnc, phoneEnc: authAccountsTable.phoneEnc })
        .from(authAccountsTable).where(inArray(authAccountsTable.id, [...ids]))
    : [];
  const who = new Map<string, Who>(accounts.map((a) => [a.id, {
    name: decrypt(a.fullNameEnc), email: decrypt(a.emailEnc), phone: decrypt(a.phoneEnc), role: a.role,
  }]));
  who.set("env-admin", ENV_ADMIN);
  res.json(parsed.map((r) => ({
    id: r.id, event: r.event, ip: r.ip, createdAt: r.createdAt, accountId: r.accountId,
    person: r.accountId ? who.get(r.accountId) ?? null : null,
    actor: r.actorId ? who.get(r.actorId) ?? null : null,
  })));
});

export default router;
