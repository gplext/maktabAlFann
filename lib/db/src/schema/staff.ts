import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey, index } from "drizzle-orm/pg-core";
import { authAccountsTable } from "./auth";

/**
 * Staff structure: every staff account has one level (its auth role:
 * admin | manager | assistant | curator) and any number of TITLES
 * ("Framer", "Glass purchaser"...). Level permissions are fixed in code
 * (api-server/src/lib/permissions.ts); title permissions are editable here.
 */
export const staffTitlesTable = pgTable("staff_titles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffTitlePermissionsTable = pgTable("staff_title_permissions", {
  titleId: integer("title_id").notNull().references(() => staffTitlesTable.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
}, (t) => [primaryKey({ columns: [t.titleId, t.permission] })]);

export const staffMemberTitlesTable = pgTable("staff_member_titles", {
  accountId: text("account_id").notNull().references(() => authAccountsTable.id, { onDelete: "cascade" }),
  titleId: integer("title_id").notNull().references(() => staffTitlesTable.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.accountId, t.titleId] })]);

/**
 * Task types double as the automation RULES: what triggers them is in code,
 * but who handles them (role + optional title), SLA and assignment strategy
 * are data that admins edit on the Rules tab.
 */
export const taskTypesTable = pgTable("task_types", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  trigger: text("trigger").notNull(),          // plain-language description of the trigger
  requiredRole: text("required_role").notNull(), // admin | manager | assistant | curator | coordinator ...
  requiredTitleId: integer("required_title_id").references(() => staffTitlesTable.id, { onDelete: "set null" }),
  slaHours: integer("sla_hours").notNull().default(48),
  autoAssign: text("auto_assign").notNull().default("least_busy"), // least_busy | none
  active: boolean("active").notNull().default(true),
});

export const TASK_STATUSES = ["open", "assigned", "in_progress", "needs_info", "done", "rejected"] as const;

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  typeCode: text("type_code").notNull().references(() => taskTypesTable.code),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"),
  entityType: text("entity_type"),   // artwork | artist | gallery | order | claim | merge_request
  entityId: text("entity_id"),
  assigneeId: text("assignee_id").references(() => authAccountsTable.id, { onDelete: "set null" }),
  requiredRole: text("required_role").notNull(),
  requiredTitleId: integer("required_title_id").references(() => staffTitlesTable.id, { onDelete: "set null" }),
  data: jsonb("data").notNull().default({}),
  dueAt: timestamp("due_at"),
  escalatedAt: timestamp("escalated_at"),
  completedAt: timestamp("completed_at"),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("tasks_status_idx").on(t.status),
  index("tasks_assignee_idx").on(t.assigneeId),
  index("tasks_entity_idx").on(t.entityType, t.entityId),
]);

export const taskEventsTable = pgTable("task_events", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull().default("system"),
  kind: text("kind").notNull(), // created | assigned | status | comment | escalated
  message: text("message").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("task_events_task_idx").on(t.taskId)]);

export type Task = typeof tasksTable.$inferSelect;
export type TaskType = typeof taskTypesTable.$inferSelect;
