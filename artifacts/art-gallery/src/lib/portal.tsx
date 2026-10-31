import type { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

/**
 * A signed-in person sees only one portal: the one they signed in through
 * (remembered per account on this device), or their role's default.
 */
export const PORTALS: Record<string, string> = {
  "/artist-portal": "Artist Portal",
  "/gallery-portal": "Gallery Portal",
  "/collector": "Collector Portal",
  "/staff": "Staff Console",
};

const ROLE_PORTAL: Record<string, string> = {
  artist: "/artist-portal",
  gallery_owner: "/gallery-portal",
  buyer: "/collector",
  artwork_owner: "/collector",
  admin: "/staff", manager: "/staff", curator: "/staff",
  assistant: "/staff", coordinator: "/staff", handler: "/staff",
};
const STAFF = new Set(["admin", "manager", "curator", "assistant", "coordinator", "handler"]);
const key = (userId: string) => `maktaba.portal.${userId}`;

/** Which portal a path belongs to ("/artist-portal/submit" → "/artist-portal"). */
export function portalOf(path: string): string | null {
  return Object.keys(PORTALS).find((p) => path === p || path.startsWith(p + "/")) ?? null;
}

export function rememberPortal(user: { id: string; role: string }, path: string) {
  const p = portalOf(path);
  if (!p || STAFF.has(user.role) || p === "/staff") return;
  try { localStorage.setItem(key(user.id), p); } catch { /* storage unavailable */ }
}

export function myPortal(user: { id: string; role: string }): string {
  if (STAFF.has(user.role)) return "/staff";
  try {
    const saved = localStorage.getItem(key(user.id));
    if (saved && PORTALS[saved]) return saved;
  } catch { /* storage unavailable */ }
  return ROLE_PORTAL[user.role] ?? "/collector";
}

/** Signed-in users who open another portal are sent to their own. Signed-out users see the page. */
export function PortalGuard({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useAuth();
  const [location] = useLocation();
  if (!isLoaded || !user) return <>{children}</>;
  const mine = myPortal(user);
  const here = portalOf(location);
  if (here && here !== mine) return <Redirect to={mine} replace />;
  return <>{children}</>;
}
