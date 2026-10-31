import { useState, type FormEvent, type ReactNode } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { authFetch, useAuth } from "@/lib/auth";
import { myPortal, portalOf, rememberPortal } from "@/lib/portal";

/** Only same-site paths are allowed as a post-login redirect. */
function afterPath(): string {
  const after = new URLSearchParams(window.location.search).get("after");
  return after && after.startsWith("/") && !after.startsWith("//") ? after : "/";
}
function withAfter(path: string) {
  const after = new URLSearchParams(window.location.search).get("after");
  return after ? `${path}?after=${encodeURIComponent(after)}` : path;
}

const SIGNUP_ROLES = [
  { value: "buyer", label: "Buyer / Collector", hint: "Buy and collect artwork" },
  { value: "artist", label: "Artist", hint: "Show and sell your work" },
  { value: "gallery_owner", label: "Gallery owner", hint: "Manage your gallery's artists" },
  { value: "artwork_owner", label: "Artwork owner", hint: "List a piece you own" },
];

function Shell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[80dvh] items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-primary tracking-widest mb-2">Maktaba Al-Fann</h1>
          <div className="w-16 h-px bg-secondary mx-auto mb-4" />
          <p className="text-foreground/60 italic text-sm">{subtitle}</p>
        </div>
        <div className="border border-border bg-card p-6 sm:p-8 space-y-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-widest text-foreground/60">{label}</span>
      {children}
    </label>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy}
      className="w-full bg-primary text-primary-foreground py-3 text-sm tracking-widest uppercase hover:opacity-90 disabled:opacity-50 transition">
      {busy ? "Please wait…" : children}
    </button>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (e: FormEvent, fn: () => Promise<void>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

/** Signing in through a portal makes it this account's portal; then go there. */
function goHome(setLocation: (p: string) => void, user: { id: string; role: string }) {
  const after = afterPath();
  if (portalOf(after)) rememberPortal(user, after);
  setLocation(portalOf(after) || after === "/" ? myPortal(user) : after);
}

export function SignInPage() {
  const [, setLocation] = useLocation();
  const { refresh } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();

  return (
    <Shell subtitle="Sign in with your email or phone number">
      <form className="space-y-4" onSubmit={(e) => run(e, async () => {
        const res = await authFetch("login", { identifier, password });
        await refresh();
        goHome(setLocation, res.user);
      })}>
        <Field label="Email or phone">
          <Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or 03xx xxxxxxx" required />
        </Field>
        <Field label="Password">
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorText error={error} />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="text-sm text-center text-foreground/60">
        New here? <Link href={withAfter("/sign-up")} className="text-primary hover:underline">Create an account</Link>
      </p>
      <p className="text-xs text-center text-foreground/50">Forgot your password or want to change it? Please contact the Maktaba Al-Fann admin.</p>
    </Shell>
  );
}

export function SignUpPage() {
  const [, setLocation] = useLocation();
  const { refresh } = useAuth();
  const initialRole = new URLSearchParams(window.location.search).get("role");
  const [role, setRole] = useState(SIGNUP_ROLES.some((r) => r.value === initialRole) ? initialRole! : "buyer");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();

  return (
    <Shell subtitle="Create your account — it takes a minute">
      <form className="space-y-4" onSubmit={(e) => run(e, async () => {
        const { user } = await authFetch("register", { fullName, identifier, password, role });
        await refresh();
        goHome(setLocation, user);
      })}>
        <Field label="I am a">
          <div className="grid grid-cols-2 gap-2">
            {SIGNUP_ROLES.map((r) => (
              <button type="button" key={r.value} onClick={() => setRole(r.value)} aria-pressed={role === r.value}
                className={`text-left border p-3 transition ${role === r.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                <span className="block text-sm text-foreground">{r.label}</span>
                <span className="block text-xs text-foreground/50">{r.hint}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Full name">
          <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Email or phone">
          <Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or 03xx xxxxxxx" required />
        </Field>
        <Field label="Password (at least 6 characters)">
          <PasswordInput autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorText error={error} />
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
      <p className="text-sm text-center text-foreground/60">
        Already have an account? <Link href={withAfter("/sign-in")} className="text-primary hover:underline">Sign in</Link>
      </p>
    </Shell>
  );
}
