import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { authFetch, useAuth } from "@/lib/auth";

/** Account & security for every signed-in user: details and password. */
const ROLE_LABEL: Record<string, string> = {
  buyer: "Buyer / collector", artist: "Artist", gallery_owner: "Gallery owner", artwork_owner: "Artwork owner",
  curator: "Curator", handler: "Artist handler", coordinator: "Coordinator", assistant: "Assistant",
  manager: "Manager", admin: "Admin",
};
const PORTAL: Record<string, [string, string]> = {
  buyer: ["/collector", "Collector portal"], artwork_owner: ["/collector", "Collector portal"],
  artist: ["/artist-portal", "Artist portal"], gallery_owner: ["/gallery-portal", "Gallery portal"],
};

export default function AccountPage() {
  const { user, isLoaded, signOut } = useAuth();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  if (!isLoaded) return <p className="pt-36 p-12 text-center text-foreground/50">Loading…</p>;
  if (!user) {
    return (
      <div className="pt-36 pb-24 text-center space-y-3">
        <p className="text-foreground/70">Sign in to manage your account.</p>
        <Link href="/sign-in?after=/account" className="text-primary underline">Sign in</Link>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ kind: "ok", text: ok }); } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  };
  const portal = PORTAL[user.role] ?? (["admin", "manager", "curator", "assistant", "coordinator", "handler"].includes(user.role) ? ["/staff", "Staff console"] : null);

  return (
    <div className="max-w-xl mx-auto px-4 pt-32 pb-24 space-y-8">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-secondary">Account</p>
        <h1 className="font-display text-3xl text-primary">{user.fullName}</h1>
        <p className="text-sm text-foreground/60">{ROLE_LABEL[user.role] ?? user.role}</p>
      </header>

      {msg && <p role="status" className={`text-sm ${msg.kind === "ok" ? "text-emerald-700" : "text-destructive"}`}>{msg.text}</p>}

      <section className="border border-border p-6 space-y-3">
        <h2 className="font-display text-xl text-primary">Sign-in details</h2>
        {user.email && <p className="text-sm">Email: {user.email}</p>}
        {user.phone && <p className="text-sm">Phone: {user.phone}</p>}
      </section>

      <section className="border border-border p-6 space-y-3">
        <h2 className="font-display text-xl text-primary">Change password</h2>
        <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { await authFetch("password/change", { currentPassword: pw.current, newPassword: pw.next }); setPw({ current: "", next: "" }); }, "Password changed. Other devices have been signed out."); }}>
          <label className="block space-y-1"><span className="text-xs uppercase tracking-widest text-foreground/60">Current password</span>
            <PasswordInput autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></label>
          <label className="block space-y-1"><span className="text-xs uppercase tracking-widest text-foreground/60">New password (at least 6 characters)</span>
            <PasswordInput autoComplete="new-password" minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></label>
          <button type="submit" className="px-4 py-2 text-xs uppercase tracking-widest bg-primary text-primary-foreground">Change password</button>
        </form>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        {portal && <Link href={portal[0]} className="text-primary underline">{portal[1]}</Link>}
        {["buyer", "artwork_owner"].includes(user.role) && <Link href="/museum" className="text-primary underline">My Museum</Link>}
        <button className="text-foreground/60 underline" onClick={() => void signOut({ redirectUrl: "/" })}>Sign out</button>
      </div>
    </div>
  );
}
