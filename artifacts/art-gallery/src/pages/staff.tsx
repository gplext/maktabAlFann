import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { DropSelect } from "@/components/ui/drop-select";
import { authFetch, useAuth } from "@/lib/auth";

/** Staff console: tasks, automation rules, roles matrix, team and audit log. */

type Me = { id: string; role: string; titles: { id: number; name: string }[]; permissions: string[] };
type Perm = { key: string; module: string; label: string };
type Title = { id: number; name: string; description: string; active: boolean; permissions: string[]; members: number };
type Catalog = { permissions: Perm[]; levels: { role: string; permissions: string[] }[]; titles: Title[] };
type Member = { id: string; role: string; status: string; fullName: string | null; email: string | null; phone: string | null; titleIds: number[]; openTasks: number };
type TaskType = { code: string; label: string; trigger: string; requiredRole: string; requiredTitleId: number | null; slaHours: number; autoAssign: string; active: boolean; system?: boolean };
type Task = { id: number; typeCode: string; title: string; status: string; completedAt?: string | null; entityType: string | null; entityId: string | null; assigneeId: string | null; requiredRole: string; dueAt: string | null; overdue: boolean; dueSoon?: boolean; data: Record<string, unknown> };
type TaskEvent = { id: number; actorId: string; kind: string; message: string; createdAt: string };

const LEVELS = ["admin", "manager", "curator", "assistant", "coordinator", "handler"];
const LEVEL_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", curator: "Curator", assistant: "Assistant", coordinator: "Coordinator", handler: "Artist handler" };
const STATUS_STYLE: Record<string, string> = {
  open: "bg-secondary/20 text-foreground", assigned: "bg-primary/10 text-primary", in_progress: "bg-amber-100 text-amber-900",
  needs_info: "bg-orange-100 text-orange-900", done: "bg-emerald-100 text-emerald-900", rejected: "bg-red-100 text-red-900",
};

/** One colour per order status (bordered pill; readable in light and dark mode). */
const ORDER_STATUS_STYLE: Record<string, string> = {
  pending_purchase: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40",
  confirmed:        "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/40",
  in_preparation:   "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/40",
  paid:             "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/40",
  shipped:          "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/40",
  delivered:        "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40",
  completed:        "bg-green-700 text-white border-green-800 dark:bg-green-600 dark:text-white dark:border-green-500",
  cancelled:        "bg-stone-200 text-stone-700 border-stone-300 line-through dark:bg-stone-500/20 dark:text-stone-300 dark:border-stone-500/40",
  refunded:         "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/40",
};
const PAYMENT_STYLE: Record<string, string> = {
  unpaid: "text-amber-700 dark:text-amber-400", pending: "text-sky-700 dark:text-sky-400",
  paid: "text-emerald-700 dark:text-emerald-400", refunded: "text-rose-700 dark:text-rose-400",
};

async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api/staff/${path}`, {
    method, credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? (res.status >= 500 ? "Server error — check the API window for details." : `Request failed (${res.status})`)), { status: res.status, data });
  return data;
}

/** Same as api() but for the shared review endpoints under /api/admin (they check staff permissions). */
async function reviewApi<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method, credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? (res.status >= 500 ? "Server error — check the API window for details." : `Request failed (${res.status})`)), { status: res.status, data });
  return data;
}

const btn = "px-3 py-1.5 text-xs uppercase tracking-widest border border-border hover:border-primary hover:text-primary transition disabled:opacity-40";
const btnPrimary = "px-3 py-1.5 text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40";
const select = "border border-border bg-background px-2 py-1.5 text-sm";

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h2 className="font-display text-2xl text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
function TasksTab({ me, types, members }: { me: Me; types: TaskType[]; members: Member[] }) {
  const can = (p: string) => me.permissions.includes(p);
  const [filter, setFilter] = useState({ status: can("tasks.view") ? "" : "open", type: "", mine: !can("tasks.view"), overdue: false, dueSoon: false });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<(Task & { events: TaskEvent[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", typeCode: "manual", assigneeId: "" });
  const [rejectReason, setRejectReason] = useState<string | null>(null);   // null = not rejecting
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typeLabel = (c: string) => types.find((t) => t.code === c)?.label ?? c;
  const name = (id: string | null) => (id ? (id === me.id ? "You" : members.find((m) => m.id === id)?.fullName ?? "Staff") : "Unassigned");

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filter.status) q.set("status", filter.status);
    if (filter.type) q.set("type", filter.type);
    if (filter.mine) q.set("mine", "1");
    if (filter.overdue) q.set("overdue", "1");
    if (filter.dueSoon) q.set("dueSoon", "1");
    try { setTasks(await api(`tasks?${q}`)); } catch (e: any) { setError(e.message); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const open = async (id: number) => { setRejectReason(null); setConfirmDelete(false); setSelected(await api(`tasks/${id}`)); };
  const removeTask = async (id: number) => {
    setError(null);
    try { await api(`tasks/${id}`, "DELETE"); setSelected(null); setConfirmDelete(false); await load(); } catch (e: any) { setError(e.message); }
  };
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await load(); if (selected) await open(selected.id); } catch (e: any) { setError(e.message); }
  };

  return (
    <Section title="Verification tasks" action={
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <DropSelect className={select} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All (open, done, rejected)</option><option value="open">Open</option><option value="active">Open + rejected</option><option value="needs_info">Needs info</option>
          <option value="done">Done</option><option value="rejected">Rejected</option>
        </DropSelect>
        <DropSelect className={select} value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
          <option value="">All types</option>{types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </DropSelect>
        {can("tasks.view") && <label className="flex items-center gap-1"><input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> Mine</label>}
        <label className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><input type="checkbox" checked={filter.dueSoon} onChange={(e) => setFilter({ ...filter, dueSoon: e.target.checked })} /> Due soon</label>
        <label className="flex items-center gap-1 text-destructive"><input type="checkbox" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} /> Overdue</label>
      </div>
    }>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {can("tasks.assign") && (
        <form className="flex flex-wrap gap-2 items-center border border-border p-3" onSubmit={(e) => { e.preventDefault(); void act(async () => {
          await api("tasks", "POST", { ...draft, assigneeId: draft.assigneeId || undefined });
          setDraft({ title: "", typeCode: "manual", assigneeId: "" });
        }); }}>
          <Input className="flex-1 min-w-[200px]" placeholder="New task, e.g. Frame order #142 in walnut" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <DropSelect className={select} value={draft.typeCode} onChange={(e) => setDraft({ ...draft, typeCode: e.target.value })}>
            {types.filter((t) => t.active).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </DropSelect>
          <DropSelect className={select} value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}>
            <option value="">Auto-assign by rule</option>
            {members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.fullName} ({LEVEL_LABEL[m.role]})</option>)}
          </DropSelect>
          <button className={btnPrimary} type="submit">Add task</button>
        </form>
      )}
      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="border border-border divide-y divide-border">
          {(tasks.some((t) => t.overdue) || tasks.some((t) => t.dueSoon)) && (
            <p className="px-4 py-2 text-xs flex gap-4 bg-muted/20">
              {tasks.some((t) => t.overdue) && <span className="text-destructive font-medium">{tasks.filter((t) => t.overdue).length} overdue</span>}
              {tasks.some((t) => t.dueSoon) && <span className="text-amber-700 dark:text-amber-400 font-medium">{tasks.filter((t) => t.dueSoon).length} due soon (less than 25% of the time left)</span>}
            </p>
          )}
          {tasks.length === 0 && <p className="p-6 text-sm text-foreground/50">No tasks match.</p>}
          {tasks.map((t) => (
            <button key={t.id} onClick={() => void open(t.id)} className={`w-full text-left p-4 hover:bg-muted/40 flex flex-wrap gap-x-4 gap-y-1 items-center ${selected?.id === t.id ? "bg-secondary/10 border-l-2 border-l-secondary" : t.overdue ? "border-l-2 border-l-destructive" : t.dueSoon ? "border-l-2 border-l-amber-500" : ""}`}>
              <span className="flex-1 min-w-[200px]">
                <span className="block text-sm text-foreground">{t.title}</span>
                <span className="block text-xs text-foreground/50">{typeLabel(t.typeCode)} · handled by {LEVEL_LABEL[t.requiredRole] ?? t.requiredRole}</span>
                {t.status === "rejected" && <span className="block text-xs text-destructive">Rejected by {name(t.assigneeId)} — open it to read why and reopen or reassign</span>}
                {t.status === "done" && <span className="block text-xs text-emerald-700 dark:text-emerald-400">Done by {name(t.assigneeId)}{t.completedAt ? ` · ${new Date(t.completedAt).toLocaleString()}` : ""}</span>}
              </span>
              <span className="text-xs text-foreground/60">{name(t.assigneeId)}</span>
              <span className={`text-xs ${t.overdue ? "text-destructive font-medium" : t.dueSoon ? "text-amber-700 dark:text-amber-400 font-medium" : "text-foreground/50"}`}>
                {t.dueAt ? `${t.overdue ? "Overdue · " : t.dueSoon ? "Due soon · " : "Due "}${new Date(t.dueAt).toLocaleString()}` : ""}
              </span>
              <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 ${STATUS_STYLE[t.status] ?? ""}`}>{t.status.replace("_", " ")}</span>
            </button>
          ))}
        </div>
        {selected && (
          <aside className="border border-border p-5 space-y-4 self-start">
            <div>
              <p className="text-xs uppercase tracking-widest text-foreground/50">{typeLabel(selected.typeCode)}</p>
              <h3 className="font-display text-xl text-primary">{selected.title}</h3>
              {selected.entityType && <p className="text-xs text-foreground/50">{selected.entityType} #{selected.entityId}</p>}
              {Array.isArray((selected.data as any).items) && <p className="text-sm mt-2">Items: {((selected.data as any).items as string[]).join(", ")}</p>}
              {(selected.data as any).note && <p className="text-sm mt-2">{String((selected.data as any).note)}</p>}
            </div>
            {can("tasks.assign") && !["done", "rejected"].includes(selected.status) && (
              <label className="block text-sm space-y-1"><span className="text-xs uppercase tracking-widest text-foreground/50">Assigned to</span>
                <DropSelect className={`${select} w-full`} value={selected.assigneeId ?? ""} onChange={(e) => void act(() => api(`tasks/${selected.id}/assign`, "POST", { assigneeId: e.target.value || null }))}>
                  <option value="">Unassigned</option>
                  {members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.fullName} — {LEVEL_LABEL[m.role]}</option>)}
                </DropSelect>
              </label>
            )}
            {!["done", "rejected"].includes(selected.status) && (selected.assigneeId === me.id || can("tasks.assign")) && (
              <div className="flex flex-wrap gap-2">
                {[["in_progress", "Start"], ["needs_info", "Needs info"], ["done", "Done"]].map(([s, label]) => (
                  <button key={s} className={s === "done" ? btnPrimary : btn} disabled={selected.status === s}
                    onClick={() => void act(() => api(`tasks/${selected.id}/status`, "POST", { status: s }))}>{label}</button>
                ))}
                <button className={btn} onClick={() => setRejectReason(rejectReason === null ? "" : null)}>Reject</button>
              </div>
            )}
            {rejectReason !== null && !["done", "rejected"].includes(selected.status) && (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void act(async () => {
                await api(`tasks/${selected.id}/status`, "POST", { status: "rejected", message: rejectReason });
                setRejectReason(null);
              }); }}>
                <Input autoFocus required placeholder="Why are you rejecting this task?" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                <div className="flex gap-2">
                  <button type="submit" className={`${btn} border-destructive text-destructive`}>Confirm reject</button>
                  <button type="button" className={btn} onClick={() => setRejectReason(null)}>Cancel</button>
                </div>
              </form>
            )}
            {["done", "rejected"].includes(selected.status) && can("tasks.assign") && (
              <div className="space-y-2">
                <p className="text-sm text-foreground/70">This task is {selected.status === "rejected" ? `rejected by ${name(selected.assigneeId)}` : "done"}.</p>
                <button className={btnPrimary} onClick={() => void act(() => api(`tasks/${selected.id}/status`, "POST", { status: "open" }))}>Reopen to reassign</button>
              </div>
            )}
            {can("tasks.assign") && (
              confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-destructive">Delete this task and its history?</span>
                  <button className={`${btn} border-destructive text-destructive`} onClick={() => void removeTask(selected.id)}>Yes, delete</button>
                  <button className={btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button className={`${btn} hover:border-destructive hover:text-destructive`} onClick={() => setConfirmDelete(true)}>Delete task</button>
              )
            )}
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem("comment") as HTMLInputElement);
              const message = input.value; input.value = "";
              void act(() => api(`tasks/${selected.id}/comment`, "POST", { message }));
            }}>
              <Input name="comment" placeholder="Add a note…" />
              <button className={btn} type="submit">Post</button>
            </form>
            <ul className="space-y-2 text-sm max-h-72 overflow-auto">
              {selected.events.map((ev) => (
                <li key={ev.id} className="border-l-2 border-secondary pl-3">
                  <span className="text-xs text-foreground/50">{new Date(ev.createdAt).toLocaleString()} · {ev.actorId === "system" ? "System" : name(ev.actorId)} · {ev.kind}</span>
                  {ev.message && <span className="block">{ev.message}</span>}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </Section>
  );
}

// ── Rules ─────────────────────────────────────────────────────────────────────
const EMPTY_RULE = { label: "", trigger: "", requiredRole: "assistant", requiredTitleId: "", slaHours: 48, autoAssign: "least_busy" };

function RulesTab({ me, types, titles, reload }: { me: Me; types: TaskType[]; titles: Title[]; reload: () => void }) {
  const editable = me.permissions.includes("rules.manage");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_RULE);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (code: string, patch: Partial<TaskType>) => {
    setError(null); setNotice(null);
    try {
      const r = await api<{ label: string; updatedTasks?: number }>(`task-types/${code}`, "PATCH", patch);
      if (patch.slaHours !== undefined) setNotice(`SLA saved. ${r.updatedTasks ?? 0} open “${r.label}” task(s) got a new deadline.`);
      reload();
    } catch (e: any) { setError(e.message); }
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      await api("task-types", "POST", { ...draft, requiredTitleId: draft.requiredTitleId ? Number(draft.requiredTitleId) : null, slaHours: Number(draft.slaHours) });
      setDraft(EMPTY_RULE); setAdding(false); reload();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (code: string) => {
    setError(null); setConfirmDel(null);
    try { await api(`task-types/${code}`, "DELETE"); reload(); } catch (e: any) { setError(e.message); }
  };

  return (
    <Section title="Automation rules" action={editable && !adding ? <button className={btnPrimary} onClick={() => setAdding(true)}>New rule</button> : undefined}>
      <p className="text-sm text-foreground/60">Each rule says what creates a task and who handles it. “Least busy” sends it to the matching person with the fewest open tasks; overdue tasks are escalated to a manager. Built-in rules run automatically; rules you add appear in “Add task” on the Tasks tab. Changing the SLA also moves the deadline of that rule’s open tasks by the same number of hours.</p>
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {adding && (
        <form onSubmit={create} className="border border-border bg-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs uppercase tracking-widest text-foreground/60">Rule name
            <Input required value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Photograph artwork" /></label>
          <label className="space-y-1 text-xs uppercase tracking-widest text-foreground/60 sm:col-span-1 lg:col-span-2">When
            <Input required value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })} placeholder="e.g. A new artwork needs studio photos" /></label>
          <label className="space-y-1 text-xs uppercase tracking-widest text-foreground/60">Level
            <DropSelect className={`${select} w-full`} value={draft.requiredRole} onChange={(e) => setDraft({ ...draft, requiredRole: e.target.value })}>
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</DropSelect></label>
          <label className="space-y-1 text-xs uppercase tracking-widest text-foreground/60">Title
            <DropSelect className={`${select} w-full`} value={draft.requiredTitleId} onChange={(e) => setDraft({ ...draft, requiredTitleId: e.target.value })}>
              <option value="">Any</option>{titles.map((ti) => <option key={ti.id} value={ti.id}>{ti.name}</option>)}</DropSelect></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs uppercase tracking-widest text-foreground/60">SLA (h)
              <Input type="number" min={1} max={720} required value={draft.slaHours} onChange={(e) => setDraft({ ...draft, slaHours: Number(e.target.value) })} /></label>
            <label className="space-y-1 text-xs uppercase tracking-widest text-foreground/60">Assign
              <DropSelect className={`${select} w-full`} value={draft.autoAssign} onChange={(e) => setDraft({ ...draft, autoAssign: e.target.value })}>
                <option value="least_busy">Least busy</option><option value="none">Manual</option></DropSelect></label>
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Create rule"}</button>
            <button type="button" className={btn} onClick={() => { setAdding(false); setDraft(EMPTY_RULE); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-widest text-foreground/60">
            <tr><th className="p-3 text-left">Tasks Header</th><th className="p-3 text-left">When</th><th className="p-3">Level</th><th className="p-3">Title</th><th className="p-3">SLA (h)</th><th className="p-3">Assign</th><th className="p-3">On</th>{editable && <th className="p-3"></th>}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {types.map((t) => (
              <tr key={t.code}>
                <td className="p-3 font-medium min-w-44">
                  {editable
                    ? <Input key={t.label} defaultValue={t.label} onBlur={(e) => e.target.value.trim() !== t.label && void save(t.code, { label: e.target.value })} />
                    : t.label}
                  {t.system && <span className="block mt-1 text-[10px] uppercase tracking-widest text-foreground/40">Built-in</span>}
                </td>
                <td className="p-3 text-foreground/70 min-w-56">
                  {editable
                    ? <Input key={t.trigger} defaultValue={t.trigger} onBlur={(e) => e.target.value.trim() !== t.trigger && void save(t.code, { trigger: e.target.value })} />
                    : t.trigger}
                </td>
                <td className="p-3"><DropSelect disabled={!editable} className={select} value={t.requiredRole} onChange={(e) => void save(t.code, { requiredRole: e.target.value })}>
                  {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</DropSelect></td>
                <td className="p-3"><DropSelect disabled={!editable} className={select} value={t.requiredTitleId ?? ""} onChange={(e) => void save(t.code, { requiredTitleId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Any</option>{titles.map((ti) => <option key={ti.id} value={ti.id}>{ti.name}</option>)}</DropSelect></td>
                <td className="p-3"><Input disabled={!editable} className="w-20" type="number" min={1} max={720} defaultValue={t.slaHours}
                  onBlur={(e) => Number(e.target.value) !== t.slaHours && void save(t.code, { slaHours: Number(e.target.value) })} /></td>
                <td className="p-3"><DropSelect disabled={!editable} className={select} value={t.autoAssign} onChange={(e) => void save(t.code, { autoAssign: e.target.value })}>
                  <option value="least_busy">Least busy</option><option value="none">Manual</option></DropSelect></td>
                <td className="p-3 text-center"><input type="checkbox" disabled={!editable} checked={t.active} onChange={(e) => void save(t.code, { active: e.target.checked })} /></td>
                {editable && (
                  <td className="p-3 text-right whitespace-nowrap">
                    {t.system ? null : confirmDel === t.code ? (
                      <span className="inline-flex gap-1">
                        <button className={`${btn} border-destructive text-destructive`} onClick={() => void remove(t.code)}>Confirm delete</button>
                        <button className={btn} onClick={() => setConfirmDel(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button className={btn} onClick={() => setConfirmDel(t.code)}>Delete</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── Roles matrix ──────────────────────────────────────────────────────────────
function RolesTab({ me, catalog, members, reload }: { me: Me; catalog: Catalog; members: Member[]; reload: () => void }) {
  const editable = me.permissions.includes("roles.manage");
  const [newTitle, setNewTitle] = useState({ name: "", description: "" });
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modules = [...new Set(catalog.permissions.map((p) => p.module))];
  const previewSet = useMemo(() => {
    const m = members.find((x) => x.id === preview);
    if (!m) return null;
    const s = new Set(catalog.levels.find((l) => l.role === m.role)?.permissions ?? []);
    catalog.titles.filter((t) => m.titleIds.includes(t.id) && t.active).forEach((t) => t.permissions.forEach((p) => s.add(p)));
    return s;
  }, [preview, members, catalog]);

  const toggle = async (t: Title, key: string) => {
    setError(null);
    const permissions = t.permissions.includes(key) ? t.permissions.filter((p) => p !== key) : [...t.permissions, key];
    try { await api(`titles/${t.id}`, "PATCH", { permissions }); reload(); } catch (e: any) { setError(e.message); }
  };
  const Check = ({ on }: { on: boolean }) => <span className={on ? "text-primary" : "text-foreground/20"}>{on ? "●" : "○"}</span>;
  // Does a person's LEVEL already give this right? Then a title tick adds nothing for them.
  const levelHas = (role: string, key: string) => catalog.levels.find((l) => l.role === role)?.permissions.includes(key) ?? false;
  const holders = (t: Title) => members.filter((m) => m.titleIds.includes(t.id));
  const coverage = (t: Title, key: string): "all" | "some" | "none" => {
    const hs = holders(t);
    const n = hs.filter((m) => levelHas(m.role, key)).length;
    return hs.length && n === hs.length ? "all" : n ? "some" : "none";
  };
  const levelNames = (t: Title, key: string) =>
    [...new Set(holders(t).filter((m) => levelHas(m.role, key)).map((m) => LEVEL_LABEL[m.role] ?? m.role))].join(", ");

  return (
    <Section title="Roles & what they can do" action={
      <label className="text-sm flex items-center gap-2">What can this person do?
        <DropSelect className={select} value={preview} onChange={(e) => setPreview(e.target.value)}>
          <option value="">Choose…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
        </DropSelect>
      </label>
    }>
      <p className="text-sm text-foreground/60">Levels have fixed rights. Titles add rights on top — a person can hold several titles.</p>
      <p className="text-xs text-foreground/50">
        <span className="text-foreground/40 italic">by level</span> = everyone with this title already has this right from their level, so ticking it changes nothing.
        {" "}<span className="text-amber-700 dark:text-amber-400">some by level</span> = only some of them already have it; the tick adds it for the rest.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto border border-border">
        <table className="text-sm min-w-full">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-foreground/60">
            <tr>
              <th className="p-3 text-left min-w-[260px]">Permission</th>
              {catalog.levels.map((l) => <th key={l.role} className="p-3">{LEVEL_LABEL[l.role]}</th>)}
              {catalog.titles.map((t) => <th key={t.id} className={`p-3 normal-case tracking-normal ${t.active ? "" : "opacity-40"}`} title={t.description}>{t.name}<span className="block text-[10px] text-foreground/40">{t.members} people</span></th>)}
              {previewSet && <th className="p-3 bg-primary/10 text-primary">Selected person</th>}
            </tr>
          </thead>
          <tbody>
            {modules.map((mod) => [
              <tr key={mod}><td colSpan={99} className="px-3 pt-4 pb-1 text-xs uppercase tracking-widest text-secondary">{mod}</td></tr>,
              ...catalog.permissions.filter((p) => p.module === mod).map((p) => (
                <tr key={p.key} className="border-t border-border">
                  <td className="p-3">{p.label}</td>
                  {catalog.levels.map((l) => <td key={l.role} className="p-3 text-center"><Check on={l.permissions.includes(p.key)} /></td>)}
                  {catalog.titles.map((t) => (
                    <td key={t.id} className="p-3 text-center">
                      {(() => {
                        const cov = coverage(t, p.key);
                        const ticked = t.permissions.includes(p.key);
                        // Fully covered by level and not ticked: nothing to tick — show a grey note instead.
                        if (cov === "all" && !ticked) {
                          return <span className="text-[11px] italic text-foreground/40" title={`Already given by their level (${levelNames(t, p.key)}) — ticking adds nothing`}>by level</span>;
                        }
                        return (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            {editable ? <input type="checkbox" checked={ticked} onChange={() => void toggle(t, p.key)} /> : <Check on={ticked} />}
                            {cov === "all" && <span className="text-[10px] italic text-foreground/40" title={`Already given by their level (${levelNames(t, p.key)})`}>by level</span>}
                            {cov === "some" && <span className="text-[10px] text-amber-700 dark:text-amber-400" title={`Already given by level for: ${levelNames(t, p.key)}`}>some by level</span>}
                          </span>
                        );
                      })()}
                    </td>
                  ))}
                  {previewSet && <td className="p-3 text-center bg-primary/5"><Check on={previewSet.has(p.key)} /></td>}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      {editable && (
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try { await api("titles", "POST", newTitle); setNewTitle({ name: "", description: "" }); reload(); } catch (err: any) { setError(err.message); }
        }}>
          <Input className="w-56" placeholder="New title, e.g. Calligraphy restorer" value={newTitle.name} onChange={(e) => setNewTitle({ ...newTitle, name: e.target.value })} />
          <Input className="flex-1 min-w-[200px]" placeholder="What this person does" value={newTitle.description} onChange={(e) => setNewTitle({ ...newTitle, description: e.target.value })} />
          <button className={btnPrimary} type="submit">Add title</button>
        </form>
      )}
    </Section>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────
function TeamTab({ me, members, titles, reload }: { me: Me; members: Member[]; titles: Title[]; reload: () => void }) {
  const canManage = me.permissions.includes("staff.manage");
  const manageable = (role: string) => me.role === "admin" || (me.role === "manager" && ["assistant", "coordinator", "handler"].includes(role));
  const [add, setAdd] = useState({ role: "assistant", fullName: "", identifier: "", password: "" });
  const [added, setAdded] = useState<string | null>(null);
  const [reset, setReset] = useState({ identifier: "", password: "" });
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const patch = async (id: string, body: Record<string, unknown>) => {
    setError(null);
    try { await api(`members/${id}`, "PATCH", body); reload(); } catch (e: any) { setError(e.message); }
  };
  return (
    <Section title="Team">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {me.role === "admin" && (
        <form className="flex flex-wrap gap-2 items-center border border-border p-3" onSubmit={async (e) => {
          e.preventDefault(); setError(null); setResetMsg(null);
          try {
            const r = await api("accounts/password", "POST", reset);
            setResetMsg(`Password changed for ${r.fullName ?? reset.identifier}. Tell them the new password.`);
            setReset({ identifier: "", password: "" });
          } catch (err: any) { setError(err.message); }
        }}>
          <span className="text-sm">Reset any user's password</span>
          <Input className="flex-1 min-w-[180px]" placeholder="Their email or phone" value={reset.identifier} onChange={(e) => setReset({ ...reset, identifier: e.target.value })} required />
          <PasswordInput wrapperClassName="w-44" autoComplete="new-password" minLength={6} placeholder="New password (6+)" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} required />
          <button className={btnPrimary} type="submit">Set password</button>
          {resetMsg && <p className="w-full text-sm text-emerald-700">{resetMsg}</p>}
        </form>
      )}
      {canManage && (
        <form className="flex flex-wrap gap-2 items-center border border-border p-3" onSubmit={async (e) => {
          e.preventDefault(); setError(null); setAdded(null);
          try {
            await api("members", "POST", add);
            setAdded(`${add.fullName} can now sign in with ${add.identifier} and the password you set.`);
            setAdd({ ...add, fullName: "", identifier: "", password: "" });
            reload();
          } catch (err: any) { setError(err.message); }
        }}>
          <span className="text-sm">Add a</span>
          <DropSelect className={select} value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
            {LEVELS.filter(manageable).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </DropSelect>
          <Input className="flex-1 min-w-[150px]" placeholder="Full name" value={add.fullName} onChange={(e) => setAdd({ ...add, fullName: e.target.value })} required />
          <Input className="flex-1 min-w-[180px]" placeholder="Email or phone" value={add.identifier} onChange={(e) => setAdd({ ...add, identifier: e.target.value })} required />
          <PasswordInput wrapperClassName="w-40" autoComplete="new-password" minLength={6} placeholder="Password (6+)" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} required />
          <button className={btnPrimary} type="submit">Add staff</button>
          {added && <p className="w-full text-sm text-emerald-700">{added}</p>}
        </form>
      )}
      <div className="border border-border divide-y divide-border">
        {members.map((m) => {
          const editable = canManage && m.id !== me.id && manageable(m.role);
          return (
            <div key={m.id} className="p-4 flex flex-wrap gap-4 items-start">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm text-foreground">{m.fullName} {m.id === me.id && <span className="text-xs text-foreground/40">(you)</span>}</p>
                <p className="text-xs text-foreground/50">{m.email ?? m.phone} · {m.openTasks} open tasks</p>
              </div>
              <DropSelect disabled={!editable} className={select} value={m.role} onChange={(e) => void patch(m.id, { role: e.target.value })}>
                {LEVELS.filter((l) => l === m.role || manageable(l)).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </DropSelect>
              <div className="flex flex-wrap gap-1 max-w-md">
                {titles.filter((t) => t.active || m.titleIds.includes(t.id)).map((t) => {
                  const on = m.titleIds.includes(t.id);
                  return (
                    <button key={t.id} disabled={!editable} onClick={() => void patch(m.id, { titleIds: on ? m.titleIds.filter((x) => x !== t.id) : [...m.titleIds, t.id] })}
                      className={`text-xs px-2 py-1 border ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/50"} disabled:cursor-default`}>{t.name}</button>
                  );
                })}
              </div>
              <button disabled={!editable} className={btn} onClick={() => void patch(m.id, { status: m.status === "active" ? "suspended" : "active" })}>
                {m.status === "active" ? "Suspend" : "Reactivate"}
              </button>
              {editable && (
                <button className={btn} onClick={async () => {
                  const pw = window.prompt(`New password for ${m.fullName} (at least 6 characters):`);
                  if (!pw) return;
                  setError(null);
                  try { await api(`members/${m.id}/password`, "POST", { password: pw }); window.alert("Password updated."); } catch (e: any) { setError(e.message); }
                }}>Set password</button>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Orders ────────────────────────────────────────────────────────────────────
type StaffOrder = {
  id: number; status: string; region: string; channel: string; paymentMethod: string; paymentStatus: string;
  totalAmount: number; currency: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null;
  shippingAddress: string | null; shippingCity: string | null; shippingCountry: string | null; whatsappRef: string | null;
  createdAt: string; items: { id: number; title: string; unitPrice: number; quantity: number }[];
};
const NEXT: Record<string, string[]> = {
  pending_purchase: ["confirmed", "cancelled"], confirmed: ["in_preparation", "shipped", "cancelled"],
  in_preparation: ["shipped", "cancelled"], paid: ["in_preparation", "shipped", "delivered", "cancelled"],
  shipped: ["delivered"], delivered: ["completed", "refunded"], completed: ["refunded"],
};

function OrdersTab({ me }: { me: Me }) {
  const can = (p: string) => me.permissions.includes(p);
  const [filter, setFilter] = useState({ status: "", region: "", channel: "" });
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    try { setOrders(await api(`orders?${q}`)); } catch (e: any) { setError(e.message); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);
  const act = async (path: string, body: unknown) => {
    setError(null);
    try { await api(path, "POST", body); await load(); } catch (e: any) { setError(e.message); }
  };
  return (
    <Section title="Orders" action={
      <div className="flex flex-wrap gap-2 text-sm">
        <DropSelect className={select} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All statuses</option>{Object.keys(NEXT).concat("cancelled", "refunded").map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </DropSelect>
        <DropSelect className={select} value={filter.region} onChange={(e) => setFilter({ ...filter, region: e.target.value })}>
          <option value="">Local + international</option><option value="local">Local</option><option value="international">International</option>
        </DropSelect>
        <DropSelect className={select} value={filter.channel} onChange={(e) => setFilter({ ...filter, channel: e.target.value })}>
          <option value="">Web + WhatsApp</option><option value="web">Web</option><option value="whatsapp">WhatsApp</option>
        </DropSelect>
      </div>
    }>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="border border-border divide-y divide-border">
        {orders.length === 0 && <p className="p-6 text-sm text-foreground/50">No orders match.</p>}
        {orders.map((o) => (
          <div key={o.id} className="p-4 space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
              <span className="font-display text-lg text-primary">#{o.id + 10000}</span>
              <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 border ${ORDER_STATUS_STYLE[o.status] ?? "bg-muted border-border"}`}>{o.status.replace("_", " ")}</span>
              <span className="text-xs">{o.region === "international" ? `International · ${o.shippingCountry ?? ""}` : "Local"} · {o.channel === "whatsapp" ? `WhatsApp ${o.whatsappRef ?? ""}` : "Web"}</span>
              <span className="text-xs">{o.paymentMethod.replace("_", " ")} · <b className={PAYMENT_STYLE[o.paymentStatus] ?? ""}>{o.paymentStatus}</b></span>
              <span className="ml-auto font-display">{o.currency} {Number(o.totalAmount).toLocaleString()}</span>
            </div>
            <p className="text-xs text-foreground/60">{[o.contactName, o.contactPhone, o.contactEmail].filter(Boolean).join(" · ")}{o.shippingAddress ? ` — ${o.shippingAddress}, ${o.shippingCity ?? ""}` : ""}</p>
            <p className="text-xs text-foreground/50">{o.items.map((i) => i.title).join(", ")}</p>
            {can("orders.manage") && (
              <div className="flex flex-wrap gap-2 pt-1">
                {o.channel === "whatsapp" && o.status === "pending_purchase" && (
                  <WhatsappConfirm order={o} onDone={(body) => act(`orders/${o.id}/whatsapp-confirm`, body)} />
                )}
                {(NEXT[o.status] ?? [])
                  .filter((s) => !(o.channel === "whatsapp" && o.status === "pending_purchase" && s === "confirmed"))
                  .filter((s) => !(s === "delivered" && o.paymentMethod === "cod" && o.paymentStatus !== "paid" && can("payments.confirm")))
                  .map((s) => (
                  <button key={s} className={btn} onClick={() => void act(`orders/${o.id}/status`, { status: s })}>{s.replace("_", " ")}</button>
                ))}
                {o.status === "shipped" && o.paymentMethod === "cod" && o.paymentStatus !== "paid" && can("payments.confirm") && (<>
                  <button className={btnPrimary} onClick={() => void act(`orders/${o.id}/status`, { status: "delivered", cashCollected: true })}>Delivered · cash received</button>
                  <button className={btn} onClick={() => void act(`orders/${o.id}/status`, { status: "delivered" })}>Delivered · cash not yet</button>
                </>)}
                {can("payments.confirm") && o.paymentStatus !== "paid" && o.status === "delivered" && (
                  <button className={btn} onClick={() => void act(`orders/${o.id}/payment`, { method: "cod" })}>Cash collected</button>
                )}
                {can("payments.confirm") && o.paymentStatus !== "paid" && o.paymentMethod === "bank_transfer" && !["cancelled", "refunded"].includes(o.status) && (
                  <button className={btn} onClick={() => void act(`orders/${o.id}/payment`, { method: "bank_transfer" })}>Bank transfer received</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

/** "Confirmed in chat": records the delivery details agreed on WhatsApp before confirming. */
function WhatsappConfirm({ order, onDone }: { order: StaffOrder; onDone: (body: Record<string, string>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    shippingAddress: order.shippingAddress ?? "", shippingCity: order.shippingCity ?? "",
    shippingCountry: order.shippingCountry ?? "", contactEmail: order.contactEmail ?? "",
  });
  if (!open) return <button className={btnPrimary} onClick={() => setOpen(true)}>Confirmed in chat</button>;
  const ready = f.shippingAddress.trim() && f.shippingCity.trim();
  const field = (k: keyof typeof f, label: string, wide = false) => (
    <label className={`text-xs ${wide ? "sm:col-span-2" : ""}`}>
      <span className="block text-foreground/60 mb-1">{label}</span>
      <input className="w-full border border-border bg-background px-2 py-1.5 text-sm" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="w-full border border-border p-3 space-y-2 bg-muted/30">
      <p className="text-xs text-foreground/70">Delivery details agreed in the WhatsApp chat:</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {field("shippingAddress", "Address *", true)}
        {field("shippingCity", "City *")}
        {field("shippingCountry", "Country")}
        {field("contactEmail", "Email (optional)", true)}
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={!ready} onClick={() => void onDone(f).then(() => setOpen(false))}>Confirm order</button>
        <button className={btn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

type AuditWho = { name: string | null; email: string | null; phone: string | null; role: string };
type AuditRow = { id: number; event: string; ip: string | null; createdAt: string; accountId: string | null; person: AuditWho | null; actor: AuditWho | null };

const EVENT_LABEL: Record<string, string> = {
  login: "Signed in", logout: "Signed out", login_failed: "Wrong password", login_locked: "Blocked — account locked",
  login_unknown: "Sign-in with unknown email/phone", signup: "Created account", password_changed: "Changed own password",
  password_set: "Password set", staff_created: "Staff account created", staff_updated: "Staff account updated",
  task_deleted: "Task deleted",
  artist_deleted: "Artist deleted (with their account)", gallery_deleted: "Gallery deleted (with its owner's account)",
  linked_to_artist: "Account linked to an artist", linked_to_gallery: "Account linked to a gallery",
  unlinked_from_artist: "Account unlinked from an artist", unlinked_from_gallery: "Account unlinked from a gallery",
  sign_in_changed: "Sign-in email/phone changed",
  account_deleted: "Sign-in account deleted",
};
const ROLE_LABEL: Record<string, string> = {
  ...LEVEL_LABEL, buyer: "Buyer / Collector", artist: "Artist", gallery_owner: "Gallery owner", artwork_owner: "Artwork owner",
};
const isSignIn = (e: string) => e.startsWith("login") || e === "logout";

function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<"all" | "signins">("all");
  const [q, setQ] = useState("");
  const [range, setRange] = useState("4");          // hours, or "custom"
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (range === "custom" && !from) return;
    const qs = range === "custom"
      ? `from=${encodeURIComponent(new Date(from).toISOString())}${to ? `&to=${encodeURIComponent(new Date(to).toISOString())}` : ""}`
      : `hours=${range}`;
    setLoading(true);
    api(`audit?${qs}`).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [range, from, to]);

  const shown = rows.filter((r) => {
    if (filter === "signins" && !isSignIn(r.event)) return false;
    if (!q.trim()) return true;
    const hay = [r.person?.name, r.person?.email, r.person?.phone, r.person?.role, r.actor?.name, r.event, r.ip].join(" ").toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <Section title="Sign-in & activity log" action={
      <div className="flex flex-wrap gap-2 items-center">
        <DropSelect className={select} value={range} onChange={(e) => setRange(e.target.value)} aria-label="Time range">
          <option value="4">Last 4 hours</option><option value="24">Last 1 day</option>
          <option value="168">Last 1 week</option><option value="720">Last 1 month</option>
          <option value="custom">Custom…</option>
        </DropSelect>
        {range === "custom" && (<>
          <label className="text-xs text-foreground/60 flex items-center gap-1">From <input type="datetime-local" className={select} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-foreground/60 flex items-center gap-1">To <input type="datetime-local" className={select} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </>)}
        <DropSelect className={select} value={filter} onChange={(e) => setFilter(e.target.value as "all" | "signins")}>
          <option value="all">All activity</option><option value="signins">Sign-ins only</option>
        </DropSelect>
        <Input className="w-56" placeholder="Search name, email, level…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
    }>
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-widest text-foreground/60">
            <tr><th className="p-3 text-left">When</th><th className="p-3 text-left">What</th><th className="p-3 text-left">Name</th><th className="p-3 text-left">Email / Phone</th><th className="p-3 text-left">Level</th><th className="p-3 text-left">Done by</th><th className="p-3 text-left">IP</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="p-3 text-foreground/60 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className={`p-3 ${r.event.includes("failed") || r.event.includes("locked") || r.event.includes("unknown") ? "text-destructive" : ""}`}>{EVENT_LABEL[r.event] ?? r.event.replace(/_/g, " ")}</td>
                <td className="p-3 font-medium">{r.person?.name ?? (r.accountId ? "Deleted account" : "—")}</td>
                <td className="p-3">{[r.person?.email, r.person?.phone].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-3">{r.person ? ROLE_LABEL[r.person.role] ?? r.person.role : "—"}</td>
                <td className="p-3 text-foreground/70">{r.actor ? `${r.actor.name ?? r.actor.email ?? "—"} (${ROLE_LABEL[r.actor.role] ?? r.actor.role})` : "—"}</td>
                <td className="p-3 text-foreground/40">{r.ip ?? "—"}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="p-6 text-center text-foreground/50">
              {loading ? "Loading…" : range === "custom" && !from ? "Pick a start date and time." : "No activity in this time range."}</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── Artworks review ───────────────────────────────────────────────────────────
type ReviewArtwork = { id: number; title: string; imageUrl: string; artCategory: string | null; artStyle: string | null; year: number | null;
  shortDescription: string | null; status: string; artistName: string; expectedPrice: number | null; displayPrice: number | null };
const pkr = (v: number | null | undefined) => (v == null ? "—" : `PKR ${Number(v).toLocaleString("en-PK")}`);

function ArtworksTab({ canApprove }: { canApprove: boolean }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<ReviewArtwork[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await reviewApi(`artworks/${status}`)); } catch (e: any) { setError(e.message); setRows([]); } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setError(null); setNotice(null);
    try { await fn(); setNotice(msg); await load(); } catch (e: any) { setError(e.message); }
  };
  const shown = rows.filter((a) => !q.trim() || `${a.title} ${a.artistName} ${a.artCategory ?? ""} ${a.artStyle ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Section title="Artworks" action={
      <div className="flex flex-wrap gap-2 items-center">
        <DropSelect className={select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Artwork status">
          <option value="pending">Pending review</option><option value="approved">Approved (live)</option><option value="rejected">Rejected</option>
        </DropSelect>
        <Input className="w-56" placeholder="Search title, artist…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
    }>
      <p className="text-sm text-foreground/60">
        {canApprove ? "You can approve, reject and set the price shown to buyers. Approving or rejecting also closes the matching “Review artwork” task."
          : "You can view artworks here. Approving, rejecting and pricing need the “Approve, reject or edit artworks and prices” right."}
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {loading ? <p className="text-sm text-foreground/50">Loading…</p> : !shown.length ? <p className="text-sm text-foreground/50 border border-border p-6 text-center">No artworks here.</p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((a) => (
            <article key={a.id} className="border border-border bg-card flex flex-col" data-artwork={a.id}>
              <div className="aspect-[4/3] bg-muted/30 overflow-hidden">{a.imageUrl && <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" loading="lazy" />}</div>
              <div className="p-4 space-y-2 flex-1 flex flex-col">
                <div>
                  <h3 className="font-display text-lg text-primary leading-tight">{a.title}</h3>
                  <p className="text-sm text-foreground/70">by {a.artistName}{a.year ? ` · ${a.year}` : ""}</p>
                  <p className="text-xs text-foreground/50">{[a.artCategory, a.artStyle].filter(Boolean).join(" · ")}</p>
                </div>
                {a.shortDescription && <p className="text-sm text-foreground/60 line-clamp-3">{a.shortDescription}</p>}
                <p className="text-xs text-foreground/60">Artist asks: <b>{pkr(a.expectedPrice)}</b> · Shown to buyers: <b>{a.displayPrice == null ? "Price on request" : pkr(a.displayPrice)}</b></p>
                {canApprove && (
                  <div className="mt-auto space-y-2 pt-2">
                    <form className="flex gap-2" onSubmit={(e) => {
                      e.preventDefault();
                      const v = (e.currentTarget.elements.namedItem("price") as HTMLInputElement).value.trim();
                      void act(() => reviewApi(`artworks/${a.id}/price`, "PATCH", { displayPrice: v === "" ? null : Number(v) }), `Price saved for “${a.title}”.`);
                    }}>
                      <Input name="price" type="number" min={0} step="1" placeholder="Price for buyers (PKR)" defaultValue={a.displayPrice ?? ""} />
                      <button type="submit" className={btn}>Save price</button>
                    </form>
                    <div className="flex gap-2">
                      {a.status !== "approved" && <button className={btnPrimary} onClick={() => void act(() => reviewApi(`artworks/${a.id}/approve`, "PATCH"), `“${a.title}” approved — it is now live.`)}>Approve</button>}
                      {a.status !== "rejected" && <button className={`${btn} hover:border-destructive hover:text-destructive`} onClick={() => void act(() => reviewApi(`artworks/${a.id}/reject`, "PATCH"), `“${a.title}” rejected.`)}>Reject</button>}
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Artists review: new artists, profile claims, merge requests ──────────────
type PendingArtist = { id: number; name: string; style: string | null; country: string | null; photoUrl: string | null };
type Claim = { id: number; artistId: number; artistName: string | null; submittedPhone: string | null; storedPhone: string | null; phoneMatched: boolean | null; status: string; adminNote: string | null; createdAt: string; requesterEmail: string };
type Merge = { id: number; submittedName: string; submittedEmail: string | null; submittedPhone: string | null; message: string | null; status: string; createdAt: string; matchedArtistName: string | null };

function ArtistsTab() {
  const [artists, setArtists] = useState<PendingArtist[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [merges, setMerges] = useState<Merge[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [rejecting, setRejecting] = useState<{ id: number; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [a, c, m] = await Promise.all([reviewApi("artists/pending"), reviewApi("artist-claims"), reviewApi("merge-requests")]);
      setArtists(a); setClaims(c); setMerges(m);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setError(null); setNotice(null);
    try { await fn(); setNotice(msg); await load(); } catch (e: any) { setError(e.message); }
  };
  const openClaims = claims.filter((c) => showDone || !["approved", "rejected"].includes(c.status));
  const openMerges = merges.filter((m) => showDone || !["completed", "rejected"].includes(m.status));
  const badge = (st: string) => <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 ${STATUS_STYLE[st === "approved" || st === "completed" ? "done" : st === "rejected" ? "rejected" : "open"]}`}>{st.replace("_", " ")}</span>;

  return (
    <Section title="Artists" action={<label className="text-sm flex items-center gap-2"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show finished claims & requests</label>}>
      <p className="text-sm text-foreground/60">Verify new artists, decide profile claims and handle merge requests. Each decision also closes the matching task.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <h3 className="font-display text-xl text-primary pt-2">New artists waiting for verification ({artists.length})</h3>
      <div className="border border-border divide-y divide-border">
        {!artists.length && <p className="p-4 text-sm text-foreground/50">No artists waiting.</p>}
        {artists.map((a) => (
          <div key={a.id} className="p-4 flex flex-wrap items-center gap-4" data-artist={a.id}>
            <div className="w-12 h-12 bg-muted/30 overflow-hidden shrink-0">{a.photoUrl && <img loading="lazy" decoding="async" src={a.photoUrl} alt={a.name} className="w-full h-full object-cover" />}</div>
            <div className="flex-1 min-w-[180px]"><p className="font-medium">{a.name}</p><p className="text-xs text-foreground/50">{[a.style, a.country].filter(Boolean).join(" · ") || "—"}</p></div>
            <a href={`/artists/${a.id}`} target="_blank" rel="noreferrer" className={btn}>View profile</a>
            <button className={btnPrimary} onClick={() => void act(() => reviewApi(`artists/${a.id}/approve`, "PATCH"), `${a.name} verified.`)}>Verify</button>
            <button className={`${btn} hover:border-destructive hover:text-destructive`} onClick={() => void act(() => reviewApi(`artists/${a.id}/reject`, "PATCH"), `${a.name} rejected.`)}>Reject</button>
          </div>
        ))}
      </div>

      <h3 className="font-display text-xl text-primary pt-4">Profile claims ({openClaims.length})</h3>
      <p className="text-xs text-foreground/50">Someone says an existing artist profile is theirs. Approving links their account to that artist.</p>
      <div className="border border-border divide-y divide-border">
        {!openClaims.length && <p className="p-4 text-sm text-foreground/50">No claims.</p>}
        {openClaims.map((c) => (
          <div key={c.id} className="p-4 space-y-2" data-claim={c.id}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 min-w-[200px]"><b>{c.requesterEmail || "Unknown account"}</b> claims <b>{c.artistName ?? `artist #${c.artistId}`}</b></p>
              {badge(c.status)}
              <span className="text-xs text-foreground/50">{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-foreground/60">Phone given: {c.submittedPhone ?? "—"} · Phone on profile: {c.storedPhone ?? "—"} · {c.phoneMatched ? <span className="text-emerald-700 dark:text-emerald-400">phones match</span> : <span className="text-destructive">phones don't match</span>}</p>
            {c.adminNote && <p className="text-xs text-foreground/60">Note: {c.adminNote}</p>}
            {!["approved", "rejected"].includes(c.status) && (rejecting?.id === c.id ? (
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void act(() => reviewApi(`artist-claims/${c.id}/reject`, "POST", { reason: rejecting.reason }), "Claim rejected.").then(() => setRejecting(null)); }}>
                <Input autoFocus required className="flex-1 min-w-[200px]" placeholder="Why is this claim rejected?" value={rejecting.reason} onChange={(e) => setRejecting({ id: c.id, reason: e.target.value })} />
                <button type="submit" className={`${btn} border-destructive text-destructive`}>Confirm reject</button>
                <button type="button" className={btn} onClick={() => setRejecting(null)}>Cancel</button>
              </form>
            ) : (
              <div className="flex gap-2">
                <button className={btnPrimary} onClick={() => void act(() => reviewApi(`artist-claims/${c.id}/approve`, "POST"), "Claim approved — account linked to the artist.")}>Approve claim</button>
                <button className={btn} onClick={() => setRejecting({ id: c.id, reason: "" })}>Reject</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h3 className="font-display text-xl text-primary pt-4">Merge requests ({openMerges.length})</h3>
      <p className="text-xs text-foreground/50">An artist asks to be joined with an existing record. Contact them, then mark it completed or rejected.</p>
      <div className="border border-border divide-y divide-border">
        {!openMerges.length && <p className="p-4 text-sm text-foreground/50">No merge requests.</p>}
        {openMerges.map((m) => (
          <div key={m.id} className="p-4 space-y-2" data-merge={m.id}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 min-w-[200px]"><b>{m.submittedName}</b>{m.matchedArtistName ? <> → matches <b>{m.matchedArtistName}</b></> : null}</p>
              {badge(m.status)}
              <span className="text-xs text-foreground/50">{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-foreground/60">{[m.submittedEmail, m.submittedPhone].filter(Boolean).join(" · ") || "No contact details"}</p>
            {m.message && <p className="text-sm text-foreground/70">“{m.message}”</p>}
            {!["completed", "rejected"].includes(m.status) && (
              <div className="flex gap-2">
                {m.status !== "contacted" && <button className={btn} onClick={() => void act(() => reviewApi(`merge-requests/${m.id}`, "PATCH", { status: "contacted" }), "Marked as contacted.")}>Mark contacted</button>}
                <button className={btnPrimary} onClick={() => void act(() => reviewApi(`merge-requests/${m.id}`, "PATCH", { status: "completed" }), "Merge request completed.")}>Completed</button>
                <button className={`${btn} hover:border-destructive hover:text-destructive`} onClick={() => void act(() => reviewApi(`merge-requests/${m.id}`, "PATCH", { status: "rejected" }), "Merge request rejected.")}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Galleries review ──────────────────────────────────────────────────────────
type ReviewGallery = { id: number; name: string; email: string | null; phone: string | null; city: string | null; country: string | null; websiteUrl: string | null; logoUrl: string | null; status: string; createdAt: string };

function GalleriesTab() {
  const [rows, setRows] = useState<ReviewGallery[]>([]);
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await reviewApi("galleries")); } catch (e: any) { setError(e.message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setError(null); setNotice(null);
    try { await fn(); setNotice(msg); await load(); } catch (e: any) { setError(e.message); }
  };
  const shown = rows.filter((g) => !status || g.status === status);
  const count = (st: string) => rows.filter((g) => g.status === st).length;

  return (
    <Section title="Galleries" action={
      <DropSelect className={select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Gallery status">
        <option value="pending">Pending ({count("pending")})</option><option value="approved">Approved ({count("approved")})</option>
        <option value="rejected">Rejected ({count("rejected")})</option><option value="">All ({rows.length})</option>
      </DropSelect>
    }>
      <p className="text-sm text-foreground/60">Approve galleries that registered on the site. Approving or rejecting also closes the matching “Verify gallery” task.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <div className="border border-border divide-y divide-border">
        {!shown.length && <p className="p-4 text-sm text-foreground/50">No galleries here.</p>}
        {shown.map((g) => (
          <div key={g.id} className="p-4 flex flex-wrap items-center gap-4" data-gallery={g.id}>
            <div className="w-12 h-12 bg-muted/30 overflow-hidden shrink-0">{g.logoUrl && <img loading="lazy" decoding="async" src={g.logoUrl} alt={g.name} className="w-full h-full object-contain" />}</div>
            <div className="flex-1 min-w-[200px]">
              <p className="font-medium">{g.name}</p>
              <p className="text-xs text-foreground/50">{[g.city, g.country].filter(Boolean).join(", ") || "—"} · {[g.email, g.phone].filter(Boolean).join(" · ") || "no contact"}</p>
              {g.websiteUrl && <a href={g.websiteUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{g.websiteUrl}</a>}
            </div>
            <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 ${STATUS_STYLE[g.status === "approved" ? "done" : g.status === "rejected" ? "rejected" : "open"]}`}>{g.status}</span>
            {g.status !== "approved" && <button className={btnPrimary} onClick={() => void act(() => reviewApi(`galleries/${g.id}/approve`, "PATCH"), `${g.name} approved.`)}>Approve</button>}
            {g.status !== "rejected" && <button className={`${btn} hover:border-destructive hover:text-destructive`} onClick={() => void act(() => reviewApi(`galleries/${g.id}/reject`, "PATCH"), `${g.name} rejected.`)}>Reject</button>}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Staff login (/staff when signed out) ──────────────────────────────────────
function StaffLogin({ signedInAs, onSignedIn, onSignOut }: { signedInAs: string | null; onSignedIn: () => Promise<void>; onSignOut: () => void }) {
  const { refresh } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await authFetch("login", { identifier, password });
      // Only staff accounts may stay signed in here.
      const ok = await fetch("/api/staff/me", { credentials: "include" }).then((r) => r.ok).catch(() => false);
      if (!ok) {
        await authFetch("logout", {}).catch(() => undefined);
        await refresh();
        throw new Error("This is not a staff account. Customers, artists and galleries sign in at /sign-in.");
      }
      await refresh();
      await onSignedIn();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-widest text-secondary mb-2">Staff only</p>
          <h1 className="font-display text-4xl text-primary mb-3">Staff Console</h1>
          <div className="w-16 h-px bg-secondary mx-auto mb-4" />
          <p className="text-foreground/50 italic text-sm">Sign in with your staff email or phone</p>
        </div>
        {signedInAs && (
          <div className="mb-4 border border-border bg-card p-4 text-sm text-foreground/70 text-center space-y-2">
            <p>You are signed in as <b>{signedInAs}</b>, which is not a staff account.</p>
            <button className="text-primary underline" onClick={onSignOut}>Sign out and use a staff account</button>
          </div>
        )}
        <form onSubmit={submit} className="bg-card border border-border p-8 space-y-5">
          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-widest text-foreground/60">Email or phone</span>
            <Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or 03xx xxxxxxx" required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-widest text-foreground/60">Password</span>
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full bg-primary text-primary-foreground font-display tracking-widest uppercase py-3 hover:bg-primary/90 transition-colors disabled:opacity-60">
            {busy ? "Signing in…" : "Enter Staff Console"}
          </button>
        </form>
        <p className="text-center mt-6 text-xs text-foreground/50">
          Forgot your password? Ask the Maktaba Al-Fann admin to reset it.
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StaffConsole() {
  const { user, isLoaded, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<"loading" | "denied" | "ok">("loading");
  const [tab, setTab] = useState("tasks");
  const [types, setTypes] = useState<TaskType[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const loadMe = useCallback(async () => {
    try { setMe(await api("me")); setStatus("ok"); } catch { setStatus("denied"); }
  }, []);
  useEffect(() => { if (isLoaded) void loadMe(); }, [isLoaded, user?.id, loadMe]);

  const loadData = useCallback(async () => {
    if (!me) return;
    const p = me.permissions;
    const [t, c, m] = await Promise.all([
      api("task-types").catch(() => []),
      p.includes("staff.view") ? api("catalog").catch(() => null) : null,
      p.includes("staff.view") ? api("members").catch(() => []) : [],
    ]);
    setTypes(t); setCatalog(c); setMembers(m);
  }, [me]);
  useEffect(() => { void loadData(); }, [loadData]);

  if (status === "loading") return <p className="pt-32 p-12 text-center text-foreground/50">Loading…</p>;
  if (status === "denied" || !me) {
    return <StaffLogin signedInAs={user ? (user.fullName ?? user.email ?? user.phone ?? "this account") : null}
      onSignOut={() => void signOut(() => setStatus("denied"))}
      onSignedIn={async () => { setStatus("loading"); await loadMe(); }} />;
  }

  const can = (p: string) => me.permissions.includes(p);
  const tabs = [
    ["tasks", "Tasks", true], ["orders", "Orders", can("orders.view")], ["rules", "Rules", true], ["roles", "Roles", can("staff.view")],
    ["team", "Team", can("staff.view")], ["artworks", "Artworks", can("artworks.view")], ["artists", "Artists", can("artists.approve")],
    ["galleries", "Galleries", can("galleries.approve")], ["audit", "Audit", can("audit.view")],
  ].filter(([, , show]) => show) as [string, string, boolean][];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-10 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-secondary">Staff console</p>
          <h1 className="font-display text-3xl text-primary">{LEVEL_LABEL[me.role] ?? me.role}{me.titles.length ? ` · ${me.titles.map((t) => t.name).join(", ")}` : ""}</h1>
        </div>
        <div className="flex gap-2">
          {(me.role === "admin" || me.role === "manager") && <Link href="/admin" className={btn}>Gallery admin</Link>}
          {user && <button className={btn} onClick={() => void signOut({ redirectUrl: "/" })}>Sign out</button>}
        </div>
      </header>
      <nav className="flex gap-1 border-b border-border">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm tracking-widest uppercase -mb-px border-b-2 ${tab === key ? "border-primary text-primary" : "border-transparent text-foreground/50 hover:text-foreground"}`}>{label}</button>
        ))}
      </nav>
      {tab === "tasks" && <TasksTab me={me} types={types} members={members} />}
      {tab === "orders" && <OrdersTab me={me} />}
      {tab === "rules" && <RulesTab me={me} types={types} titles={catalog?.titles ?? []} reload={loadData} />}
      {tab === "roles" && catalog && <RolesTab me={me} catalog={catalog} members={members} reload={loadData} />}
      {tab === "team" && <TeamTab me={me} members={members} titles={catalog?.titles ?? []} reload={loadData} />}
      {tab === "artworks" && <ArtworksTab canApprove={can("artworks.approve")} />}
      {tab === "artists" && <ArtistsTab />}
      {tab === "galleries" && <GalleriesTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}
