import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Eye, Check } from "lucide-react";
import FrameViewerModal from "@/components/FrameViewerModal";
import type { FrameSpec3D } from "@/components/FrameViewer3D";
import { formatMoney } from "@/lib/money";
import { FramedThumb, usePreviewPaintings } from "@/components/framed-thumb";

/**
 * Admin → Frames, kept simple: name, finish, width, mount, glass, price per metre, on/off.
 * Every frame is made to measure for the painting it goes with.
 */

type Opt = { value: string; label: string; colourHex?: string; mm?: number };
type Frame = {
  id: number; name: string; finish: string; width: string; mount: string; glass: boolean;
  price: number | null; active: boolean; imageUrl?: string;
  look: { finish: string; colourHex: string; metalness: number; roughness: number; profileShape: string; textureUrl: string | null; faceWidthMm: number };
};
type Options = { finishes: Opt[]; widths: Opt[]; mounts: Opt[] };
type Draft = Omit<Frame, "id" | "look" | "imageUrl"> & { id?: number };

async function call<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const SWATCH: Record<string, string> = {
  gold: "linear-gradient(135deg,#f4d98a,#b8893a 45%,#7a5518 70%,#e8c46e)",
  silver: "linear-gradient(135deg,#f6f7f9,#b9bdc4 45%,#7d828a 70%,#e6e8eb)",
  walnut: "repeating-linear-gradient(100deg,#6b4429 0 3px,#4a2c18 3px 5px,#5e3b22 5px 9px)",
  natural: "repeating-linear-gradient(100deg,#d2a874 0 3px,#a87d4b 3px 5px,#c79c66 5px 9px)",
  black: "#171615", white: "#F0EEE8",
};
const small = "text-[10px] uppercase tracking-widest text-foreground/50";
const btn = "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-3 py-2 border border-border hover:border-primary hover:text-primary disabled:opacity-40";
const btnPrimary = "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40";

function Choice({ options, value, onChange, render }: { options: Opt[]; value: string; onChange: (v: string) => void; render?: (o: Opt) => React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`flex items-center gap-2 px-3 py-1.5 border text-xs transition-colors ${value === o.value ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground/70 hover:border-foreground/40"}`}>
          {render?.(o)}{o.label}
        </button>
      ))}
    </div>
  );
}

/** A preview spec for any artwork: the same maths as the server, enough for the 3D preview. */
const faceOf = (width: string) => (width === "thin" ? 20 : width === "wide" ? 70 : 40);
/** An older frame keeps its own moulding width until a new width is picked. */
const faceFor = (d: Draft, frame: { width: string; look?: Frame["look"] }) =>
  d.finish === "custom" && frame.look && d.width === frame.width ? frame.look.faceWidthMm : faceOf(d.width);

function previewSpec(f: Draft, look: Frame["look"] | null, art: { widthMm: number; heightMm: number }, faceMm?: number): FrameSpec3D {
  const face = faceMm ?? faceOf(f.width);
  const depth = f.width === "thin" ? 25 : f.width === "wide" ? 40 : 32;
  const mat = f.mount === "none" ? 0 : 50, lip = 5;
  const opening = { widthMm: art.widthMm + 2 * mat - 2 * lip, heightMm: art.heightMm + 2 * mat - 2 * lip };
  return {
    artwork: { ...art, depthMm: 20 }, matWidthMm: mat, matColourHex: f.mount === "cream" ? "#ECE2CB" : "#F6F4EE", lipMm: lip,
    faceWidthMm: face, frameDepthMm: depth, glazing: f.glass ? "glass" : "none", opening,
    outer: { widthMm: opening.widthMm + 2 * face, heightMm: opening.heightMm + 2 * face, depthMm: depth },
    look: f.finish === "custom" && look ? { ...look, finish: "custom" } : { finish: f.finish, colourHex: "#000000", metalness: 0, roughness: 0.5, profileShape: f.finish === "gold" ? "ornate" : f.finish === "walnut" ? "rounded" : f.finish === "silver" ? "bevel" : "flat", textureUrl: null },
  };
}

function FrameCard({ frame, options, painting, onSaved, onDeleted, onPreview }: {
  frame: Draft & { look?: Frame["look"] }; options: Options; painting?: string;
  onSaved: (f: Frame) => void; onDeleted?: () => void; onPreview: (d: Draft, look: Frame["look"] | null, faceMm: number) => void;
}) {
  const [d, setD] = useState<Draft>(frame);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setD(frame), [frame]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((x) => ({ ...x, [k]: v })); setMsg(null); };
  const finishes = frame.finish === "custom" ? [...options.finishes, { value: "custom", label: "Current look" }] : options.finishes;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const body = { name: d.name, finish: d.finish, width: d.width, mount: d.mount, glass: d.glass, price: d.price, active: d.active };
      const saved = d.id ? await call<Frame>(`/api/admin/frames/${d.id}`, "PATCH", body) : await call<Frame>("/api/admin/frames", "POST", body);
      onSaved(saved); setMsg({ ok: true, text: "Saved" });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!d.id || !confirm(`Delete the frame "${d.name}"?`)) return;
    setBusy(true);
    try { const r = await call<{ message?: string }>(`/api/admin/frames/${d.id}`, "DELETE"); if (r.message) alert(r.message); onDeleted?.(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  return (
    <div className={`border bg-card p-5 flex flex-col md:flex-row gap-5 ${d.active ? "border-border" : "border-dashed border-border opacity-70"}`}>
      {/* The frame around one of our paintings, updating as the choices change. */}
      <FramedThumb className="w-full md:w-56 aspect-square flex-shrink-0"
        look={{ finish: d.finish, colourHex: frame.look?.colourHex ?? "#8B6914", textureUrl: frame.look?.textureUrl ?? null, faceWidthMm: faceFor(d, frame) }}
        mount={d.mount} glass={d.glass} imageUrl={painting} />
      <div className="flex-1 space-y-4 min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Frame name, e.g. Classic Gold"
          className="flex-1 min-w-[200px] bg-background border border-border px-3 py-2 font-display text-lg text-primary focus:outline-none focus:border-primary/60" />
        <label className="flex items-center gap-2 text-xs text-foreground/70">
          <input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} /> Offered to customers
        </label>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5"><p className={small}>Finish</p>
          <Choice options={finishes} value={d.finish} onChange={(v) => set("finish", v)}
            render={(o) => <span className="w-4 h-4 border border-black/20" style={{ background: SWATCH[o.value] ?? frame.look?.colourHex }} />} />
        </div>
        <div className="space-y-1.5"><p className={small}>Width</p>
          <Choice options={options.widths.map((w) => ({ ...w, label: `${w.label} · ${(w.mm ?? 0) / 10} cm` }))} value={d.width} onChange={(v) => set("width", v)} />
        </div>
        <div className="space-y-1.5"><p className={small}>Mount around the painting</p>
          <Choice options={options.mounts} value={d.mount} onChange={(v) => set("mount", v)} />
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="space-y-1.5"><p className={small}>Glass</p>
            <Choice options={[{ value: "yes", label: "With glass" }, { value: "no", label: "No glass" }]} value={d.glass ? "yes" : "no"} onChange={(v) => set("glass", v === "yes")} />
          </div>
          <label className="space-y-1.5 block"><span className={small}>Price (PKR)</span>
            <input type="number" min={0} step={500} value={d.price ?? ""} onChange={(e) => set("price", e.target.value === "" ? null : Number(e.target.value))}
              className="block w-36 bg-background border border-border px-3 py-1.5 text-sm focus:outline-none focus:border-primary/60" />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className={btnPrimary} disabled={busy} onClick={save}>{busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}{d.id ? "Save" : "Add frame"}</button>
        <button type="button" className={btn} onClick={() => onPreview(d, frame.look ?? null, faceFor(d, frame))}><Eye size={11} /> Preview in 3D</button>
        {d.id && <button type="button" className={btn} onClick={remove} disabled={busy}><Trash2 size={11} /> Delete</button>}
        {d.price != null && <span className="text-[11px] text-foreground/50">Customers pay {formatMoney(d.price)} for this frame, for any painting size.</span>}
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
      </div>
    </div>
  );
}

const NEW: Draft = { name: "", finish: "black", width: "standard", mount: "none", glass: false, price: null, active: true };

export function AdminFrames() {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ d: Draft; look: Frame["look"] | null; faceMm: number } | null>(null);
  const paintings = usePreviewPaintings();
  const paintingFor = (i: number) => (paintings.length ? paintings[i % paintings.length]!.imageUrl : undefined);
  const [art, setArt] = useState<{ id: number; title: string; artistName: string; imageUrl: string }[]>([]);
  const [artId, setArtId] = useState<number | null>(null);
  const [artSize, setArtSize] = useState<{ widthCm: number | null; heightCm: number | null } | null>(null);

  const load = useCallback(async () => {
    try { const r = await call<{ frames: Frame[]; options: Options }>("/api/admin/frames"); setFrames(r.frames); setOptions(r.options); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/artworks?limit=60").then((r) => r.json()).then((d) => {
      const list = (Array.isArray(d) ? d : d.artworks ?? d.items ?? []).filter((a: any) => a.imageUrl && !/sculpt|install/i.test(a.artCategory ?? ""));
      setArt(list); if (list[0]) setArtId(list[0].id);
    }).catch(() => undefined);
  }, []);
  // The list has no sizes: read the chosen artwork's real size.
  useEffect(() => {
    if (artId == null) return;
    setArtSize(null);
    fetch(`/api/artworks/${artId}`).then((r) => r.json()).then((d) => setArtSize({ widthCm: d.widthCm ?? null, heightCm: d.heightCm ?? null })).catch(() => undefined);
  }, [artId]);

  if (error) return <p className="text-rose-600 text-sm">{error}</p>;
  if (!frames || !options) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  const a = art.find((x) => x.id === artId) ?? null;
  const artMm = artSize?.widthCm && artSize.heightCm ? { widthMm: artSize.widthCm * 10, heightMm: artSize.heightCm * 10, depthMm: 20 } : { widthMm: 600, heightMm: 800, depthMm: 20 };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-primary">Frames</h2>
          <p className="text-sm text-foreground/60 mt-1 max-w-2xl">Each frame is made to measure for the painting, at one fixed price. Customers see the frames switched on here — older frames are listed too, with their own look.</p>
        </div>
        <label className="space-y-1 block"><span className={small}>Preview on</span>
          <select value={artId ?? ""} onChange={(e) => setArtId(Number(e.target.value))} className="block w-64 bg-background border border-border px-2 py-1.5 text-sm">
            {art.map((x) => <option key={x.id} value={x.id}>{x.title} — {x.artistName}</option>)}
          </select>
        </label>
      </div>

      {frames.length === 0 && !adding && <p className="text-sm text-foreground/60 italic">No frames yet.</p>}
      {frames.map((f, i) => (
        <FrameCard key={f.id} frame={f} options={options} painting={paintingFor(i)} onPreview={(d, look, faceMm) => setPreview({ d, look, faceMm })}
          onSaved={(s) => setFrames((list) => list!.map((x) => (x.id === s.id ? s : x)))}
          onDeleted={() => setFrames((list) => list!.filter((x) => x.id !== f.id))} />
      ))}
      {adding ? (
        <FrameCard frame={NEW} options={options} painting={paintingFor(frames.length)} onPreview={(d, _look, faceMm) => setPreview({ d, look: null, faceMm })}
          onSaved={(s) => { setFrames((list) => [...list!, s]); setAdding(false); }} />
      ) : (
        <button type="button" className={btn} onClick={() => setAdding(true)}><Plus size={12} /> Add a frame</button>
      )}

      <FrameViewerModal
        open={preview !== null} onClose={() => setPreview(null)}
        imageUrl={a?.imageUrl ?? ""} title={a?.title ?? "Preview"} artistName={a?.artistName ?? ""}
        artMm={artMm} spec={preview ? previewSpec(preview.d, preview.look, artMm, preview.faceMm) : null} frameName={preview?.d.name || "Frame"}
      />
    </div>
  );
}
