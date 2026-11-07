import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, X, ChevronLeft, ChevronRight, Plus, RotateCcw, Save, ExternalLink, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin → Carousels: choose a carousel, see how much of the screen it covers and
 * what it shows, then fill it by hand or with an algorithm (latest, a gallery's
 * work, or popularity) and arrange the images by dragging.
 */

type Mode = "manual" | "latest" | "gallery" | "popularity";
type Item = {
  id: number; title: string; subtitle: string; imageUrl: string;
  width: number | null; height: number | null; aspect: number | null; coverage: number; tier: 1 | 2 | 3;
};
type Def = {
  key: string; name: string; page: string; kind: "artwork" | "artist";
  frame: { width: number; height: number }; sizing: string; screen: { width: number; height: number };
  pageCoverage: number; defaults: { mode: Mode; poolSize: number; showCount: number };
  saved?: { mode: Mode; showCount: number; count: number; updatedAt: string } | null;
};
type Settings = { mode: Mode; galleryId: number | null; poolSize: number; showCount: number };
type Detail = { def: Def; settings: Settings; configured: boolean; items: Item[]; pool: Item[] };
type Gallery = { id: number; name: string; status: string };
type DragData = { src: "items" | "pool" | "search"; id: number };

const MODE_LABEL: Record<Mode, string> = {
  manual: "Manual",
  latest: "Latest",
  gallery: "Gallery selection",
  popularity: "Popularity",
};
const field = "w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60";
const small = "text-[10px] uppercase tracking-widest text-foreground/50";
const DND = "application/x-maf-carousel";

function shapeLabel(it: Item) {
  if (!it.aspect) return { text: "size unknown", tone: "text-foreground/40" };
  const pct = Math.round(it.coverage * 100);
  if (it.tier === 1) return { text: `4:3 · ${pct}% width`, tone: "text-emerald-600" };
  if (it.tier === 2) return { text: `${pct}% width`, tone: "text-emerald-600" };
  return { text: `${pct}% width`, tone: "text-amber-600" };
}

export function AdminCarousels() {
  const { toast } = useToast();
  const [defs, setDefs] = useState<Def[] | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [galleries, setGalleries] = useState<Gallery[]>([]);

  // Draft (unsaved) state
  const [settings, setSettings] = useState<Settings>({ mode: "latest", galleryId: null, poolSize: 15, showCount: 10 });
  const [items, setItems] = useState<Item[]>([]);
  const [pool, setPool] = useState<Item[]>([]);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Item[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const loadDefs = useCallback(async () => {
    const res = await fetch("/api/admin/carousels", { credentials: "include" });
    if (res.ok) setDefs(await res.json());
  }, []);

  useEffect(() => {
    void loadDefs();
    fetch("/api/admin/carousels-galleries", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setGalleries)
      .catch(() => undefined);
  }, [loadDefs]);

  const open = useCallback(async (k: string) => {
    setKey(k);
    setLoading(true);
    setResults(null);
    setQ("");
    try {
      const res = await fetch(`/api/admin/carousels/${k}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load the carousel.");
      const d: Detail = await res.json();
      setDetail(d);
      setSettings(d.settings);
      setItems(d.items);
      setPool(d.pool);
      setDirty(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const change = (s: Partial<Settings>) => { setSettings((o) => ({ ...o, ...s })); setDirty(true); };

  // ── Algorithm ───────────────────────────────────────────────────────────────
  const generate = async () => {
    if (!key) return;
    if (settings.mode === "gallery" && !settings.galleryId) {
      toast({ title: "Choose a gallery first", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/carousels/${key}/generate`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: settings.mode, galleryId: settings.galleryId, poolSize: settings.poolSize }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not choose images.");
      const picked: Item[] = body.pool;
      setPool(picked);
      setItems(picked.slice(0, settings.showCount));
      setDirty(true);
      if (picked.length === 0) toast({ title: "No images found", description: "Nothing matches this choice yet." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // ── Search (manual) ─────────────────────────────────────────────────────────
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!key || settings.mode !== "manual") return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/carousels/${key}/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (res.ok) setResults((await res.json()).results);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [q, key, settings.mode]);

  // ── Arranging ───────────────────────────────────────────────────────────────
  const inCarousel = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const insertAt = (it: Item, at: number) => {
    setItems((list) => {
      const from = list.findIndex((x) => x.id === it.id);
      const next = [...list];
      if (from >= 0) {
        next.splice(from, 1);
        if (from < at) at -= 1;
      } else if (list.length >= settings.showCount) {
        toast({ title: "The carousel is full", description: `It shows ${settings.showCount} images. Remove one or raise "Images to show".` });
        return list;
      }
      next.splice(Math.max(0, Math.min(at, next.length)), 0, it);
      return next;
    });
    setDirty(true);
  };
  const remove = (id: number) => { setItems((l) => l.filter((x) => x.id !== id)); setDirty(true); };
  const nudge = (idx: number, by: -1 | 1) => {
    setItems((l) => {
      const j = idx + by;
      if (j < 0 || j >= l.length) return l;
      const n = [...l];
      [n[idx], n[j]] = [n[j]!, n[idx]!];
      return n;
    });
    setDirty(true);
  };

  const lookup = (d: DragData): Item | undefined =>
    (d.src === "items" ? items : d.src === "pool" ? pool : results ?? []).find((x) => x.id === d.id);

  const onDragStart = (e: DragEvent, d: DragData) => {
    e.dataTransfer.setData(DND, JSON.stringify(d));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: DragEvent, at: number) => {
    e.preventDefault();
    setDropAt(null);
    try {
      const d = JSON.parse(e.dataTransfer.getData(DND)) as DragData;
      const it = lookup(d);
      if (it) insertAt(it, at);
    } catch { /* not ours */ }
  };
  const allowDrop = (e: DragEvent, at: number) => {
    if (!e.dataTransfer.types.includes(DND)) return;
    e.preventDefault();
    setDropAt(at);
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!key) return;
    if (items.length === 0) {
      toast({ title: "Add at least one image", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/carousels/${key}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, items: items.slice(0, settings.showCount).map((i) => i.id), pool: pool.map((i) => i.id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      toast({ title: "Carousel saved", description: "Reload the page to see it." });
      setDirty(false);
      void loadDefs();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!defs) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;

  const def = detail?.def;
  const shown = items.slice(0, settings.showCount);

  return (
    <div className="space-y-10">
      {/* 1. Choose a carousel */}
      <section>
        <p className={`${small} mb-3`}>1 · Choose a carousel</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {defs.map((d) => (
            <button key={d.key} onClick={() => void open(d.key)}
              className={`text-left border p-4 transition-colors ${key === d.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
              <p className="font-display text-lg text-foreground">{d.name}</p>
              <p className="text-xs text-foreground/50 mt-1">Page {d.page} · covers {d.pageCoverage}% of a laptop screen</p>
              <p className="text-xs mt-2 text-foreground/70">
                {d.saved ? `${MODE_LABEL[d.saved.mode]} · ${d.saved.count} images` : "Built-in (not set up yet)"}
              </p>
            </button>
          ))}
        </div>
      </section>

      {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>}

      {def && !loading && (
        <>
          {/* 2. Coverage + live preview */}
          <section className="grid lg:grid-cols-[260px_1fr] gap-6">
            <div>
              <p className={`${small} mb-3`}>2 · Page coverage</p>
              <div className="border border-border p-4">
                <div className="relative w-full border border-foreground/30 bg-foreground/5" style={{ aspectRatio: `${def.screen.width} / ${def.screen.height}` }}>
                  <div className="absolute inset-x-0 top-0 bg-primary/25 border-b-2 border-primary flex items-center justify-center"
                    style={{ height: `${(def.frame.height / def.screen.height) * 100}%` }}>
                    <span className="text-xs font-medium text-primary">{def.pageCoverage}%</span>
                  </div>
                </div>
                <p className="text-sm text-foreground mt-3">Covers <b>{def.pageCoverage}%</b> of a {def.screen.width} × {def.screen.height} laptop screen.</p>
                <p className="text-xs text-foreground/60 mt-1">Frame {def.frame.width} × {def.frame.height} px (ratio {(def.frame.width / def.frame.height).toFixed(2)} : 1)</p>
                <p className="text-xs text-foreground/60 mt-1">{def.sizing}</p>
                <a href={def.page} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-secondary mt-3 hover:text-primary">
                  Open page <ExternalLink size={12} />
                </a>
              </div>
            </div>
            <div>
              <p className={`${small} mb-3`}>Current preview {dirty && <span className="text-amber-600 normal-case tracking-normal">· unsaved changes</span>}</p>
              <LivePreview items={shown} frame={def.frame} kind={def.kind} carouselKey={def.key} />
            </div>
          </section>

          {/* 3. How to fill it */}
          <section>
            <p className={`${small} mb-3`}>3 · Choose the images</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <label className="block">
                <span className={small}>Fill by</span>
                <select className={field} value={settings.mode} onChange={(e) => change({ mode: e.target.value as Mode })}>
                  {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                </select>
              </label>
              {settings.mode === "gallery" && (
                <label className="block">
                  <span className={small}>Gallery</span>
                  <select className={field} value={settings.galleryId ?? ""} onChange={(e) => change({ galleryId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Choose…</option>
                    {galleries.map((g) => <option key={g.id} value={g.id}>{g.name}{g.status !== "approved" ? ` (${g.status})` : ""}</option>)}
                  </select>
                </label>
              )}
              {settings.mode !== "manual" && (
                <label className="block">
                  <span className={small}>Images to choose</span>
                  <input type="number" min={1} max={100} className={field} value={settings.poolSize}
                    onChange={(e) => change({ poolSize: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
                </label>
              )}
              <label className="block">
                <span className={small}>Images to show</span>
                <input type="number" min={1} max={50} className={field} value={settings.showCount}
                  onChange={(e) => change({ showCount: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
              </label>
              {settings.mode !== "manual" && (
                <button onClick={() => void generate()} disabled={generating}
                  className="h-[38px] bg-primary text-primary-foreground text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60">
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Choose images
                </button>
              )}
            </div>
            <p className="text-xs text-foreground/50 mt-2">
              {settings.mode === "manual"
                ? "Manual keeps the images already in the carousel. Search below and drag images in, or drag them to reorder."
                : "Choosing replaces the carousel with the top images. Order: 4:3 images first, then images that fill at least 80% of the frame's width, then the rest by how much width they fill."}
            </p>
          </section>

          {/* 4. The carousel order */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <p className={small}>4 · In the carousel ({shown.length} of {settings.showCount}) — drag to reorder</p>
              {items.length > settings.showCount && <p className="text-xs text-amber-600">{items.length - settings.showCount} extra won't be shown</p>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3"
              onDragOver={(e) => allowDrop(e, items.length)} onDragLeave={() => setDropAt(null)} onDrop={(e) => onDrop(e, items.length)}>
              {items.map((it, idx) => (
                <div key={it.id} draggable onDragStart={(e) => onDragStart(e, { src: "items", id: it.id })}
                  onDragOver={(e) => { e.stopPropagation(); allowDrop(e, idx); }}
                  onDrop={(e) => { e.stopPropagation(); onDrop(e, idx); }}
                  className={`relative border bg-card cursor-grab active:cursor-grabbing transition-all ${dropAt === idx ? "border-primary ring-2 ring-primary/40" : "border-border"} ${idx >= settings.showCount ? "opacity-40" : ""}`}>
                  <span className="absolute top-1 left-1 z-10 bg-background/90 text-[10px] px-1.5 py-0.5 font-medium">{idx + 1}</span>
                  <button onClick={() => remove(it.id)} aria-label="Remove" className="absolute top-1 right-1 z-10 bg-background/90 p-0.5 hover:text-destructive"><X size={14} /></button>
                  <Thumb it={it} />
                  <div className="flex items-center justify-between px-1 pb-1">
                    <button onClick={() => nudge(idx, -1)} disabled={idx === 0} aria-label="Move left" className="p-1 disabled:opacity-20"><ChevronLeft size={14} /></button>
                    <button onClick={() => nudge(idx, 1)} disabled={idx === items.length - 1} aria-label="Move right" className="p-1 disabled:opacity-20"><ChevronRight size={14} /></button>
                  </div>
                </div>
              ))}
              {items.length < settings.showCount && (
                <div className={`border-2 border-dashed flex flex-col items-center justify-center text-center text-xs text-foreground/40 min-h-[150px] p-3 ${dropAt === items.length ? "border-primary text-primary" : "border-border"}`}>
                  <Plus size={18} className="mb-1" /> Drag an image here
                </div>
              )}
            </div>
          </section>

          {/* 5. Pool (algorithm) or search (manual) */}
          {settings.mode === "manual" ? (
            <section>
              <p className={`${small} mb-3`}>5 · Find images</p>
              <div className="relative max-w-md mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
                <input className={`${field} pl-8`} placeholder={detail?.def.kind === "artist" ? "Search artists by name, country, style…" : "Search by title, artist, theme, style…"}
                  value={q} onChange={(e) => setQ(e.target.value)} />
                {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-foreground/40" />}
              </div>
              <ChoiceGrid list={results ?? []} src="search" used={inCarousel} onDragStart={onDragStart}
                onAdd={(it) => insertAt(it, items.length)} empty={results ? "Nothing found." : "Loading…"} />
            </section>
          ) : (
            <section>
              <p className={`${small} mb-3`}>5 · Pool — the {pool.length} images the algorithm chose (drag or + to add)</p>
              <ChoiceGrid list={pool} src="pool" used={inCarousel} onDragStart={onDragStart}
                onAdd={(it) => insertAt(it, items.length)} empty='Press "Choose images" to fill the pool.' />
            </section>
          )}

          {/* Save */}
          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border py-4 flex flex-wrap gap-3 items-center">
            <button onClick={() => void save()} disabled={saving || !dirty}
              className="px-6 py-2.5 bg-primary text-primary-foreground text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save carousel
            </button>
            <button onClick={() => key && void open(key)} disabled={!dirty}
              className="px-6 py-2.5 border border-border text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-40">
              <RotateCcw size={14} /> Discard changes
            </button>
            {!detail?.configured && <span className="text-xs text-foreground/50">Not saved yet — the page still uses its built-in choice.</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Thumb({ it }: { it: Item }) {
  const shape = shapeLabel(it);
  return (
    <>
      <div className="aspect-[4/3] bg-foreground/5 flex items-center justify-center overflow-hidden">
        <img src={it.imageUrl} alt={it.title} loading="lazy" decoding="async" draggable={false}
          className="max-w-full max-h-full object-contain" />
      </div>
      <div className="px-2 pt-1.5">
        <p className="text-xs text-foreground truncate" title={it.title}>{it.title}</p>
        <p className="text-[10px] text-foreground/50 truncate">{it.subtitle}</p>
        <p className={`text-[10px] ${shape.tone}`}>{shape.text}</p>
      </div>
    </>
  );
}

function ChoiceGrid({ list, src, used, onDragStart, onAdd, empty }: {
  list: Item[]; src: "pool" | "search"; used: Set<number>;
  onDragStart: (e: DragEvent, d: DragData) => void; onAdd: (it: Item) => void; empty: string;
}) {
  if (list.length === 0) return <p className="text-sm text-foreground/50 border border-dashed border-border p-6 text-center">{empty}</p>;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
      {list.map((it) => {
        const isUsed = used.has(it.id);
        return (
          <div key={it.id} draggable={!isUsed} onDragStart={(e) => onDragStart(e, { src, id: it.id })}
            className={`relative border border-border bg-card ${isUsed ? "opacity-40" : "cursor-grab active:cursor-grabbing hover:border-primary/50"}`}>
            {!isUsed ? (
              <button onClick={() => onAdd(it)} aria-label="Add to carousel" className="absolute top-1 right-1 z-10 bg-background/90 p-0.5 hover:text-primary"><Plus size={14} /></button>
            ) : (
              <span className="absolute top-1 right-1 z-10 bg-background/90 text-[9px] px-1 uppercase tracking-wide">In carousel</span>
            )}
            <Thumb it={it} />
          </div>
        );
      })}
    </div>
  );
}

/** Plays the draft the way the page does: paintings as their 16:9 version filling the frame, artist photos filling the frame. */
function LivePreview({ items, frame, kind, carouselKey }: { items: Item[]; frame: { width: number; height: number }; kind: "artwork" | "artist"; carouselKey: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [items.length]);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 3000);
    return () => clearInterval(t);
  }, [items.length]);
  const it = items[i % Math.max(items.length, 1)];
  return (
    <div className="relative w-full border border-border bg-background overflow-hidden [container-type:size]" style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>
      {!it ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-foreground/40">No images in the carousel</div>
      ) : (
        <AnimatePresence initial={false}>
          <motion.div key={`${it.id}-${i}`} className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            {kind === "artist" ? (
              <img src={it.imageUrl} alt={it.title} className="w-full h-full object-cover object-top" />
            ) : (
              <img src={`/api/carousels/slide/${carouselKey}/${it.id}`} alt={it.title} className="w-full h-full object-cover" />
            )}
          </motion.div>
        </AnimatePresence>
      )}
      {items.length > 0 && (
        <span className="absolute bottom-2 right-2 bg-background/90 text-[10px] px-2 py-0.5">{(i % items.length) + 1} / {items.length}</span>
      )}
    </div>
  );
}
