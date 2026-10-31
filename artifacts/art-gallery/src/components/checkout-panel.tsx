import { useEffect, useState, type ReactNode, type FormEvent, type ChangeEvent } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { Loader2, MessageCircle, LogIn, Globe2, MapPin } from "lucide-react";
import { authFetch, useAuth } from "@/lib/auth";

/**
 * Checkout: 1) where are you buying from  2) sign in & buy, or WhatsApp
 * 3) details + payment. Prices are never sent — the server totals the order.
 *
 *  Local:          cash on delivery or bank transfer; card after delivery.
 *  International:  card (Stripe) before shipping, or WhatsApp.
 */
type OrderItem = { artworkId?: number | null; shopItemId?: number | null; quantity: number; forArtworkId?: number };
export type PlacedOrder = { id: number; totalAmount: number; whatsappRef?: string | null; whatsappUrl?: string | null };

const field = "w-full border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-secondary";
const label = "block text-[10px] uppercase tracking-widest text-foreground/50 mb-1";

function Choice({ active, onClick, icon, title, hint }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; hint: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex-1 text-left border p-3 transition ${active ? "border-secondary bg-secondary/10" : "border-border hover:border-secondary/50"}`}>
      <span className="flex items-center gap-2 text-sm text-foreground">{icon}{title}</span>
      <span className="block text-[11px] text-foreground/50 mt-1 leading-snug">{hint}</span>
    </button>
  );
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong. Please try again."), { status: res.status });
  return data;
}

/** Survives the panel being re-mounted when the signed-in user changes (the cart reloads). */
let carriedNotice: string | null = null;

export function CheckoutPanel({ sessionId, items, disabled, onPlaced }: {
  sessionId: string;
  items: () => OrderItem[];
  disabled: boolean;
  onPlaced: (order: PlacedOrder) => Promise<void>;
}) {
  const { user, refresh } = useAuth();
  const [region, setRegion] = useState<"local" | "international" | null>(null);
  const [path, setPath] = useState<"web" | "whatsapp" | null>(null);
  const [payment, setPayment] = useState<"cod" | "bank_transfer">("cod");
  const [f, setF] = useState({ name: user?.fullName ?? "", identifier: "", password: "", phone: user?.phone ?? "", address: "", city: "", country: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => { const n = carriedNotice; carriedNotice = null; return n; });
  // Card (Stripe) and WhatsApp only work once their keys are in .env.
  const [options, setOptions] = useState<{ card: boolean; whatsapp: boolean }>({ card: true, whatsapp: true });
  useEffect(() => {
    fetch("/api/orders/checkout-options").then((r) => (r.ok ? r.json() : null)).then((o) => o && setOptions(o)).catch(() => undefined);
  }, []);
  const cardBlocked = region === "international" && path === "web" && !options.card;
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setError(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!region || !path) return;
    setBusy(true); setError(null);
    try {
      const base = {
        sessionId, items: items(), region, channel: path,
        contactName: f.name || user?.fullName, contactPhone: f.phone || undefined,
        shippingAddress: f.address || undefined, shippingCity: f.city || undefined,
        shippingCountry: region === "local" ? "Pakistan" : f.country || undefined,
      };
      if (path === "whatsapp") {
        const order: PlacedOrder = await postJson("/api/orders", { ...base, paymentMethod: region === "local" ? "cod" : "card" });
        await onPlaced(order);
        if (order.whatsappUrl) window.location.href = order.whatsappUrl;
        return;
      }
      if (!user) {
        const identifier = f.identifier.trim();
        await authFetch("register", { fullName: f.name, identifier, password: f.password, role: "buyer" })
          .catch(async (err: any) => {
            if (err.status === 409) return authFetch("login", { identifier, password: f.password });
            throw err;
          });
        await refresh();
      }
      const order: PlacedOrder = await postJson("/api/orders", {
        ...base,
        contactEmail: user?.email ?? (f.identifier.includes("@") ? f.identifier.trim() : undefined),
        paymentMethod: region === "international" ? "card" : payment,
      });
      if (region === "international") {
        const { url } = await postJson(`/api/orders/${order.id}/pay`, {});
        await onPlaced(order);
        window.location.href = url;
        return;
      }
      await onPlaced(order);
    } catch (err: any) {
      if (err.status === 401) {
        // The page still showed the old sign-in, but it had ended (signed out, or another account/admin signed in here).
        const msg = "Your sign-in has ended (for example, after signing in to the admin panel in this browser). Please sign in again to place your order.";
        carriedNotice = msg;
        setTimeout(() => { carriedNotice = null; }, 5000);
        setError(msg);
        await refresh();
      } else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!region) {
    return (
      <div className="mt-2 space-y-3">
        <p className={label}>Where are you buying from?</p>
        <div className="flex gap-2">
          <Choice active={false} onClick={() => setRegion("local")} icon={<MapPin size={15} />} title="Pakistan" hint="Cash on delivery · card after delivery" />
          <Choice active={false} onClick={() => setRegion("international")} icon={<Globe2 size={15} />} title="International" hint="Pay by card · shipped worldwide" />
        </div>
        {error && <p role="alert" className="text-xs text-rose-600 leading-relaxed">{error}</p>}
        {disabled && <p className="text-center text-[10px] uppercase tracking-widest text-foreground/30">Tick artworks above to continue</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-4">
      <div className="flex items-center justify-between text-xs">
        <span className="uppercase tracking-widest text-foreground/60">{region === "local" ? "Buying in Pakistan" : "Buying from abroad"}</span>
        <button type="button" className="text-foreground/50 hover:text-secondary underline" onClick={() => { setRegion(null); setPath(null); }}>Change</button>
      </div>

      <div className="flex gap-2">
        <Choice active={path === "web"} onClick={() => setPath("web")} icon={<LogIn size={15} />}
          title={user ? "Buy now" : "Sign in & buy"} hint={user ? `Signed in as ${user.fullName ?? user.email ?? user.phone}` : "Create an account or sign in"} />
        <Choice active={path === "whatsapp"} onClick={() => options.whatsapp && setPath("whatsapp")} icon={<MessageCircle size={15} />}
          title="Buy on WhatsApp" hint={options.whatsapp ? "Finish your order in a chat with our team" : "Not available yet"} />
      </div>

      {path && (
        <>
          {(path === "whatsapp" || !user) && (
            <div><label htmlFor="co-1" className={label}>Full name</label><input id="co-1" required autoComplete="name" className={field} value={f.name} onChange={set("name")} /></div>
          )}
          {path === "web" && !user && (
            <>
              <div><label htmlFor="co-2" className={label}>Email or phone</label><input id="co-2" required autoComplete="username" className={field} value={f.identifier} onChange={set("identifier")} placeholder="you@example.com or 03xx xxxxxxx" /></div>
              <div>
                <label htmlFor="co-3" className={label}>Password</label>
                <PasswordInput variant="raw" id="co-3" required autoComplete="new-password" minLength={6} className={field} value={f.password} onChange={set("password")} />
                <p className="text-[10px] text-foreground/40 mt-1">At least 6 characters. Already have an account? Use the same details to sign in.</p>
              </div>
            </>
          )}
          <div>
            <label htmlFor="co-4" className={label}>{path === "whatsapp" ? "WhatsApp number" : "Phone (for delivery)"}</label>
            <input id="co-4" required={path === "whatsapp" || region === "local"} type="tel" autoComplete="tel" className={field} value={f.phone} onChange={set("phone")} placeholder={region === "local" ? "03xx xxxxxxx" : "+44 7700 900000"} />
          </div>
          {path === "web" && (
            <div>
              <label htmlFor="co-5" className={label}>Delivery address</label>
              <textarea id="co-5" required rows={2} autoComplete="street-address" className={field} value={f.address} onChange={set("address")} />
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1"><label htmlFor="co-6" className={label}>City</label><input id="co-6" required={path === "web"} autoComplete="address-level2" className={field} value={f.city} onChange={set("city")} /></div>
            {region === "international" && (
              <div className="flex-1"><label htmlFor="co-7" className={label}>Country</label><input id="co-7" required autoComplete="country-name" className={field} value={f.country} onChange={set("country")} /></div>
            )}
          </div>

          {path === "web" && region === "local" && (
            <div className="space-y-2">
              <p className={label}>Payment</p>
              <div className="flex gap-2">
                <Choice active={payment === "cod"} onClick={() => setPayment("cod")} icon={null} title="Cash on delivery" hint="Pay when the artwork arrives" />
                <Choice active={payment === "bank_transfer"} onClick={() => setPayment("bank_transfer")} icon={null} title="Bank transfer" hint="We send details after confirming" />
              </div>
              <p className="text-[10px] text-foreground/40">Prefer card? After delivery you can pay by card from your Collector Portal.</p>
            </div>
          )}
          {path === "web" && region === "international" && (cardBlocked ? (
            <p role="alert" className="text-xs text-amber-800 dark:text-amber-300 border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3">
              Card payment isn't switched on yet, so international orders can't be paid online.
              {options.whatsapp ? " Please choose “Buy on WhatsApp” instead." : " Please contact us to order."}
            </p>
          ) : (
            <p className="text-xs text-foreground/60 border border-border p-3">You'll pay securely by card (Stripe) on the next screen. Import duties in your country may apply.</p>
          ))}
          {path === "whatsapp" && (
            <p className="text-xs text-foreground/60 border border-border p-3">We'll reserve the artwork and open WhatsApp with your order reference. Our team confirms delivery and payment ({region === "local" ? "cash on delivery" : "card link"}) in the chat. Unconfirmed WhatsApp orders are released after 48 hours.</p>
          )}

          {error && <p className="text-xs text-rose-600 leading-relaxed">{error}</p>}
          <button type="submit" disabled={busy || disabled || cardBlocked}
            className="w-full py-4 bg-secondary text-secondary-foreground font-display text-lg hover:bg-secondary/90 transition-colors uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-3">
            {busy ? <Loader2 size={18} className="animate-spin" /> : path === "whatsapp" ? "Continue on WhatsApp" : region === "international" ? "Continue to card payment" : "Place order"}
          </button>
        </>
      )}
    </form>
  );
}

/** Buttons shown on a buyer's order: confirm receipt, pay by card after delivery. */
export function OrderPayActions({ order, onChange }: {
  order: { id: number; status: string; region?: string; paymentStatus?: string };
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const canPay = order.paymentStatus !== "paid" && !["cancelled", "refunded"].includes(order.status)
    && (order.region === "international"
      ? ["pending_purchase", "confirmed", "in_preparation"].includes(order.status)
      : order.status === "delivered");
  const btn = "px-3 py-1.5 text-[11px] uppercase tracking-widest border border-border hover:border-secondary hover:text-secondary transition disabled:opacity-40";
  if (order.status !== "shipped" && !canPay) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {order.status === "shipped" && (
        <button className={btn} disabled={busy} onClick={() => run(async () => { await postJson(`/api/orders/${order.id}/confirm-delivery`, {}); onChange(); })}>I've received it</button>
      )}
      {canPay && (
        <button className={btn} disabled={busy} onClick={() => run(async () => { const { url } = await postJson(`/api/orders/${order.id}/pay`, {}); window.location.href = url; })}>Pay by card</button>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
