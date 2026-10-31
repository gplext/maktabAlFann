import { useGetCart, getGetCartQueryKey, useRemoveFromCart } from "@workspace/api-client-react";
import { useCartSession } from "@/hooks/useCartSession";
import { Loader2, Trash2, Package, CheckSquare, Square, Clock, Truck, CheckCircle, Box, Plus, X, ChevronDown, Check } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/lib/auth";
import { CheckoutPanel, OrderPayActions, type PlacedOrder } from "@/components/checkout-panel";
import { useState, useEffect, useCallback } from "react";
import FrameViewerModal from "@/components/FrameViewerModal";
import type { FrameSpec3D, ArtSizeMm } from "@/components/FrameViewer3D";
import { formatMoney, sumMoney } from "@/lib/money";

// Display offset so internal sequential IDs are never exposed as #1, #2, etc.
const ORDER_REF_OFFSET = 10000;
const fmtOrderRef = (id: number) => `#${id + ORDER_REF_OFFSET}`;

type SelectedAddon = { shopItemId: number; name: string; price: number; type: string };
type AvailableAddon = { id: number; name: string; description: string; type: string; price: number; stock: number; isAddon: boolean; compatibleArtCategories: string[]; imageUrl: string; status: string;
  /** Frames only: fit + final size worked out by the server for this artwork. */
  frameSpec?: FrameSpec3D & { madeToMeasure?: boolean }; measured?: boolean };
/** Shop items of type "Frames" (any capitalisation). */
const isFrame = (t: string) => /^frames?$/i.test(t.trim());
const sizeText = (o?: { widthMm: number; heightMm: number; depthMm?: number } | null) =>
  o ? `${o.widthMm} × ${o.heightMm}${o.depthMm ? ` × ${o.depthMm}` : ""} mm` : "";
type ArtworkAddonData = { frameIncluded: boolean; frameDescription: string | null; availableAddons: AvailableAddon[] };

function parseSelectedAddons(notes?: string): SelectedAddon[] {
  if (!notes) return [];
  try {
    const p = JSON.parse(notes);
    return Array.isArray(p.selectedAddons) ? p.selectedAddons : [];
  } catch { return []; }
}

type OrderLineItem = {
  id: number; orderId: number; artworkId: number | null; shopItemId: number | null;
  title: string; imageUrl: string; unitPrice: number; quantity: number;
};
type Order = {
  id: number; sessionId: string; status: string; totalAmount: number; currency: string;
  createdAt: string; items: OrderLineItem[];
};

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  pending_purchase: { label: "Awaiting confirmation", icon: <Clock size={13} />, cls: "text-amber-700 bg-amber-50 border-amber-200" },
  confirmed:        { label: "Confirmed",       icon: <CheckCircle size={13} />, cls: "text-sky-700 bg-sky-50 border-sky-200" },
  in_preparation:   { label: "Being prepared",  icon: <Clock size={13} />, cls: "text-sky-700 bg-sky-50 border-sky-200" },
  completed:        { label: "Completed",       icon: <CheckCircle size={13} />, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  cancelled:        { label: "Cancelled",       icon: <Clock size={13} />, cls: "text-foreground/50 bg-foreground/5 border-foreground/10" },
  refunded:         { label: "Refunded",        icon: <Clock size={13} />, cls: "text-foreground/50 bg-foreground/5 border-foreground/10" },
  paid:             { label: "Paid",            icon: <CheckCircle size={13} />, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  shipped:          { label: "Shipped",         icon: <Truck size={13} />, cls: "text-blue-700 bg-blue-50 border-blue-200" },
  delivered:        { label: "Delivered",       icon: <CheckCircle size={13} />, cls: "text-foreground/60 bg-foreground/5 border-foreground/10" },
};

export default function Cart() {
  const sessionId = useCartSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useUser();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [orderDone, setOrderDone] = useState<{ orderId: number; total: number } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  // `size` is now a bucket code (L, M, ...) with no measurements in it, so the
  // 3D viewer is fed `dimensions` (e.g. `24" x 36"`) to work out the aspect ratio.
  const [viewer3D, setViewer3D] = useState<{ imageUrl: string; title: string; artistName: string; size?: string | null; artMm?: ArtSizeMm | null; spec?: FrameSpec3D | null; frameName?: string | null } | null>(null);

  // ── Inline order form (for unauthenticated collectors) ────────────────────

  // ── Add-on state ─────────────────────────────────────────────────────────
  const [addonDataMap, setAddonDataMap] = useState<Record<number, ArtworkAddonData>>({});
  const [openFramePicker, setOpenFramePicker] = useState<number | null>(null);
  const [openAddonPicker, setOpenAddonPicker] = useState<number | null>(null);
  const [savingAddons, setSavingAddons] = useState<Set<number>>(new Set());

  const { data: cart, isLoading } = useGetCart(
    { sessionId },
    { query: { enabled: !!sessionId, queryKey: getGetCartQueryKey({ sessionId }) } }
  );

  const removeFromCart = useRemoveFromCart();

  const loadOrders = useCallback(async () => {
    // Only load order history for signed-in users — guests see no order history
    // in the cart to prevent cross-account order leakage on shared browsers.
    if (!user?.id) { setOrders([]); return; }
    setOrdersLoading(true);
    const params = new URLSearchParams({ clerkUserId: user.id });
    if (sessionId) params.set("sessionId", sessionId); // claim pre-signup session orders
    const res = await fetch(`/api/orders?${params}`);
    if (res.ok) setOrders(await res.json());
    setOrdersLoading(false);
  }, [sessionId, user?.id]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Fetch per-artwork frame info + available add-ons whenever the cart changes
  useEffect(() => {
    if (!sessionId || !cart?.items.length) return;
    fetch(`/api/cart/${encodeURIComponent(sessionId)}/addons`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => setAddonDataMap(data))
      .catch(() => {});
  }, [sessionId, cart?.items.length]);

  const updateAddons = async (artworkId: number, selectedAddons: SelectedAddon[]) => {
    if (!sessionId) return;
    const notesJson = JSON.stringify({ selectedAddons });
    // Optimistic update so UI reacts instantly
    queryClient.setQueryData(getGetCartQueryKey({ sessionId }), (old: any) => {
      if (!old) return old;
      return { ...old, items: old.items.map((i: any) => i.artworkId === artworkId ? { ...i, notes: notesJson } : i) };
    });
    setOpenFramePicker(null);
    setOpenAddonPicker(null);
    setSavingAddons((prev) => new Set(prev).add(artworkId));
    try {
      await fetch(`/api/cart/${encodeURIComponent(sessionId)}/items/${artworkId}/addons`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedAddons }),
      });
    } catch { /* ignore */ }
    setSavingAddons((prev) => { const n = new Set(prev); n.delete(artworkId); return n; });
  };

  const handleRemove = (artworkId: number) => {
    removeFromCart.mutate(
      { sessionId, artworkId },
      {
        onSuccess: (updatedCart) => {
          queryClient.setQueryData(getGetCartQueryKey({ sessionId }), updatedCart);
          setSelectedIds((prev) => { const next = new Set(prev); next.delete(artworkId); return next; });
          toast({ title: "Removed from Collection" });
        },
      }
    );
  };

  const toggleSelect = (artworkId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(artworkId)) next.delete(artworkId); else next.add(artworkId);
      return next;
    });
  };

  const selectedItems = cart?.items.filter((i) => selectedIds.has(i.artworkId)) ?? [];

  // Shown to the user before they commit. The server recomputes this from the
  // catalogue when the order is placed — this figure is a preview, never the
  // price that gets charged.
  const totalPrice = sumMoney(
    selectedItems.flatMap((i) => [i.displayPrice, ...parseSelectedAddons(i.notes).map((a) => a.price)]),
  );

  /**
   * Turn the selection into the order payload.
   *
   * Only ids and quantities — the endpoint reads every price from the database.
   * Add-ons become their own line items so the order total always equals the
   * sum of its lines; the old flow priced add-ons into the total but never
   * recorded them, which is why order #46 totalled 97,015 against 97,000 of
   * line items.
   */
  const buildOrderItems = () =>
    selectedItems.flatMap((i) => [
      { artworkId: i.artworkId, quantity: 1 },
      // A frame is sent with the artwork it frames, so the server checks the fit and prices it for that size.
      ...parseSelectedAddons(i.notes).map((a) => ({ shopItemId: a.shopItemId, quantity: 1, ...(isFrame(a.type) ? { forArtworkId: i.artworkId } : {}) })),
    ]);

  /** Called by the checkout panel once the server has created the order. */
  const handleOrderPlaced = async (order: PlacedOrder) => {
    await Promise.all(
      selectedItems.map((i) =>
        fetch(`/api/cart/${encodeURIComponent(sessionId)}/items/${i.artworkId}`, { method: "DELETE" })
      )
    );
    queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
    setSelectedIds(new Set());
    // Use the server's total, not the preview — if they ever differ, the server is right.
    setOrderDone({ orderId: order.id, total: order.totalAmount });
    await loadOrders().catch(() => undefined);
  };

  const pendingOrdersCount = orders.filter((o) => o.status === "pending_purchase").length;

  // ── Thank you screen ────────────────────────────────────────────────────────
  if (orderDone) {
    return (
      <div className="bg-background min-h-screen text-foreground pt-32 pb-24 px-6 md:px-12 flex items-start justify-center">
        <div className="max-w-2xl w-full text-center">
          <CheckCircle size={56} className="text-secondary mx-auto mb-8" />
          <p className="text-xs uppercase tracking-widest text-secondary mb-4">Order {fmtOrderRef(orderDone.orderId)}</p>
          <h1 className="font-display text-4xl md:text-5xl text-primary mb-6">Thank You for Your Purchase</h1>
          <div className="w-24 h-px bg-secondary mx-auto mb-10" />
          <p className="text-foreground/70 text-lg mb-6">
            Your order of <span className="font-display text-secondary">{formatMoney(orderDone.total)}</span> has been received.
          </p>
          <p className="text-sm text-foreground/50 mb-10 leading-relaxed">
            Our team will contact you shortly to arrange payment and confirm your order.<br />
            Please quote <strong>Order {fmtOrderRef(orderDone.orderId)}</strong> in any correspondence.
          </p>
          <button onClick={() => setOrderDone(null)} className="font-display uppercase tracking-widest border border-primary text-primary px-10 py-3 hover:bg-primary hover:text-primary-foreground transition-colors">
            Back to Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-foreground pt-32 pb-24 px-6 md:px-12">
      <div className="container mx-auto max-w-5xl">

        {/* Pending orders ticker */}
        {pendingOrdersCount > 0 && (
          <div className="mb-8 bg-amber-50 border border-amber-200 px-5 py-3 flex items-center gap-3">
            <Clock size={15} className="text-amber-700 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              You have <strong>{pendingOrdersCount}</strong> pending order{pendingOrdersCount > 1 ? "s" : ""} awaiting payment —
              <button onClick={() => document.getElementById("order-summary")?.scrollIntoView({ behavior: "smooth" })} className="underline ml-1 hover:text-amber-900">view below</button>
            </p>
          </div>
        )}

        <header className="mb-20 text-center">
          <h1 className="text-5xl md:text-6xl font-display text-primary mb-6">Your Collection</h1>
          <div className="w-24 h-[1px] bg-secondary mx-auto mb-8" />
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto italic">
            Pieces that have spoken to you. Select works and place your order as an art collector.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-32"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="text-center py-32 border border-border bg-card">
            <p className="text-xl text-foreground/60 font-display mb-8">Your collection is empty.</p>
            <Link href="/art" className="inline-flex items-center gap-4 text-primary hover:text-secondary transition-colors group">
              <span className="font-display text-xl uppercase tracking-widest">Return to Gallery</span>
              <div className="w-12 h-[1px] bg-current group-hover:w-20 transition-all" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">

            {/* ── Cart items ─────────────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-8">
              {cart.items.map((item) => {
                const selectedAddons = parseSelectedAddons(item.notes);
                const isSelected = selectedIds.has(item.artworkId);
                const inWarehouse = item.storageLocationName === "Company warehouse";
                return (
                  <div key={item.artworkId}
                    className={`bg-card border transition-colors ${isSelected ? "border-secondary/60" : "border-border"}`}>
                    <div className="flex flex-col sm:flex-row gap-8 p-6">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(item.artworkId)}
                        className="hidden sm:flex items-start pt-1 text-foreground/40 hover:text-secondary transition-colors flex-shrink-0"
                        title={isSelected ? "Deselect" : "Select"}
                      >
                        {isSelected ? <CheckSquare size={20} className="text-secondary" /> : <Square size={20} />}
                      </button>

                      <div className="w-full sm:w-1/3 aspect-square sm:aspect-auto sm:h-48 overflow-hidden bg-background relative">
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain" />
                        {inWarehouse && (
                          <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[9px] uppercase tracking-widest px-1.5 py-0.5">In Stock</span>
                        )}
                      </div>
                      <div className="w-full sm:flex-1 flex flex-col justify-between">
                        {/* Mobile checkbox */}
                        <div className="flex items-start justify-between mb-2 sm:hidden">
                          <h3 className="text-2xl font-display text-primary"><Link href={`/art/${item.artworkId}`} className="hover:text-secondary transition-colors">{item.title}</Link></h3>
                          <button onClick={() => toggleSelect(item.artworkId)} className="text-foreground/40 hover:text-secondary transition-colors ml-4 flex-shrink-0">
                            {isSelected ? <CheckSquare size={20} className="text-secondary" /> : <Square size={20} />}
                          </button>
                        </div>
                        <div className="hidden sm:block">
                          <h3 className="text-2xl font-display text-primary mb-2">
                            <Link href={`/art/${item.artworkId}`} className="hover:text-secondary transition-colors">{item.title}</Link>
                          </h3>
                        </div>
                        <p className="text-foreground/60 italic mb-2">by {item.artistName}</p>
                        {item.size && <p className="text-sm uppercase tracking-widest text-foreground/50">{item.size}</p>}
                        {item.storageLocationName && (
                          <p className="text-xs uppercase tracking-widest mt-1 text-foreground/40">{item.storageLocationName}</p>
                        )}
                        <div className="flex justify-between items-end mt-6 pt-6 border-t border-border">
                          <span className="text-secondary font-display text-lg">
                            {formatMoney(item.displayPrice)}
                          </span>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => {
                                // Show the chosen frame to scale when we know it; else the artwork alone.
                                const chosen = parseSelectedAddons(item.notes).find((a) => isFrame(a.type));
                                const frame = addonDataMap[item.artworkId]?.availableAddons.find((a) => a.id === chosen?.shopItemId);
                                const spec = frame?.frameSpec ?? null;
                                const artMm: ArtSizeMm | null = spec?.artwork
                                  ?? (item.widthCm && item.heightCm ? { widthMm: item.widthCm * 10, heightMm: item.heightCm * 10, depthMm: 20 } : null);
                                setViewer3D({
                                  imageUrl: item.imageUrl,
                                  title: item.title,
                                  artistName: item.artistName,
                                  size: item.dimensions
                                    || (item.widthCm && item.heightCm ? `${item.widthCm} x ${item.heightCm} cm` : item.sizeLabel),
                                  artMm, spec: spec?.outer ? spec : null, frameName: frame?.name ?? null,
                                });
                              }}
                              className="text-foreground/50 hover:text-secondary transition-colors flex items-center gap-2 text-sm uppercase tracking-widest"
                              title="View in 3D Frame"
                            >
                              <Box size={15} />
                              <span className="hidden sm:inline">View in 3D</span>
                            </button>
                            <button
                              onClick={() => handleRemove(item.artworkId)}
                              disabled={removeFromCart.isPending}
                              className="text-foreground/50 hover:text-destructive transition-colors flex items-center gap-2 text-sm uppercase tracking-widest"
                            >
                              <Trash2 size={16} />Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── Accessories panel ── */}
                    {(() => {
                      const addonData = addonDataMap[item.artworkId];
                      const frameAddon = selectedAddons.find((a) => isFrame(a.type));
                      const otherAddons = selectedAddons.filter((a) => !isFrame(a.type));
                      const availableFrames = addonData?.availableAddons.filter((a) => isFrame(a.type)) ?? [];
                      const availableOthers = addonData?.availableAddons.filter((a) => !isFrame(a.type)) ?? [];
                      const unselectedOthers = availableOthers.filter((a) => !otherAddons.some((s) => s.shopItemId === a.id));
                      const isSaving = savingAddons.has(item.artworkId);
                      const isFrameOpen = openFramePicker === item.artworkId;
                      const isAddonOpen = openAddonPicker === item.artworkId;

                      if (!addonData && selectedAddons.length === 0) return null;

                      const removeAddon = (shopItemId: number) =>
                        updateAddons(item.artworkId, selectedAddons.filter((a) => a.shopItemId !== shopItemId));

                      const selectFrame = (frame: AvailableAddon | null) => {
                        const withoutFrames = selectedAddons.filter((a) => !isFrame(a.type));
                        updateAddons(item.artworkId, frame
                          ? [...withoutFrames, { shopItemId: frame.id, name: frame.name, price: frame.price, type: frame.type }]
                          : withoutFrames);
                      };

                      const addOther = (addon: AvailableAddon) =>
                        updateAddons(item.artworkId, [...selectedAddons, { shopItemId: addon.id, name: addon.name, price: addon.price, type: addon.type }]);

                      const frameLabel = frameAddon?.name ?? (addonData?.frameIncluded ? (addonData.frameDescription || "Standard Frame") : "No frame");
                      const frameIsIncluded = !frameAddon && !!addonData?.frameIncluded;

                      return (
                        <div className="border-t border-border/50 bg-foreground/[0.015] px-6 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[9px] uppercase tracking-widest text-foreground/40 flex items-center gap-1.5">
                              <Package size={10} /> Accessories
                            </p>
                            {isSaving && <Loader2 size={11} className="animate-spin text-foreground/30" />}
                          </div>
                          <table className="w-full text-xs border-collapse">
                            <tbody>
                              {/* Frame row */}
                              {(addonData || frameAddon) && (
                                <>
                                  <tr className="border-b border-border/30">
                                    <td className="py-2 pr-3 text-[10px] uppercase tracking-widest text-foreground/40 whitespace-nowrap w-24">Frame</td>
                                    <td className="py-2 pr-3">
                                      <span className="text-foreground/80">{frameLabel}</span>
                                      {(() => {
                                        const spec = availableFrames.find((f) => f.id === frameAddon?.shopItemId)?.frameSpec;
                                        return spec?.outer ? <span className="block text-[10px] text-foreground/50 mt-0.5">Final size {sizeText(spec.outer)}</span> : null;
                                      })()}
                                      {frameIsIncluded && (
                                        <span className="ml-2 text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 uppercase tracking-widest">Included</span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right text-foreground/50 whitespace-nowrap">
                                      {frameAddon ? formatMoney(frameAddon.price) : "—"}
                                    </td>
                                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {availableFrames.length > 0 && (
                                          <button
                                            onClick={() => { setOpenFramePicker(isFrameOpen ? null : item.artworkId); setOpenAddonPicker(null); }}
                                            className="text-[9px] uppercase tracking-widest text-primary/60 hover:text-primary border border-primary/20 hover:border-primary/50 px-2 py-0.5 transition flex items-center gap-0.5">
                                            <ChevronDown size={9} />{frameAddon ? "Change" : "Add Frame"}
                                          </button>
                                        )}
                                        {frameAddon && (
                                          <button onClick={() => removeAddon(frameAddon.shopItemId)} className="text-foreground/30 hover:text-rose-500 transition">
                                            <X size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                  {isFrameOpen && (
                                    <tr>
                                      <td colSpan={4} className="pb-2 pt-0">
                                        <div className="bg-card border border-border shadow-sm divide-y divide-border/40">
                                          {addonData?.frameIncluded && (
                                            <button onClick={() => selectFrame(null)}
                                              className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-foreground/5 transition text-left ${!frameAddon ? "bg-secondary/5" : ""}`}>
                                              <span className="text-foreground/80">{addonData.frameDescription || "Standard Frame"} <span className="text-[9px] text-emerald-700 ml-1 uppercase tracking-widest">Included</span></span>
                                              {!frameAddon && <Check size={11} className="text-secondary flex-shrink-0" />}
                                            </button>
                                          )}
                                          {availableFrames.map((f) => (
                                            <button key={f.id} onClick={() => selectFrame(f)}
                                              className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-foreground/5 transition text-left ${frameAddon?.shopItemId === f.id ? "bg-secondary/5" : ""}`}>
                                              <div className="min-w-0 pr-4">
                                                <span className="text-foreground/80">{f.name}</span>
                                                {f.description && <span className="ml-2 text-[9px] text-foreground/40 italic">{f.description}</span>}
                                                {f.frameSpec?.outer
                                                  ? <span className="block text-[10px] text-foreground/50">Final size {sizeText(f.frameSpec.outer)}{f.frameSpec.madeToMeasure ? " · made to measure" : ""}{f.frameSpec.glazing !== "none" ? ` · ${f.frameSpec.glazing.replace("_", "-")}` : ""}</span>
                                                  : !f.measured && <span className="block text-[10px] text-foreground/40">Size not checked</span>}
                                              </div>
                                              <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-secondary font-display">{formatMoney(f.price)}</span>
                                                {frameAddon?.shopItemId === f.id && <Check size={11} className="text-secondary" />}
                                              </div>
                                            </button>
                                          ))}
                                          {(addonData?.frameIncluded || frameAddon) && (
                                            <button onClick={() => selectFrame(null)}
                                              className="w-full flex items-center px-3 py-2 hover:bg-foreground/5 transition text-foreground/40 text-[10px] uppercase tracking-widest">
                                              Remove frame
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              )}
                              {/* Other add-on rows */}
                              {otherAddons.map((addon) => (
                                <tr key={addon.shopItemId} className="border-b border-border/30">
                                  <td className="py-2 pr-3 text-[10px] uppercase tracking-widest text-foreground/40 whitespace-nowrap">{addon.type}</td>
                                  <td className="py-2 pr-3 text-foreground/80">{addon.name}</td>
                                  <td className="py-2 px-3 text-right text-foreground/50 whitespace-nowrap">{formatMoney(addon.price)}</td>
                                  <td className="py-2 pl-2 text-right">
                                    <button onClick={() => removeAddon(addon.shopItemId)} className="text-foreground/30 hover:text-rose-500 transition"><X size={12} /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {unselectedOthers.length > 0 && (
                            <div className="mt-2 relative">
                              <button
                                onClick={() => { setOpenAddonPicker(isAddonOpen ? null : item.artworkId); setOpenFramePicker(null); }}
                                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition py-1">
                                <Plus size={11} /> Add accessory
                              </button>
                              {isAddonOpen && (
                                <div className="absolute left-0 top-7 z-20 bg-card border border-border shadow-md divide-y divide-border/40 min-w-52">
                                  {unselectedOthers.map((addon) => (
                                    <button key={addon.id} onClick={() => addOther(addon)}
                                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-foreground/5 transition text-left gap-4">
                                      <div className="min-w-0">
                                        <p className="text-xs text-foreground/80">{addon.name}</p>
                                        <p className="text-[9px] text-foreground/40 uppercase tracking-widest">{addon.type}</p>
                                      </div>
                                      <span className="text-xs text-secondary font-display flex-shrink-0">{formatMoney(addon.price)}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {/* ── Sidebar ─────────────────────────────────────────────────── */}
            <div className="lg:col-span-1">
              <div className="bg-card border border-border p-8 sticky top-32">
                <h3 className="text-2xl font-display text-primary mb-6 border-b border-border pb-4">Your Selection</h3>

                {selectedItems.length === 0 ? (
                  <p className="text-sm text-foreground/50 italic mb-6">
                    Select artworks from your collection to place an order.
                  </p>
                ) : (
                  <div className="space-y-1.5 mb-4">
                    {selectedItems.map((i) => {
                      const lineTotal = sumMoney([i.displayPrice, ...parseSelectedAddons(i.notes).map((a) => a.price)]);
                      return (
                        <div key={i.artworkId} className="flex justify-between text-sm gap-2">
                          <span className="text-foreground/70 truncate">{i.title}</span>
                          <span className="text-foreground/50 flex-shrink-0">
                            {lineTotal > 0 ? formatMoney(lineTotal) : "—"}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between pt-4 border-t border-border/50 mt-2">
                      <span className="text-xs uppercase tracking-widest text-foreground/60">Total</span>
                      <span className="font-display text-secondary text-lg">
                        {totalPrice > 0 ? formatMoney(totalPrice) : "—"}
                      </span>
                    </div>
                  </div>
                )}

                <CheckoutPanel
                  sessionId={sessionId}
                  items={buildOrderItems}
                  disabled={selectedItems.length === 0}
                  onPlaced={handleOrderPlaced}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── 3D Frame Viewer Modal ─────────────────────────────────────────── */}
        <FrameViewerModal
          open={viewer3D !== null}
          onClose={() => setViewer3D(null)}
          imageUrl={viewer3D?.imageUrl ?? ""}
          title={viewer3D?.title ?? ""}
          artistName={viewer3D?.artistName ?? ""}
          size={viewer3D?.size}
          artMm={viewer3D?.artMm}
          spec={viewer3D?.spec}
          frameName={viewer3D?.frameName}
        />

        {/* ── Order History ──────────────────────────────────────────────────── */}
        {(orders.length > 0 || ordersLoading) && (
          <div id="order-summary" className="mt-20">
            <div className="mb-8">
              <p className="text-xs uppercase tracking-widest text-secondary mb-2">Your Purchase History</p>
              <h2 className="font-display text-3xl text-primary">Orders</h2>
              <div className="w-16 h-px bg-secondary mt-3" />
            </div>
            {ordersLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary/40 w-8 h-8" /></div>
            ) : (
              <div className="space-y-6">
                {orders.map((order) => {
                  const meta = STATUS_META[order.status] ?? STATUS_META["pending_purchase"]!;
                  return (
                    <div key={order.id} className="bg-card border border-border p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border">
                        <div>
                          <p className="font-display text-lg text-primary">Order {fmtOrderRef(order.id)}</p>
                          <p className="text-xs uppercase tracking-widest text-foreground/40 mt-0.5">{new Date(order.createdAt).toLocaleDateString("en-AE", { year: "numeric", month: "long", day: "numeric" })}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-display text-secondary text-lg">{formatMoney(order.totalAmount, { currency: order.currency })}</span>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border uppercase tracking-widest ${meta.cls}`}>
                            {meta.icon}{meta.label}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {order.items.map((li) => (
                          <div key={li.id} className="flex items-center gap-4">
                            {li.imageUrl && (
                              <div className="w-12 h-12 overflow-hidden bg-background flex-shrink-0">
                                <img src={li.imageUrl} alt={li.title} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-display text-primary truncate">{li.title}</p>
                              <p className="text-xs text-foreground/50">{formatMoney(li.unitPrice, { currency: order.currency })} × {li.quantity}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <OrderPayActions order={order as any} onChange={() => void loadOrders()} />
                      {order.status === "pending_purchase" && (
                        <div className="mt-4 pt-4 border-t border-border bg-amber-50/50 -mx-6 -mb-6 px-6 py-4">
                          <p className="text-xs text-amber-800 leading-relaxed">
                            Awaiting payment — our team will contact you with payment details. Quote reference <strong>Order {fmtOrderRef(order.id)}</strong>.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
