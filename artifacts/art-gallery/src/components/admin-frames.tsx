import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, Plus, Trash2, Eye } from "lucide-react";
import FrameViewerModal from "@/components/FrameViewerModal";
import type { FrameSpec3D } from "@/components/FrameViewer3D";

/**
 * Admin → Frames: mouldings (profiles), frame products, compatibility rules,
 * supports (canvas types), surface finishes, and a fit/size preview per artwork.
 * All measurements in millimetres.
 */

type Profile = {
  id: number; name: string; style: string; material: string; profileShape: string;
  faceWidthMm: number; depthMm: number; rebateWidthMm: number; rebateDepthMm: number;
  revealGapMm: number; revealColourHex: string; maxLongEdgeMm: number | null; maxWeightG: number | null;
  colourHex: string; metalness: number; roughness: number; textureUrl: string | null; active: boolean; displayOrder: number;
};
type FrameItem = {
  id: number; name: string; type: string; price: number; status: string; imageUrl: string;
  frameProfileId: number | null; innerWidthMm: number | null; innerHeightMm: number | null; glazing: string;
  matWidthMm: number; matColourHex: string; backing: string; revealGapMm: number | null; pricePerMetre: number | null;
};
type Rule = { id: number; frameProfileId: number; artCategoryId: number | null; baseTypeId: number | null; allow: boolean };
type Base = { id: number; name: string; rigidity: string; needsStretcher: boolean; needsGlazing: boolean; needsBacking: boolean; typicalThicknessMm: number | null };
type Finish = { id: number; name: string; glazingOk: boolean; gloss: number };
type Category = { id: number; name: string };
type Evaluation = { compatible: boolean; measured: boolean; reasons: string[]; spec: FrameSpec3D & { shopItemId: number; name: string; price: number; madeToMeasure: boolean } };

const field = "w-full bg-background border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/60";
const small = "text-[10px] uppercase tracking-widest text-foreground/50";
const btn = "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border hover:border-primary hover:text-primary disabled:opacity-40";
const btnPrimary = "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40";

async function call<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, credentials: "include", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}
const nOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-display text-xl text-primary">{title}</h3>
        {hint && <p className="text-xs text-foreground/60 mt-1">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
function Num({ label, value, onChange, placeholder }: { label: string; value: number | null | undefined; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1"><span className={small}>{label}</span>
      <input type="number" min={0} className={field} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Pick({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1"><span className={small}>{label}</span>
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </label>
  );
}
function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1"><span className={small}>{label}</span>
      <span className="flex gap-1"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-[34px] w-10 border border-border bg-background" />
        <input className={field} value={value} onChange={(e) => onChange(e.target.value)} /></span>
    </label>
  );
}

const STYLES: [string, string][] = [["standard", "Standard"], ["thin", "Thin"], ["wide", "Wide"], ["enclosing", "Enclosing"], ["floater", "Floater (shadow gap)"]];
const MATERIALS: [string, string][] = [["wood", "Wood"], ["metal", "Metal"], ["leather", "Leather"], ["polystyrene", "Polystyrene"], ["other", "Other"]];
const SHAPES: [string, string][] = [["flat", "Flat"], ["bevel", "Bevel"], ["rounded", "Rounded"], ["ornate", "Ornate"]];
const GLAZING: [string, string][] = [["none", "None"], ["glass", "Glass"], ["acrylic", "Acrylic"], ["anti_reflective", "Anti-reflective glass"]];
const BACKING: [string, string][] = [["none", "None"], ["hardboard", "Hardboard"], ["foam_board", "Foam board"]];
const RIGIDITY: [string, string][] = [["rigid", "Rigid (board, panel, hard back)"], ["flexible", "Flexible (stretched canvas, fabric)"], ["loose_sheet", "Loose sheet (paper, rolled canvas, wasli)"]];

const EMPTY_PROFILE = { name: "", style: "standard", material: "wood", profileShape: "flat", faceWidthMm: 30, depthMm: 30, rebateWidthMm: 5, rebateDepthMm: 20, revealGapMm: 0, revealColourHex: "#111111", maxLongEdgeMm: null as number | null, maxWeightG: null as number | null, colourHex: "#8B6914", metalness: 0.3, roughness: 0.5, active: true };

function ProfileForm({ value, onSave, onDelete, saveLabel }: { value: Partial<Profile>; onSave: (p: Partial<Profile>) => Promise<void>; onDelete?: () => void; saveLabel: string }) {
  const [p, setP] = useState<Partial<Profile>>(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setP(value), [value]);
  const set = (k: keyof Profile, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  return (
    <form className="grid grid-cols-2 md:grid-cols-6 gap-3 border border-border/60 p-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(p); } finally { setBusy(false); } }}>
      <label className="block space-y-1 col-span-2"><span className={small}>Name</span><input required className={field} value={p.name ?? ""} onChange={(e) => set("name", e.target.value)} /></label>
      <Pick label="Style" value={p.style ?? "standard"} options={STYLES} onChange={(v) => set("style", v)} />
      <Pick label="Material" value={p.material ?? "wood"} options={MATERIALS} onChange={(v) => set("material", v)} />
      <Pick label="Face shape (3D)" value={p.profileShape ?? "flat"} options={SHAPES} onChange={(v) => set("profileShape", v)} />
      <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={p.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Active</label>
      <Num label="Face width mm" value={p.faceWidthMm} onChange={(v) => set("faceWidthMm", Number(v))} />
      <Num label="Frame depth mm" value={p.depthMm} onChange={(v) => set("depthMm", Number(v))} />
      <Num label="Lip overlap mm" value={p.rebateWidthMm} onChange={(v) => set("rebateWidthMm", Number(v))} />
      <Num label="Rebate depth mm" value={p.rebateDepthMm} onChange={(v) => set("rebateDepthMm", Number(v))} />
      <Num label="Shadow gap mm" value={p.revealGapMm} onChange={(v) => set("revealGapMm", Number(v))} />
      <Colour label="Gap colour" value={p.revealColourHex ?? "#111111"} onChange={(v) => set("revealColourHex", v)} />
      <Num label="Max long edge mm" value={p.maxLongEdgeMm} placeholder="no limit" onChange={(v) => set("maxLongEdgeMm", nOrNull(v))} />
      <Num label="Max weight g" value={p.maxWeightG} placeholder="no limit" onChange={(v) => set("maxWeightG", nOrNull(v))} />
      <Colour label="Colour" value={p.colourHex ?? "#8B6914"} onChange={(v) => set("colourHex", v)} />
      <label className="block space-y-1"><span className={small}>Metalness {Number(p.metalness ?? 0).toFixed(2)}</span><input type="range" min={0} max={1} step={0.05} value={p.metalness ?? 0} onChange={(e) => set("metalness", Number(e.target.value))} className="w-full" /></label>
      <label className="block space-y-1"><span className={small}>Roughness {Number(p.roughness ?? 0).toFixed(2)}</span><input type="range" min={0} max={1} step={0.05} value={p.roughness ?? 0} onChange={(e) => set("roughness", Number(e.target.value))} className="w-full" /></label>
      <div className="flex items-end gap-2">
        <button type="submit" className={btnPrimary} disabled={busy}>{busy ? <Loader2 size={11} className="animate-spin" /> : null}{saveLabel}</button>
        {onDelete && <button type="button" className={btn} onClick={onDelete}><Trash2 size={11} /></button>}
      </div>
    </form>
  );
}

function FrameItemRow({ item, profiles, onSaved, setMsg }: { item: FrameItem; profiles: Profile[]; onSaved: () => void; setMsg: (m: { ok: boolean; text: string }) => void }) {
  const [f, setF] = useState(item);
  useEffect(() => setF(item), [item]);
  const set = (k: keyof FrameItem, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      await call(`/api/admin/shop/items/${item.id}/frame`, "PATCH", {
        frameProfileId: f.frameProfileId, innerWidthMm: f.innerWidthMm, innerHeightMm: f.innerHeightMm, glazing: f.glazing,
        matWidthMm: f.matWidthMm, matColourHex: f.matColourHex, backing: f.backing, revealGapMm: f.revealGapMm, pricePerMetre: f.pricePerMetre,
      });
      setMsg({ ok: true, text: `Saved “${item.name}”.` }); onSaved();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 border border-border/60 p-3" data-frame-item={item.id}>
      <div className="col-span-2">
        <p className="text-sm font-medium">{item.name}</p>
        <p className="text-xs text-foreground/50">PKR {Number(item.price).toLocaleString()} {item.status !== "active" ? `· ${item.status}` : ""}</p>
        {!f.frameProfileId && <p className="text-xs text-amber-700 dark:text-amber-400">No moulding set — size can't be checked or shown in 3D.</p>}
      </div>
      <Pick label="Moulding" value={String(f.frameProfileId ?? "")} options={[["", "— none —"], ...profiles.map((p) => [String(p.id), p.name] as [string, string])]} onChange={(v) => set("frameProfileId", v ? Number(v) : null)} />
      <Num label="Opening width mm" value={f.innerWidthMm} placeholder="made to measure" onChange={(v) => set("innerWidthMm", nOrNull(v))} />
      <Num label="Opening height mm" value={f.innerHeightMm} placeholder="made to measure" onChange={(v) => set("innerHeightMm", nOrNull(v))} />
      <Pick label="Glazing" value={f.glazing} options={GLAZING} onChange={(v) => set("glazing", v)} />
      <Num label="Mat width mm" value={f.matWidthMm} onChange={(v) => set("matWidthMm", Number(v) || 0)} />
      <Colour label="Mat colour" value={f.matColourHex} onChange={(v) => set("matColourHex", v)} />
      <Pick label="Backing" value={f.backing} options={BACKING} onChange={(v) => set("backing", v)} />
      <Num label="Shadow gap mm" value={f.revealGapMm} placeholder="from moulding" onChange={(v) => set("revealGapMm", nOrNull(v))} />
      <Num label="PKR per metre" value={f.pricePerMetre} placeholder="fixed price" onChange={(v) => set("pricePerMetre", nOrNull(v))} />
      <div className="flex items-end"><button className={btnPrimary} onClick={() => void save()}>Save frame</button></div>
    </div>
  );
}

export function AdminFrames() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<FrameItem[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [finishes, setFinishes] = useState<Finish[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [arts, setArts] = useState<{ id: number; title: string; artistName: string; imageUrl: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [rule, setRule] = useState({ frameProfileId: "", artCategoryId: "", baseTypeId: "", allow: "false" });
  const [newBase, setNewBase] = useState({ name: "", rigidity: "rigid" });
  const [newFinish, setNewFinish] = useState({ name: "", glazingOk: true, gloss: 0.3 });
  const [previewArt, setPreviewArt] = useState("");
  const [evals, setEvals] = useState<Evaluation[] | null>(null);
  const [view, setView] = useState<{ spec: Evaluation["spec"] | null; art: (typeof arts)[number] } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, it, r, b, f, c, a] = await Promise.all([
        call<Profile[]>("/api/admin/frame-profiles"), call<FrameItem[]>("/api/admin/shop/items"), call<Rule[]>("/api/admin/frame-compatibility"),
        call<Base[]>("/api/lookup/base-types"), call<Finish[]>("/api/lookup/surface-finishes"), call<Category[]>("/api/lookup/art-categories"),
        call<any[]>("/api/admin/artworks/approved").catch(() => []),
      ]);
      setProfiles(p); setItems(it.filter((x) => /^frames?$/i.test(x.type.trim()))); setRules(r); setBases(b); setFinishes(f); setCats(c); setArts(a);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const nameOf = (list: { id: number; name: string }[], id: number | null) => (id == null ? "Any" : list.find((x) => x.id === id)?.name ?? `#${id}`);
  const preview = async (artId: string) => {
    setPreviewArt(artId); setEvals(null);
    if (artId) try { setEvals((await call<{ frames: Evaluation[] }>(`/api/artworks/${artId}/compatible-frames`)).frames); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary/40 w-8 h-8" /></div>;

  return (
    <div className="space-y-8" data-admin-frames>
      <div>
        <p className="text-xs uppercase tracking-widest text-secondary mb-1">Gallery Management</p>
        <h2 className="font-display text-2xl text-primary">Frames</h2>
        <p className="text-sm text-foreground/60 mt-1">
          Final size = artwork + 2 × mat + 2 × shadow gap − 2 × lip, plus 2 × face width. All sizes in millimetres.
        </p>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</p>}

      <Section title="Check an artwork" hint="Pick an artwork to see which frames fit, why others don't, the final size and price — and view it in 3D.">
        <select className={field} value={previewArt} onChange={(e) => void preview(e.target.value)} aria-label="Artwork to check">
          <option value="">— Choose an artwork —</option>
          {arts.map((a) => <option key={a.id} value={a.id}>{a.title} — {a.artistName}</option>)}
        </select>
        {evals && (
          <div className="border border-border divide-y divide-border text-sm" data-preview>
            {!evals.length && <p className="p-3 text-foreground/50">No frames in the shop yet.</p>}
            {evals.map((e) => (
              <div key={e.spec.shopItemId} className="p-3 flex flex-wrap items-center gap-3">
                <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${e.compatible ? "text-emerald-700 border-emerald-300 dark:text-emerald-400" : "text-destructive border-destructive/40"}`}>{e.compatible ? "Fits" : "Doesn't fit"}</span>
                <span className="font-medium">{e.spec.name}</span>
                <span className="text-foreground/60">{e.spec.outer ? `Final ${e.spec.outer.widthMm} × ${e.spec.outer.heightMm} × ${e.spec.outer.depthMm} mm` : e.measured ? "" : "no moulding set"}</span>
                <span className="text-foreground/60">PKR {Number(e.spec.price).toLocaleString()}{e.spec.madeToMeasure ? " (made to measure)" : ""}</span>
                {e.reasons.length > 0 && <span className="w-full text-xs text-destructive">{e.reasons.join(" ")}</span>}
                {e.spec.artwork && (
                  <button className={btn} onClick={() => { const a = arts.find((x) => String(x.id) === previewArt); if (a) setView({ spec: e.spec, art: a }); }}><Eye size={11} /> 3D</button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Mouldings (frame profiles)" hint="The physical frame: how wide and deep it is, how far its lip overlaps the artwork, the space inside, any shadow gap, and how it looks in 3D.">
        <div className="space-y-3">
          {profiles.map((p) => (
            <ProfileForm key={p.id} value={p} saveLabel="Save"
              onSave={(v) => run(() => call(`/api/admin/frame-profiles/${p.id}`, "PATCH", v), `Saved “${v.name}”.`)}
              onDelete={() => void run(() => call(`/api/admin/frame-profiles/${p.id}`, "DELETE"), `Deleted “${p.name}”.`)} />
          ))}
          <p className={small}>Add a moulding</p>
          <ProfileForm value={EMPTY_PROFILE} saveLabel="Add moulding" onSave={(v) => run(() => call("/api/admin/frame-profiles", "POST", v), `Added “${v.name}”.`)} />
        </div>
      </Section>

      <Section title="Frames for sale" hint="Frames from Shop Items (type “Frames”). Link each to a moulding. Leave the opening empty for made-to-measure; add a price per metre to charge by moulding length.">
        {!items.length && <p className="text-sm text-foreground/50">No frames yet — add a Shop Item with type “Frames”.</p>}
        <div className="space-y-3">{items.map((it) => <FrameItemRow key={it.id} item={it} profiles={profiles} onSaved={() => void load()} setMsg={setMsg} />)}</div>
      </Section>

      <Section title="Compatibility rules" hint="Deny rows block a moulding for that art category / support. If a moulding has Allow rows, only matching artworks can use it. Empty = any.">
        <div className="border border-border divide-y divide-border text-sm">
          {!rules.length && <p className="p-3 text-foreground/50">No rules — every moulding can be used with every artwork (size permitting).</p>}
          {rules.map((r) => (
            <div key={r.id} className="p-2 flex items-center gap-3">
              <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${r.allow ? "text-emerald-700 border-emerald-300" : "text-destructive border-destructive/40"}`}>{r.allow ? "Allow" : "Deny"}</span>
              <span className="flex-1">{nameOf(profiles, r.frameProfileId)} · category: {nameOf(cats, r.artCategoryId)} · support: {nameOf(bases, r.baseTypeId)}</span>
              <button className={btn} onClick={() => void run(() => call(`/api/admin/frame-compatibility/${r.id}`, "DELETE"), "Rule removed.")}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
        <form className="grid grid-cols-2 md:grid-cols-5 gap-3" onSubmit={(e) => { e.preventDefault(); void run(() => call("/api/admin/frame-compatibility", "POST", { frameProfileId: Number(rule.frameProfileId), artCategoryId: rule.artCategoryId ? Number(rule.artCategoryId) : null, baseTypeId: rule.baseTypeId ? Number(rule.baseTypeId) : null, allow: rule.allow === "true" }), "Rule added."); }}>
          <Pick label="Moulding" value={rule.frameProfileId} options={[["", "— choose —"], ...profiles.map((p) => [String(p.id), p.name] as [string, string])]} onChange={(v) => setRule({ ...rule, frameProfileId: v })} />
          <Pick label="Art category" value={rule.artCategoryId} options={[["", "Any"], ...cats.map((c) => [String(c.id), c.name] as [string, string])]} onChange={(v) => setRule({ ...rule, artCategoryId: v })} />
          <Pick label="Support" value={rule.baseTypeId} options={[["", "Any"], ...bases.map((b) => [String(b.id), b.name] as [string, string])]} onChange={(v) => setRule({ ...rule, baseTypeId: v })} />
          <Pick label="Rule" value={rule.allow} options={[["false", "Deny"], ["true", "Allow"]]} onChange={(v) => setRule({ ...rule, allow: v })} />
          <div className="flex items-end"><button className={btnPrimary} disabled={!rule.frameProfileId}><Plus size={11} /> Add rule</button></div>
        </form>
      </Section>

      <Section title="Supports (canvas types)" hint="What the artwork is made on. These decide what a frame must include.">
        <div className="border border-border divide-y divide-border text-sm">
          {bases.map((b) => (
            <div key={b.id} className="p-2 grid grid-cols-2 md:grid-cols-7 gap-2 items-center" data-base={b.id}>
              <span className="font-medium md:col-span-1 col-span-2">{b.name}</span>
              <select className={`${field} md:col-span-2`} value={b.rigidity} onChange={(e) => void run(() => call(`/api/admin/base-types/${b.id}`, "PATCH", { rigidity: e.target.value }), `Updated ${b.name}.`)}>
                {RIGIDITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {(["needsStretcher", "needsGlazing", "needsBacking"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={b[k]} onChange={(e) => void run(() => call(`/api/admin/base-types/${b.id}`, "PATCH", { [k]: e.target.checked }), `Updated ${b.name}.`)} />
                  {k === "needsStretcher" ? "Needs stretching/mount" : k === "needsGlazing" ? "Needs glass" : "Needs backing"}
                </label>
              ))}
              <input type="number" min={0} className={field} defaultValue={b.typicalThicknessMm ?? ""} placeholder="thickness mm" aria-label={`${b.name} thickness mm`}
                onBlur={(e) => { const v = nOrNull(e.target.value); if (v !== b.typicalThicknessMm) void run(() => call(`/api/admin/base-types/${b.id}`, "PATCH", { typicalThicknessMm: v }), `Updated ${b.name}.`); }} />
            </div>
          ))}
        </div>
        <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void run(() => call("/api/admin/base-types", "POST", newBase), `Added ${newBase.name}.`).then(() => setNewBase({ name: "", rigidity: "rigid" })); }}>
          <label className="space-y-1"><span className={small}>New support</span><input required className={field} value={newBase.name} onChange={(e) => setNewBase({ ...newBase, name: e.target.value })} /></label>
          <Pick label="Type" value={newBase.rigidity} options={RIGIDITY} onChange={(v) => setNewBase({ ...newBase, rigidity: v })} />
          <button className={btnPrimary}><Plus size={11} /> Add</button>
        </form>
      </Section>

      <Section title="Surface finishes" hint="Coating on the artwork. Finishes that can't go behind glass block glazed frames; gloss changes the 3D shine.">
        <div className="border border-border divide-y divide-border text-sm">
          {finishes.map((f) => (
            <div key={f.id} className="p-2 flex flex-wrap items-center gap-4">
              <span className="flex-1 font-medium">{f.name}</span>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.glazingOk} onChange={(e) => void run(() => call(`/api/admin/surface-finishes/${f.id}`, "PATCH", { glazingOk: e.target.checked }), `Updated ${f.name}.`)} /> OK behind glass</label>
              <span className="text-xs text-foreground/60">gloss {f.gloss.toFixed(2)}</span>
              <button className={btn} onClick={() => void run(() => call(`/api/admin/surface-finishes/${f.id}`, "DELETE"), `Deleted ${f.name}.`)}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
        <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void run(() => call("/api/admin/surface-finishes", "POST", newFinish), `Added ${newFinish.name}.`).then(() => setNewFinish({ name: "", glazingOk: true, gloss: 0.3 })); }}>
          <label className="space-y-1"><span className={small}>New finish</span><input required className={field} value={newFinish.name} onChange={(e) => setNewFinish({ ...newFinish, name: e.target.value })} /></label>
          <label className="flex items-center gap-1 text-xs pb-2"><input type="checkbox" checked={newFinish.glazingOk} onChange={(e) => setNewFinish({ ...newFinish, glazingOk: e.target.checked })} /> OK behind glass</label>
          <label className="space-y-1"><span className={small}>Gloss {newFinish.gloss.toFixed(2)}</span><input type="range" min={0} max={1} step={0.05} value={newFinish.gloss} onChange={(e) => setNewFinish({ ...newFinish, gloss: Number(e.target.value) })} /></label>
          <button className={btnPrimary}><Plus size={11} /> Add</button>
        </form>
      </Section>

      <FrameViewerModal open={view !== null} onClose={() => setView(null)} imageUrl={view?.art.imageUrl ?? ""} title={view?.art.title ?? ""} artistName={view?.art.artistName ?? ""}
        artMm={view?.spec?.artwork ?? null} spec={view?.spec?.outer ? view.spec : null} frameName={view?.spec ? (view.spec as any).name : null} />
    </div>
  );
}
