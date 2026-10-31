import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Maktaba's own sign-in. One account system for every role: email or phone + password.
 * The hook names (`useUser`, `useClerk`, `<Show>`) are kept so the portals didn't need rewriting.
 */
export type AuthUserData = {
  id: string;
  role: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
};

export type CompatUser = AuthUserData & {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  imageUrl: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  updatePassword: (p: { currentPassword: string; newPassword: string }) => Promise<void>;
};

type AuthCtx = {
  user: AuthUserData | null;
  isLoaded: boolean;
  refresh: () => Promise<AuthUserData | null>;
  signOut: (opts?: { redirectUrl?: string } | (() => void)) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export async function authFetch<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong. Please try again."), { status: res.status });
  return data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserData | null>(null);
  const [isLoaded, setLoaded] = useState(false);
  const qc = useQueryClient();
  const prevId = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await authFetch<{ user: AuthUserData | null }>("me");
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // Re-check when the tab is shown again: signing in elsewhere in this browser (e.g. /admin) replaces this sign-in.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => { document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", onShow); };
  }, [refresh]);

  // Clear cached queries when the signed-in user changes (no data leaks between accounts).
  useEffect(() => {
    if (!isLoaded) return;
    const id = user?.id ?? null;
    if (prevId.current !== undefined && prevId.current !== id) qc.clear();
    prevId.current = id;
  }, [user, isLoaded, qc]);

  const signOut = useCallback<AuthCtx["signOut"]>(async (opts) => {
    await authFetch("logout", {}).catch(() => undefined);
    setUser(null);
    if (typeof opts === "function") opts();
    else window.location.href = opts?.redirectUrl ?? (import.meta.env.BASE_URL || "/");
  }, []);

  const value = useMemo(() => ({ user, isLoaded, refresh, signOut }), [user, isLoaded, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}

/** Clerk-compatible `useUser()`. */
export function useUser(): { user: CompatUser | null; isLoaded: boolean; isSignedIn: boolean } {
  const { user, isLoaded } = useAuth();
  const compat = useMemo<CompatUser | null>(() => {
    if (!user) return null;
    const [first, ...rest] = (user.fullName ?? "").split(" ");
    return {
      ...user,
      firstName: first || null,
      lastName: rest.join(" ") || null,
      username: user.email?.split("@")[0] ?? user.phone ?? null,
      imageUrl: null,
      primaryEmailAddress: user.email ? { emailAddress: user.email } : null,
      updatePassword: async (p) => { await authFetch("password/change", p); },
    };
  }, [user]);
  return { user: compat, isLoaded, isSignedIn: Boolean(user) };
}

/** Clerk-compatible `useClerk()` (only what the app used). */
export function useClerk() {
  const { signOut } = useAuth();
  return { signOut };
}

export function Show({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) {
  const { user, isLoaded } = useAuth();
  if (!isLoaded) return null;
  return <>{(when === "signed-in") === Boolean(user) ? children : null}</>;
}
