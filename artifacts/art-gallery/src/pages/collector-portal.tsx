import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useCartSession } from "@/hooks/useCartSession";
import { TopNav } from "@/components/top-nav";
import {
  Loader2, Crown, Package, Clock, Truck, CheckCircle, Box,
  ChevronRight, LayoutGrid, List, ArrowLeft, LogOut,
} from "lucide-react";
import { formatMoney } from "@/lib/money";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type LineItem = {
  id: number; orderId: number; artworkId: number | null;
  shopItemId: number | null; title: string; imageUrl: string;
  unitPrice: number; quantity: number;
};
type Order = {
  id: number; sessionId: string; status: string;
  totalAmount: number; createdAt: string; items: LineItem[];
};

/* ─── Status helpers ─────────────────────────────────────────────────────── */
const STATUS: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  pending_purchase: { label: "Awaiting Payment", icon: <Clock size={11} />, cls: "text-amber-700 bg-amber-50 border-amber-300" },
  paid:             { label: "Paid",             icon: <CheckCircle size={11} />, cls: "text-emerald-700 bg-emerald-50 border-emerald-300" },
  shipped:          { label: "Shipped",          icon: <Truck size={11} />, cls: "text-sky-700 bg-sky-50 border-sky-300" },
  delivered:        { label: "Delivered",        icon: <Box size={11} />, cls: "text-primary bg-primary/5 border-primary/30" },
};

/* ─── Collected artworks ─────────────────────────────────────────────────── */
function useCollectedArtworks(orders: Order[]) {
  // Deduplicate artworks from all orders; prefer ones with an artworkId
  const seen = new Set<string>();
  const artworks: LineItem[] = [];
  for (const o of orders) {
    for (const li of o.items) {
      if (!li.imageUrl) continue;
      const key = li.artworkId != null ? `a-${li.artworkId}` : `t-${li.title}`;
      if (!seen.has(key)) { seen.add(key); artworks.push(li); }
    }
  }
  return artworks;
}

/* ─── Ornate frame component ─────────────────────────────────────────────── */
function OrnateFrame({ item, size = "md" }: { item: LineItem; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg"
    ? "aspect-[3/4] max-w-xs"
    : size === "sm"
    ? "aspect-square w-full max-w-[180px]"
    : "aspect-[4/5] w-full";

  return (
    <div className="flex flex-col items-center group">
      {/* Outer gilded frame */}
      <div
        className={`relative ${dims} mx-auto`}
        style={{
          boxShadow:
            "0 0 0 3px #c9a84c, 0 0 0 6px #8b6914, 0 0 0 9px #c9a84c, 0 0 0 14px #6b4f0a, 0 4px 32px rgba(0,0,0,0.45)",
        }}
      >
        {/* Inner mat */}
        <div className="absolute inset-[6px] border border-amber-900/30 z-10 pointer-events-none" />
        <img
          src={item.imageUrl}
          alt={item.title}
          className="w-full h-full object-cover"
        />
        {/* Glare overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-black/10 pointer-events-none z-20" />
      </div>

      {/* Nameplate below */}
      <div className="mt-4 text-center max-w-[220px]">
        <div
          className="inline-block px-4 py-1.5 border border-amber-700/40 bg-amber-50/60"
          style={{ boxShadow: "inset 0 1px 0 rgba(201,168,76,0.3)" }}
        >
          <p className="font-display text-[11px] text-primary leading-snug line-clamp-2">{item.title}</p>
          {item.unitPrice > 0 && (
            <p className="text-[9px] text-amber-800 mt-0.5 tracking-widest uppercase">
              {formatMoney(item.unitPrice)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Gallery wall section ────────────────────────────────────────────────── */
function GalleryWall({ artworks }: { artworks: LineItem[] }) {
  if (artworks.length === 0) {
    return (
      <div className="text-center py-24 px-6">
        {/* Italian arch SVG */}
        <svg viewBox="0 0 120 160" className="w-24 h-32 mx-auto mb-8 text-amber-300/60" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 160V90C10 50 110 50 110 90V160" />
          <line x1="10" y1="160" x2="110" y2="160" />
          <line x1="10" y1="120" x2="110" y2="120" />
          <line x1="30" y1="120" x2="30" y2="160" />
          <line x1="90" y1="120" x2="90" y2="160" />
          <circle cx="60" cy="85" r="4" fill="currentColor" opacity="0.4" />
        </svg>
        <h3 className="font-display text-2xl text-primary/60 mb-3">Your walls await their first masterpiece</h3>
        <p className="text-sm text-foreground/40 max-w-xs mx-auto mb-8">
          Begin your collection by browsing our curated selection of Pakistani fine art.
        </p>
        <Link href="/art">
          <span className="inline-block text-[10px] uppercase tracking-[0.28em] font-display bg-primary text-primary-foreground px-8 py-3 hover:bg-primary/90 transition-colors">
            Browse Artworks
          </span>
        </Link>
      </div>
    );
  }

  // Distribute into a masonry-like layout: large, small, medium...
  return (
    <div className="px-6 md:px-12 pb-20">
      {/* Section header */}
      <div className="text-center mb-16">
        <p className="text-[9px] uppercase tracking-[0.35em] text-amber-700 mb-3">Private Collection</p>
        <h2 className="font-display text-4xl text-primary mb-4">Your Gallery</h2>
        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-20 bg-amber-600/40" />
          <span className="text-amber-600/60 text-lg" style={{ fontFamily: "'Scheherazade New', serif" }}>✦</span>
          <div className="h-px w-20 bg-amber-600/40" />
        </div>
        <p className="text-foreground/40 text-xs mt-4 tracking-widest uppercase">
          {artworks.length} {artworks.length === 1 ? "Work" : "Works"} Acquired
        </p>
      </div>

      {/* Gallery rows — varying sizes to feel like a real salon hang */}
      <div className="max-w-5xl mx-auto space-y-20">
        {chunk(artworks, 3).map((row, ri) => (
          <div key={ri} className="relative">
            {/* Picture rail line */}
            <div className="absolute -top-8 left-0 right-0 flex items-center">
              <div className="flex-1 h-px bg-amber-900/15" />
              <div className="mx-4 text-amber-800/20">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <polygon points="6,0 12,6 6,12 0,6" />
                </svg>
              </div>
              <div className="flex-1 h-px bg-amber-900/15" />
            </div>

            <div
              className={`grid gap-8 md:gap-12 items-end ${
                row.length === 1 ? "grid-cols-1 max-w-xs mx-auto" :
                row.length === 2 ? "grid-cols-2 max-w-lg mx-auto" :
                "grid-cols-3"
              }`}
            >
              {row.map((item, ii) => (
                <OrnateFrame
                  key={item.id}
                  item={item}
                  size={ri % 2 === 0 && ii === 1 ? "lg" : ri % 2 === 1 && ii === 0 ? "lg" : "md"}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Orders list ─────────────────────────────────────────────────────────── */
function OrdersList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-24 px-6">
        <Package size={48} strokeWidth={1} className="mx-auto mb-6 text-foreground/20" />
        <h3 className="font-display text-2xl text-primary/60 mb-3">No orders yet</h3>
        <p className="text-sm text-foreground/40 mb-8">Your purchase history will appear here.</p>
        <Link href="/art">
          <span className="inline-block text-[10px] uppercase tracking-[0.28em] font-display bg-primary text-primary-foreground px-8 py-3 hover:bg-primary/90 transition-colors">
            Start Collecting
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 pb-20 space-y-6">
      <div className="text-center mb-12">
        <p className="text-[9px] uppercase tracking-[0.35em] text-secondary mb-3">Purchase History</p>
        <h2 className="font-display text-4xl text-primary mb-4">My Orders</h2>
        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-20 bg-secondary/40" />
          <div className="w-1.5 h-1.5 rounded-full bg-secondary/40" />
          <div className="h-px w-20 bg-secondary/40" />
        </div>
      </div>

      {orders.map((order) => {
        const meta = STATUS[order.status] ?? STATUS["pending_purchase"]!;
        return (
          <div key={order.id} className="bg-card border border-border">
            {/* Order header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-5 border-b border-border">
              <div>
                <p className="font-display text-lg text-primary">Order #{order.id + 10000}</p>
                <p className="text-[10px] uppercase tracking-widest text-foreground/40 mt-0.5">
                  {new Date(order.createdAt).toLocaleDateString("en-GB", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-display text-secondary text-lg">
                  {formatMoney(order.totalAmount)}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] border uppercase tracking-widest ${meta.cls}`}>
                  {meta.icon} {meta.label}
                </span>
              </div>
            </div>

            {/* Line items */}
            <div className="px-6 py-4 space-y-3">
              {order.items.map((li) => (
                <div key={li.id} className="flex items-center gap-4">
                  {li.imageUrl && (
                    <div className="w-14 h-14 overflow-hidden bg-background flex-shrink-0 border border-border"
                         style={{ boxShadow: "0 0 0 2px #c9a84c40" }}>
                      <img src={li.imageUrl} alt={li.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display text-primary truncate">{li.title}</p>
                    <p className="text-[11px] text-foreground/50 mt-0.5">
                      {formatMoney(li.unitPrice)} × {li.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pending payment banner */}
            {order.status === "pending_purchase" && (
              <div className="mx-6 mb-6 bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Please transfer{" "}
                  <strong>{formatMoney(order.totalAmount)}</strong> using reference{" "}
                  <strong>Order #{order.id + 10000}</strong> to complete your purchase.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Utility ─────────────────────────────────────────────────────────────── */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ─── Signed-out gate ────────────────────────────────────────────────────────── */
function CollectorSignedOut() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center mt-[4.5rem] px-4 bg-background py-16 min-h-[calc(100dvh-4.5rem)]">
      <div className="w-full max-w-md">
        <button onClick={() => navigate("/portals")}
          className="text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors mb-8 flex items-center gap-1.5">
          ← Portals
        </button>

        <div className="border border-amber-700/30 bg-card p-10 flex flex-col items-center gap-6 text-center">
          <div className="w-16 h-16 border border-amber-600/30 bg-amber-50/60 flex items-center justify-center">
            <Crown size={28} className="text-amber-700" />
          </div>
          <div>
            <h2 className="font-display text-3xl text-primary mb-2">Collector's Portal</h2>
            <div className="w-16 h-px bg-amber-600/40 mx-auto mb-3" />
            <p className="text-sm text-foreground/50 italic leading-relaxed">
              Sign in to view your private collection and order history.
            </p>
          </div>
          <div className="w-full space-y-3">
            <button
              onClick={() => navigate("/sign-in?after=/collector")}
              className="block w-full font-display uppercase tracking-widest bg-primary text-primary-foreground py-4 hover:bg-primary/90 transition-colors">
              Sign In
            </button>
            <button
              onClick={() => navigate("/sign-up?after=/collector")}
              className="block w-full text-[11px] uppercase tracking-widest text-foreground/50 hover:text-foreground/80 border border-border py-3 transition-colors bg-background">
              New here? Create an account
            </button>
          </div>
          <p className="text-[10px] text-foreground/30 uppercase tracking-widest italic">
            One account for browsing, collecting, and ordering.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export default function CollectorPortal() {
  const [tab, setTab] = useState<"gallery" | "orders">("gallery");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, navigate] = useLocation();

  const sessionId = useCartSession();

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ clerkUserId: user.id });
      if (sessionId) params.set("sessionId", sessionId);
      const res = await fetch(`/api/orders?${params}`);
      if (res.ok) setOrders(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.id, sessionId]);

  useEffect(() => { load(); }, [load]);

  // Show sign-in gate when not authenticated
  if (!user) return <><TopNav /><CollectorSignedOut /></>;

  const collected = useCollectedArtworks(orders);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/* ── Italian Villa Hero ───────────────────────────────────────────── */}
      <div className="relative pt-24 overflow-hidden">
        {/* Warm stone wall texture */}
        <div
          className="relative"
          style={{
            background: "linear-gradient(180deg, #f5efe0 0%, #ede4cc 50%, #f5efe0 100%)",
            minHeight: "320px",
          }}
        >
          {/* Subtle Italian stone pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `repeating-linear-gradient(0deg, #6b4f0a 0px, transparent 1px, transparent 60px, #6b4f0a 61px),
                repeating-linear-gradient(90deg, #6b4f0a 0px, transparent 1px, transparent 80px, #6b4f0a 81px)`,
            }}
          />

          {/* Classical columns (SVG) */}
          <div className="absolute inset-0 pointer-events-none select-none flex items-end justify-between px-8 md:px-16">
            {[0, 1].map((i) => (
              <svg key={i} width="40" height="280" viewBox="0 0 40 280" fill="none" xmlns="http://www.w3.org/2000/svg"
                className="opacity-20 flex-shrink-0">
                {/* Capital */}
                <rect x="2" y="0" width="36" height="8" rx="1" fill="#8b6914" />
                <rect x="6" y="8" width="28" height="5" rx="1" fill="#8b6914" />
                {/* Shaft with fluting */}
                <rect x="10" y="13" width="20" height="240" fill="#c9a84c" opacity="0.6" />
                {[0,1,2,3].map(j => (
                  <rect key={j} x={11 + j*5} y="13" width="1.5" height="240" fill="#8b6914" opacity="0.4" />
                ))}
                {/* Base */}
                <rect x="6" y="253" width="28" height="5" rx="1" fill="#8b6914" />
                <rect x="2" y="258" width="36" height="8" rx="1" fill="#8b6914" />
                <rect x="0" y="266" width="40" height="6" rx="1" fill="#8b6914" />
                <rect x="0" y="272" width="40" height="8" rx="1" fill="#6b4f0a" opacity="0.7" />
              </svg>
            ))}
          </div>

          {/* Central arch with content */}
          <div className="relative z-10 flex flex-col items-center justify-center py-16 px-6 text-center"
               style={{ minHeight: "320px" }}>
            {/* Arch frame SVG */}
            <svg viewBox="0 0 300 60" className="w-48 h-12 mb-4 text-amber-800/30" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M0 60 L0 30 Q150 -20 300 30 L300 60" />
              <line x1="0" y1="60" x2="300" y2="60" />
            </svg>

            <div className="flex items-center gap-3 mb-3">
              <Crown size={20} strokeWidth={1.2} className="text-amber-700" />
              <p className="text-[10px] uppercase tracking-[0.4em] text-amber-800 font-display">
                Private Collection
              </p>
              <Crown size={20} strokeWidth={1.2} className="text-amber-700" />
            </div>

            <h1 className="font-display text-5xl md:text-6xl text-primary mb-4 leading-tight">
              My Gallery
            </h1>

            {user && (
              <p className="text-sm text-foreground/50 mb-2">
                Welcome back,{" "}
                <span className="font-display text-primary">
                  {user.firstName ?? user.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Collector"}
                </span>
              </p>
            )}

            <div className="flex items-center gap-4 mt-2">
              <div className="h-px w-16 bg-amber-700/30" />
              <span className="text-amber-700/50 text-xs" style={{ fontFamily: "'Scheherazade New', serif" }}>✦</span>
              <div className="h-px w-16 bg-amber-700/30" />
            </div>

            {/* Collection stats */}
            {!loading && (
              <div className="flex gap-8 mt-6">
                <div className="text-center">
                  <p className="font-display text-2xl text-primary">{collected.length}</p>
                  <p className="text-[9px] uppercase tracking-widest text-foreground/40">Works</p>
                </div>
                <div className="w-px bg-amber-700/20" />
                <div className="text-center">
                  <p className="font-display text-2xl text-primary">{orders.length}</p>
                  <p className="text-[9px] uppercase tracking-widest text-foreground/40">Orders</p>
                </div>
                <div className="w-px bg-amber-700/20" />
                <div className="text-center">
                  <p className="font-display text-2xl text-primary">
                    {formatMoney(orders.reduce((s, o) => s + o.totalAmount, 0))}
                  </p>
                  <p className="text-[9px] uppercase tracking-widest text-foreground/40">Invested</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom moulding */}
          <div className="absolute bottom-0 left-0 right-0 h-4"
               style={{ background: "linear-gradient(180deg, transparent 0%, rgba(139,105,20,0.12) 100%)" }} />
        </div>

        {/* Cornice / chair rail */}
        <div className="h-2 bg-gradient-to-b from-amber-800/20 to-transparent" />
        <div className="h-px bg-amber-700/25" />
        <div className="h-px bg-amber-700/10 mt-0.5" />
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-[64px] z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-6 flex gap-0">
          {([
            { key: "gallery", label: "My Collection", icon: <LayoutGrid size={13} /> },
            { key: "orders",  label: "My Orders",     icon: <List size={13} /> },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-6 py-4 text-[10px] uppercase tracking-[0.22em] font-display border-b-2 transition-all ${
                tab === key
                  ? "border-secondary text-primary"
                  : "border-transparent text-foreground/45 hover:text-primary"
              }`}
            >
              {icon} {label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-4 pr-2">
            <Link href="/portals">
              <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-foreground/40 hover:text-primary transition-colors">
                <ArrowLeft size={11} /> Portals
              </span>
            </Link>
            <button
              onClick={() => signOut(() => navigate("/portals"))}
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-foreground/40 hover:text-primary transition-colors">
              <LogOut size={11} /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="min-h-[60vh]">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="animate-spin text-primary/40 w-8 h-8" />
          </div>
        ) : tab === "gallery" ? (
          /* Gallery wall — warm stone background */
          <div
            className="relative py-16"
            style={{
              background: `
                linear-gradient(180deg, #f0e8d0 0%, #ede0c0 40%, #f5ead8 100%)
              `,
            }}
          >
            {/* Subtle wainscoting line */}
            <div className="absolute left-0 right-0 bottom-1/3 h-px bg-amber-900/8" />
            <div className="absolute left-0 right-0 bottom-1/3 mt-4 h-px bg-amber-900/5" />

            <GalleryWall artworks={collected} />
          </div>
        ) : (
          <div className="py-16 bg-background">
            <OrdersList orders={orders} />
          </div>
        )}
      </div>

    </div>
  );
}
