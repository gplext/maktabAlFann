import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, ZoomOut, LayoutGrid, Box } from "lucide-react";
import { useUser } from "@/lib/auth";
import { computeSlots, type MoveInput, type MuseumArtwork, type Preset } from "@/components/museum/layout";

/** Buyer portal: My Museum — walk through a museum where your purchased paintings hang. */
const MuseumScene = lazy(() => import("@/components/museum/MuseumScene"));

type Museum = { code: string; name: string; description: string; preset: Preset };
type Layout = { museumCode: string; wallColor: string | null; slots: Record<string, number> } | null;

const btn = "px-3 py-1.5 text-[11px] uppercase tracking-widest border border-border hover:border-secondary hover:text-secondary transition disabled:opacity-40";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

/** Hang works in order N, E, S, W, keeping any saved placements that still apply. */
function autoFill(slotIds: string[], artworks: MuseumArtwork[], saved: Record<string, number>): Record<string, number> {
  const owned = new Set(artworks.map((a) => a.id));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(saved)) if (slotIds.includes(k) && owned.has(v)) out[k] = v;
  const placed = new Set(Object.values(out));
  const free = slotIds.filter((s) => !(s in out));
  artworks.filter((a) => !placed.has(a.id)).forEach((a, i) => { if (free[i]) out[free[i]!] = a.id; });
  return out;
}

/** Full-screen high-resolution view: wheel/pinch-free zoom with buttons and drag to pan. */
function Inspect({ art, onClose }: { art: MuseumArtwork; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const z = (f: number) => setZoom((v) => { const n = Math.max(1, Math.min(6, v * f)); if (n === 1) setPan({ x: 0, y: 0 }); return n; });
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" role="dialog" aria-label={`${art.title} — full view`}>
      <div className="flex items-center justify-between p-4 text-white/80">
        <div>
          <p className="font-display text-xl text-white">{art.title}</p>
          <p className="text-xs">{art.artistName}{art.year ? ` · ${art.year}` : ""}{art.medium ? ` · ${art.medium}` : ""}{art.dimensions ? ` · ${art.dimensions}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <button className="p-2 hover:text-white" onClick={() => z(1.5)} aria-label="Zoom in"><ZoomIn size={20} /></button>
          <button className="p-2 hover:text-white" onClick={() => z(1 / 1.5)} aria-label="Zoom out"><ZoomOut size={20} /></button>
          <button className="p-2 hover:text-white" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        onWheel={(e) => z(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        onPointerDown={(e) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; }}
        onPointerMove={(e) => { if (drag.current && zoom > 1) setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
        onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}
        style={{ touchAction: "none" }}>
        <img loading="lazy" decoding="async" src={art.imageUrl} alt={art.title} draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: drag.current ? "none" : "transform 120ms ease-out" }} />
      </div>
    </div>
  );
}

export default function MuseumPage() {
  const { user, isLoaded } = useUser();
  const [museums, setMuseums] = useState<Museum[]>([]);
  const [artworks, setArtworks] = useState<MuseumArtwork[]>([]);
  const [museumCode, setMuseumCode] = useState<string>("");
  const [wallColor, setWallColor] = useState<string>("");
  const [slots, setSlots] = useState<Record<string, number>>({});
  const [savedLayout, setSavedLayout] = useState<Layout>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"3d" | "2d">(() => (hasWebGL() ? "3d" : "2d"));
  const [arranging, setArranging] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [inspect, setInspect] = useState<MuseumArtwork | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const move = useRef<MoveInput>({ forward: 0, turn: 0 });
  const reducedMotion = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);

  useEffect(() => {
    if (!isLoaded || !user) return;
    Promise.all([
      fetch("/api/museum/museums").then((r) => r.json()),
      fetch("/api/museum/me", { credentials: "include" }).then((r) => r.json()),
    ]).then(([ms, me]: [Museum[], { artworks: MuseumArtwork[]; layout: Layout }]) => {
      setMuseums(ms);
      setArtworks(me.artworks ?? []);
      setSavedLayout(me.layout);
      const code = me.layout?.museumCode ?? ms[0]?.code ?? "";
      setMuseumCode(code);
      setWallColor(me.layout?.wallColor ?? "");
    }).finally(() => setLoaded(true));
  }, [isLoaded, user]);

  const museum = museums.find((m) => m.code === museumCode);
  const slotList = useMemo(() => (museum ? computeSlots(museum.preset) : []), [museum]);

  // Re-hang when the museum changes (different rooms have different slots).
  useEffect(() => {
    if (!museum) return;
    const saved = savedLayout && savedLayout.museumCode === museum.code ? savedLayout.slots : slots;
    setSlots(autoFill(slotList.map((s) => s.id), artworks, saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [museum?.code, artworks, savedLayout]);

  const save = async () => {
    setStatus("Saving…");
    const res = await fetch("/api/museum/me", {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ museumCode, wallColor: wallColor || null, slots }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setSavedLayout(data.layout); setStatus("Saved"); } else setStatus(data.error ?? "Could not save");
    setTimeout(() => setStatus(null), 2500);
  };

  const hold = useCallback((key: keyof MoveInput, value: number) => ({
    onPointerDown: () => { move.current[key] = value; },
    onPointerUp: () => { move.current[key] = 0; },
    onPointerLeave: () => { move.current[key] = 0; },
  }), []);

  const selected = artworks.find((a) => a.id === selectedId) ?? null;

  if (isLoaded && !user) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-36 pb-24 text-center space-y-4">
        <h1 className="font-display text-4xl text-primary">My Museum</h1>
        <p className="text-foreground/60">Sign in to walk through a museum hung with the artworks you've collected.</p>
        <Link href="/sign-in?after=/museum" className="inline-block px-6 py-3 bg-primary text-primary-foreground uppercase tracking-widest text-sm">Sign in</Link>
      </div>
    );
  }
  if (!loaded) return <p className="pt-36 p-24 text-center text-foreground/50">Opening your museum…</p>;
  if (artworks.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-36 pb-24 text-center space-y-4">
        <h1 className="font-display text-4xl text-primary">My Museum</h1>
        <p className="text-foreground/60">Your museum opens once your first purchase is paid or delivered. Every piece you collect will hang here.</p>
        <Link href="/art" className="inline-block px-6 py-3 border border-primary text-primary uppercase tracking-widest text-sm">Explore the collection</Link>
      </div>
    );
  }

  const preset = museum?.preset;
  const wallsLabel: Record<string, string> = { N: "North wall", E: "East wall", S: "South wall", W: "West wall" };

  return (
    <div className="flex flex-col h-[100dvh] pt-16 min-h-[580px]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-background">
        <h1 className="font-display text-2xl text-primary mr-3">My Museum</h1>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Choose a museum">
          {museums.map((m) => (
            <button key={m.code} role="radio" aria-checked={m.code === museumCode} title={m.description}
              onClick={() => { setMuseumCode(m.code); setSelectedId(null); }}
              className={`px-3 py-1.5 text-xs border transition ${m.code === museumCode ? "border-secondary bg-secondary/10 text-foreground" : "border-border text-foreground/60 hover:border-secondary/50"}`}>
              {m.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground/60 ml-2">Walls
          <input type="color" value={wallColor || preset?.wall || "#f4f2ee"} onChange={(e) => setWallColor(e.target.value)} className="w-8 h-7 border border-border bg-transparent" />
          {wallColor && <button className="underline" onClick={() => setWallColor("")}>reset</button>}
        </label>
        <div className="ml-auto flex gap-2 items-center">
          {status && <span className="text-xs text-foreground/60">{status}</span>}
          <button className={btn} onClick={() => setArranging((v) => !v)}>{arranging ? "Done arranging" : "Arrange"}</button>
          <button className={btn} onClick={() => void save()}>Save layout</button>
          <button className={btn} onClick={() => setMode(mode === "3d" ? "2d" : "3d")} aria-label="Switch view">
            {mode === "3d" ? <span className="flex items-center gap-1"><LayoutGrid size={13} /> 2D</span> : <span className="flex items-center gap-1"><Box size={13} /> 3D</span>}
          </button>
        </div>
      </div>

      <div className="relative flex-1 flex min-h-0">
        {/* Arrange panel */}
        {arranging && (
          <aside className="w-72 shrink-0 border-r border-border overflow-auto p-4 space-y-4 bg-background">
            <p className="text-xs text-foreground/60">Choose which artwork hangs on each spot, then save.</p>
            {["N", "E", "S", "W"].map((wall) => (
              <div key={wall} className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-secondary">{wallsLabel[wall]}</p>
                {slotList.filter((s) => s.id.startsWith(wall)).map((s, i) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-foreground/40">{i + 1}</span>
                    <select className="flex-1 border border-border bg-background px-2 py-1"
                      value={slots[s.id] ?? ""} onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        setSlots((cur) => {
                          const next = { ...cur };
                          for (const [k, v] of Object.entries(next)) if (v === id) delete next[k]; // one place per artwork
                          if (id) next[s.id] = id; else delete next[s.id];
                          return next;
                        });
                      }}>
                      <option value="">— empty —</option>
                      {artworks.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            ))}
          </aside>
        )}

        {/* Viewer */}
        <div className="relative flex-1 min-w-0">
          {mode === "3d" && preset ? (
            <Suspense fallback={<p className="p-24 text-center text-foreground/50">Building the gallery…</p>}>
              <MuseumScene preset={preset} wallColor={wallColor || preset.wall} artworks={artworks} slots={slots}
                selectedId={selectedId} onSelect={setSelectedId} move={move} reducedMotion={reducedMotion} />
              <p className="absolute top-3 left-1/2 -translate-x-1/2 text-[11px] px-3 py-1 bg-black/45 text-white/90 pointer-events-none hidden sm:block">
                Drag to look · W A S D / arrows to walk · click a painting to walk up to it
              </p>
              {/* Touch controls */}
              <div className="absolute bottom-4 left-4 grid grid-cols-3 gap-1 sm:hidden select-none" style={{ touchAction: "none" }}>
                <span />
                <button aria-label="Walk forward" className="p-3 bg-black/45 text-white" {...hold("forward", 1)}><ChevronUp size={20} /></button>
                <span />
                <button aria-label="Turn left" className="p-3 bg-black/45 text-white" {...hold("turn", 1)}><ChevronLeft size={20} /></button>
                <button aria-label="Walk back" className="p-3 bg-black/45 text-white" {...hold("forward", -1)}><ChevronDown size={20} /></button>
                <button aria-label="Turn right" className="p-3 bg-black/45 text-white" {...hold("turn", -1)}><ChevronRight size={20} /></button>
              </div>
            </Suspense>
          ) : (
            <div className="h-full overflow-auto p-6 grid gap-6 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start" style={{ background: wallColor || preset?.wall }}>
              {artworks.map((a) => (
                <button key={a.id} onClick={() => setSelectedId(a.id)} className="text-left group">
                  <div className="p-3 bg-[#2f2219] shadow-lg"><img src={a.imageUrl} alt={a.title} loading="lazy" className="w-full aspect-[4/3] object-cover" /></div>
                  <p className="mt-2 text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">{a.artistName}</p>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="absolute bottom-4 right-4 w-72 bg-background/95 border border-border p-4 space-y-2 shadow-xl">
              <div className="flex justify-between gap-2">
                <p className="font-display text-lg text-primary leading-tight">{selected.title}</p>
                <button onClick={() => setSelectedId(null)} aria-label="Close"><X size={16} /></button>
              </div>
              <p className="text-xs text-foreground/60">{selected.artistName}{selected.year ? ` · ${selected.year}` : ""}</p>
              {(selected.medium || selected.dimensions) && <p className="text-xs text-foreground/50">{[selected.medium, selected.dimensions].filter(Boolean).join(" · ")}</p>}
              <button className={`${btn} flex items-center gap-1`} onClick={() => setInspect(selected)}><Maximize2 size={12} /> View in full detail</button>
            </div>
          )}
        </div>
      </div>
      {inspect && <Inspect art={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
}
