import type { Request, RequestHandler } from "express";
import {
  db, authAccountsTable, staffMemberTitlesTable, staffTitlesTable, staffTitlePermissionsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

/** Every permission in the system, grouped by module (drives the Roles page matrix). */
export const PERMISSIONS = [
  { key: "artworks.view", module: "Artworks", label: "See all artworks, including pending ones" },
  { key: "artworks.approve", module: "Artworks", label: "Approve, reject or edit artworks and prices" },
  { key: "artists.approve", module: "Artists", label: "Verify artists, claims and merge requests" },
  { key: "galleries.approve", module: "Galleries", label: "Verify galleries" },
  { key: "orders.view", module: "Orders", label: "See orders and buyer contact details" },
  { key: "orders.manage", module: "Orders", label: "Change order status, cancel orders" },
  { key: "payments.confirm", module: "Payments", label: "Confirm payments and refunds" },
  { key: "tasks.view", module: "Tasks", label: "See every task" },
  { key: "tasks.work", module: "Tasks", label: "Work on tasks assigned to them" },
  { key: "tasks.assign", module: "Tasks", label: "Create, assign and reassign tasks" },
  { key: "rules.manage", module: "Tasks", label: "Edit automation rules (who handles what, SLA)" },
  { key: "staff.view", module: "Staff", label: "See staff members and their titles" },
  { key: "staff.manage", module: "Staff", label: "Add staff, set titles, suspend accounts" },
  { key: "roles.manage", module: "Staff", label: "Create titles and edit what they allow" },
  { key: "audit.view", module: "Audit", label: "See the sign-in and activity log" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
const ALL = PERMISSIONS.map((p) => p.key) as Permission[];

/** Accounts that appear in the staff console. */
export const STAFF_ROLES = ["admin", "manager", "curator", "assistant", "coordinator", "handler"] as const;

/** Fixed permissions per level. Titles add to these, never remove. */
export const LEVEL_PERMISSIONS: Record<string, Permission[]> = {
  admin: ALL,
  manager: ALL.filter((p) => p !== "roles.manage"),
  curator: ["artworks.view", "artworks.approve", "artists.approve", "tasks.view", "tasks.work"],
  assistant: ["artworks.view", "orders.view", "tasks.work"],
  coordinator: ["orders.view", "tasks.work"],
  handler: ["tasks.work"],
};

export type StaffContext = {
  id: string;
  role: string;
  titles: { id: number; name: string }[];
  permissions: Set<string>;
};

export async function getStaffContext(req: Request): Promise<StaffContext | null> {
  const userId = req.session?.userId;
  // Env-credential admin (bootstrap account) — full rights.
  if (!userId && req.session?.isAdmin === true) {
    return { id: "env-admin", role: "admin", titles: [], permissions: new Set(ALL) };
  }
  if (!userId) return null;
  const [a] = await db.select().from(authAccountsTable).where(eq(authAccountsTable.id, userId)).limit(1);
  if (!a || a.status !== "active" || !(STAFF_ROLES as readonly string[]).includes(a.role)) return null;

  const titles = await db
    .select({ id: staffTitlesTable.id, name: staffTitlesTable.name })
    .from(staffMemberTitlesTable)
    .innerJoin(staffTitlesTable, eq(staffMemberTitlesTable.titleId, staffTitlesTable.id))
    .where(and(eq(staffMemberTitlesTable.accountId, a.id), eq(staffTitlesTable.active, true)));
  const permissions = new Set<string>(LEVEL_PERMISSIONS[a.role] ?? []);
  if (titles.length) {
    const rows = await db.select().from(staffTitlePermissionsTable)
      .where(inArray(staffTitlePermissionsTable.titleId, titles.map((t) => t.id)));
    rows.forEach((r) => permissions.add(r.permission));
  }
  return { id: a.id, role: a.role, titles, permissions };
}

export function requirePermission(permission: Permission): RequestHandler {
  return async (req, res, next) => {
    const ctx = await getStaffContext(req);
    if (!ctx) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!ctx.permissions.has(permission)) {
      res.status(403).json({ error: "You don't have permission to do this." });
      return;
    }
    (req as any).staff = ctx;
    next();
  };
}

/** Who may create/edit whom: admins manage everyone, managers manage assistants/coordinators/handlers. */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === "admin") return true;
  if (actorRole === "manager") return ["assistant", "coordinator", "handler"].includes(targetRole);
  return false;
}
