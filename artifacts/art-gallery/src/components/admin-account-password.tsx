import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

/** Admin panel: who signs in for this artist/gallery, and set them a new password. */
type Account = { id: string; role: string; status: string; fullName: string | null; email: string | null; phone: string | null; lastLoginAt: string | null; locked: boolean };
const ROLE: Record<string, string> = {
  artist: "Artist", gallery_owner: "Gallery owner", buyer: "Buyer / Collector", artwork_owner: "Artwork owner",
  admin: "Admin", manager: "Manager", curator: "Curator", assistant: "Assistant", coordinator: "Coordinator", handler: "Artist handler",
};
const field = "w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60";
const button = "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40";

async function setPassword(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/accounts/password", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not set the password.");
  return data as { account: Account };
}

function PasswordForm({ onSubmit, label = "Set new password" }: { onSubmit: (pw: string) => Promise<string>; label?: string }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      try { setMsg({ ok: true, text: await onSubmit(pw) }); setPw(""); } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
    }}>
      <div className="flex gap-2">
        <PasswordInput variant="raw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (6+ characters)" minLength={6} required
          className={field} wrapperClassName="flex-1" autoComplete="new-password" />
        <button type="submit" disabled={busy || pw.length < 6} className={button}>{busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}{label}</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</p>}
    </form>
  );
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

/** Sign-in account linked to one artist or one gallery — see it, link one, create one, set its password. */
export function LinkedAccountPassword({ kind, id }: { kind: "artist" | "gallery"; id: number }) {
  type Info = { account: Account | null; staleLink: boolean; suggestion: Account | null; autoLinked?: boolean };
  const [info, setInfo] = useState<Info | undefined>(undefined);
  const [mode, setMode] = useState<"link" | "create">("link");
  const [ident, setIdent] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editLogin, setEditLogin] = useState<string | null>(null);   // null = not editing
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const base = `/api/admin/${kind === "artist" ? "artists" : "galleries"}/${id}`;
  const load = () => fetch(`${base}/account`, { credentials: "include" }).then((r) => r.json())
    .then((d) => setInfo({ account: d.account ?? null, staleLink: !!d.staleLink, suggestion: d.suggestion ?? null, autoLinked: !!d.autoLinked }))
    .catch(() => setInfo({ account: null, staleLink: false, suggestion: null }));
  useEffect(() => { setInfo(undefined); setMsg(null); setIdent(""); setPw(""); setMode("link"); setEditLogin(null); setConfirmUnlink(false); void load(); }, [kind, id]);

  const link = async (identifier: string, create = false) => {
    setBusy(true); setMsg(null);
    try {
      const d = await post(`${base}/link`, { identifier, create, password: create ? pw : undefined });
      setMsg({ ok: true, text: create ? `Account created and linked. They sign in at /sign-in with ${identifier} and the password you set.` : `Linked to ${d.account.email ?? d.account.phone}.` });
      setIdent(""); setPw(""); await load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const who = (a: Account) => [a.email, a.phone].filter(Boolean).join(" · ") || "—";
  const expectedRole = kind === "artist" ? "artist" : "gallery_owner";
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3" data-account-panel={`${kind}-${id}`}>
      <p className="text-xs text-foreground/60 font-display flex items-center gap-1.5"><KeyRound size={12} /> Sign-in account &amp; password</p>
      {info === undefined ? <p className="text-xs text-foreground/40">Loading…</p> : info.account ? (
        <>
          {info.autoLinked && <p className="text-xs text-emerald-700 dark:text-emerald-400">Linked automatically — this account signs in with the same email/phone as the {kind}.</p>}
          <p className="text-xs text-foreground/70">
            Signs in with <b>{who(info.account)}</b> · {ROLE[info.account.role] ?? info.account.role}
            {info.account.lastLoginAt ? ` · last sign-in ${new Date(info.account.lastLoginAt).toLocaleString()}` : " · never signed in"}
            {info.account.locked && <span className="text-destructive"> · locked after wrong passwords</span>}
            {info.account.status !== "active" && <span className="text-destructive"> · {info.account.status}</span>}
          </p>
          {info.account.role !== expectedRole && (
            <p role="alert" className="text-xs text-amber-700 dark:text-amber-400 border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-2">
              This is a <b>{ROLE[info.account.role] ?? info.account.role}</b> account, not {kind === "artist" ? "an Artist" : "a Gallery owner"} account.
              If it's the wrong login, click <b>Unlink</b>, then link or create the right {kind === "artist" ? "artist" : "gallery"} account.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border hover:border-primary hover:text-primary"
              onClick={() => { setEditLogin(info.account!.email ?? info.account!.phone ?? ""); setConfirmUnlink(false); }}>Change sign-in email/phone</button>
            {confirmUnlink ? (
              <>
                <button type="button" disabled={busy} className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-destructive text-destructive"
                  onClick={() => void run(async () => {
                    await post(`${base}/unlink`, {}); setConfirmUnlink(false); await load();
                    return "Unlinked. The account still exists — link or create the right one below.";
                  })}>Yes, unlink</button>
                <button type="button" className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border" onClick={() => setConfirmUnlink(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border hover:border-destructive hover:text-destructive"
                onClick={() => { setConfirmUnlink(true); setEditLogin(null); }}>Unlink account</button>
            )}
          </div>
          {editLogin !== null && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => {
              const d = await post(`/api/admin/accounts/${info.account!.id}/identifier`, { identifier: editLogin });
              setEditLogin(null); setInfo({ ...info, account: { ...info.account!, ...d.account } });
              return `Sign-in changed. They now sign in with ${editLogin.trim()} (same password).`;
            }); }}>
              <input className={field} value={editLogin} onChange={(e) => setEditLogin(e.target.value)} required aria-label="New sign-in email or phone" placeholder="Correct email or phone" />
              <button type="submit" disabled={busy} className={button}>Save</button>
              <button type="button" className="text-[10px] uppercase tracking-widest px-3 border border-border" onClick={() => setEditLogin(null)}>Cancel</button>
            </form>
          )}
          <PasswordForm onSubmit={async (pw) => {
            await setPassword(kind === "artist" ? { artistId: id, password: pw } : { galleryId: id, password: pw });
            setInfo({ ...info, account: { ...info.account!, locked: false } });
            return `Password changed. Give it to them — they sign in at /sign-in with ${info.account!.email ?? info.account!.phone}. They were signed out everywhere.`;
          }} />
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-foreground/60">
            {info.staleLink
              ? "Linked to an old login from before the sign-in change — that login no longer exists. Link their current account below."
              : `No sign-in account is linked to this ${kind}.`}
            {" "}No account signs in with this {kind === "artist" ? "artist's contact email or phone" : "gallery's email or phone"}, so it couldn't be linked automatically.
          </p>
          {info.suggestion && (
            <div className="flex flex-wrap items-center gap-2 border border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs">
              <span className="flex-1">Found an account with the same email/phone: <b>{info.suggestion.fullName}</b> ({who(info.suggestion)} · {ROLE[info.suggestion.role] ?? info.suggestion.role})</span>
              <button className={button} disabled={busy} onClick={() => void link(info.suggestion!.email ?? info.suggestion!.phone ?? "")}>Link this account</button>
            </div>
          )}
          <div className="flex gap-3 text-[10px] uppercase tracking-widest">
            <button type="button" className={mode === "link" ? "text-primary underline" : "text-foreground/50"} onClick={() => setMode("link")}>Link existing account</button>
            <button type="button" className={mode === "create" ? "text-primary underline" : "text-foreground/50"} onClick={() => setMode("create")}>Create new account</button>
          </div>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void link(ident.trim(), mode === "create"); }}>
            <input className={field} value={ident} onChange={(e) => setIdent(e.target.value)} required
              placeholder={mode === "link" ? "Their sign-in email or phone" : "Email or phone they will sign in with"} aria-label="Sign-in email or phone" />
            {mode === "create" && (
              <PasswordInput variant="raw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (6+ characters)" minLength={6} required
                className={field} autoComplete="new-password" />
            )}
            <button type="submit" disabled={busy} className={button}>{busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}{mode === "link" ? "Link account" : "Create & link"}</button>
          </form>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</p>}
    </div>
  );
}

/**
 * Sign-in accounts of this type that no artist/gallery uses — e.g. left behind when a record was deleted
 * before accounts were deleted with it. Search, set a password, or delete the login to free its email.
 */
export function UnlinkedAccounts({ role }: { role: "artist" | "gallery_owner" }) {
  type Row = Account & { createdAt: string };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const load = () => fetch(`/api/admin/accounts/unlinked?role=${role}`, { credentials: "include" }).then((r) => r.json()).then(setRows).catch(() => setRows([]));
  useEffect(() => { void load(); }, [role]);
  const label = role === "artist" ? "artist" : "gallery";
  const shown = (rows ?? []).filter((r) => !q.trim() || `${r.fullName} ${r.email} ${r.phone}`.toLowerCase().includes(q.trim().toLowerCase()));

  const remove = async (r: Row) => {
    setMsg(null);
    const res = await fetch(`/api/admin/accounts/${r.id}`, { method: "DELETE", credentials: "include" });
    const d = await res.json().catch(() => ({}));
    setConfirmId(null);
    if (res.ok) { setMsg({ ok: true, text: `Login ${r.email ?? r.phone} deleted — that email/phone can sign up again.` }); void load(); }
    else setMsg({ ok: false, text: d.error ?? "Could not delete." });
  };

  return (
    <div className="space-y-4" data-unlinked={role}>
      <div>
        <p className="text-sm text-foreground/70">Sign-in accounts of type <b>{ROLE[role]}</b> that no {label} uses — for example logins left behind when a {label} was deleted earlier. Their email/phone stays “taken” until you delete the login here.</p>
      </div>
      <input className={field} placeholder="Search name, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search unlinked logins" />
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</p>}
      {rows === null ? <p className="text-xs text-foreground/40">Loading…</p> : !shown.length ? (
        <p className="text-sm text-foreground/50 border border-dashed border-border p-6 text-center">No unlinked {label} logins.</p>
      ) : (
        <div className="border border-border divide-y divide-border bg-card">
          {shown.map((r) => (
            <div key={r.id} className="p-4 space-y-2" data-login={r.email ?? r.phone ?? r.id}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-medium">{r.fullName ?? "—"}</p>
                  <p className="text-xs text-foreground/60">{[r.email, r.phone].filter(Boolean).join(" · ")}</p>
                  <p className="text-[10px] text-foreground/40 uppercase tracking-widest">Created {new Date(r.createdAt).toLocaleDateString()} · {r.lastLoginAt ? `last sign-in ${new Date(r.lastLoginAt).toLocaleDateString()}` : "never signed in"}</p>
                </div>
                <button className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border hover:border-primary hover:text-primary" onClick={() => { setPwFor(pwFor === r.id ? null : r.id); setConfirmId(null); }}>Set password</button>
                {confirmId === r.id ? (
                  <>
                    <button className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-rose-600 text-white" onClick={() => void remove(r)}>Yes, delete login</button>
                    <button className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border" onClick={() => setConfirmId(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => { setConfirmId(r.id); setPwFor(null); }}>Delete login</button>
                )}
              </div>
              {pwFor === r.id && (
                <PasswordForm onSubmit={async (pw) => {
                  await setPassword({ accountId: r.id, password: pw });
                  return `Password set. They can sign in at /sign-in with ${r.email ?? r.phone}.`;
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
