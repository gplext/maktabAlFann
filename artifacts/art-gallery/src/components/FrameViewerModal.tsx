import { useEffect, useState, lazy, Suspense } from "react";
import { X, Loader2, Move3d, Sofa, Frame } from "lucide-react";
import type { FrameSpec3D, ArtSizeMm, ViewMode } from "./FrameViewer3D";
import { formatMoney } from "@/lib/money";

// The 3D viewer is heavy: load it only when the modal opens.
const FrameViewer3D = lazy(() => import("./FrameViewer3D"));

export type FrameOption = { id: number; name: string; price: number; spec: FrameSpec3D };

export interface FrameViewerModalProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  artistName: string;
  /** Old prop, ignored. */
  size?: string | null;
  artMm?: ArtSizeMm | null;
  /** A single frame to show (cart). */
  spec?: FrameSpec3D | null;
  frameName?: string | null;
  /** Frames to choose from (artwork page). */
  frames?: FrameOption[];
  initialFrameId?: number | null;
  initialMode?: ViewMode;
}

/** Swatch colour for a frame finish. */
function swatch(spec: FrameSpec3D | null): string {
  const f = spec?.look?.finish;
  if (!spec?.look) return "repeating-linear-gradient(45deg,#e8e2d7 0 4px,#d6cfc2 4px 8px)";
  if (f === "gold") return "linear-gradient(135deg,#f4d98a,#b8893a 45%,#7a5518 70%,#e8c46e)";
  if (f === "silver") return "linear-gradient(135deg,#f6f7f9,#b9bdc4 45%,#7d828a 70%,#e6e8eb)";
  if (f === "walnut") return "repeating-linear-gradient(100deg,#6b4429 0 3px,#4a2c18 3px 5px,#5e3b22 5px 9px)";
  if (f === "natural") return "repeating-linear-gradient(100deg,#d2a874 0 3px,#a87d4b 3px 5px,#c79c66 5px 9px)";
  return spec.look.colourHex;
}
const cm = (mm: number) => Math.round(mm / 10);

export default function FrameViewerModal({
  open, onClose, imageUrl, title, artistName, artMm, spec, frameName, frames, initialFrameId = null, initialMode = "closeup",
}: FrameViewerModalProps) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [frameId, setFrameId] = useState<number | null>(initialFrameId);
  const [picked, setPicked] = useState(false);
  useEffect(() => { if (open) { setMode(initialMode); setFrameId(initialFrameId); setPicked(false); } }, [open, initialMode, initialFrameId]);
  // Frames arrive after the modal opens: show the first one until the visitor chooses.
  useEffect(() => { if (open && !picked && frameId === null && frames?.length) setFrameId(frames[0]!.id); }, [open, picked, frameId, frames]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open) return null;

  const chosen = frames ? frames.find((f) => f.id === frameId) ?? null : null;
  const shownSpec = frames ? chosen?.spec ?? null : spec ?? null;
  const shownName = frames ? chosen?.name ?? null : frameName ?? null;
  const art = artMm ?? shownSpec?.artwork ?? null;
  const outer = shownSpec?.outer;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#14100b]" role="dialog" aria-modal="true" aria-label={`3D view of ${title}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3 border-b border-white/10">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/40">View in 3D</p>
          <p className="font-display text-white text-lg leading-tight truncate">{title}</p>
          <p className="text-white/50 italic text-sm truncate">by {artistName}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-white/20" role="tablist" aria-label="View">
            {([["closeup", "Close-up", Frame], ["room", "In a room", Sofa]] as const).map(([m, label, Icon]) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-widest transition-colors ${mode === m ? "bg-white text-black" : "text-white/70 hover:text-white"}`}>
                <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-2" aria-label="Close 3D view"><X size={22} /></button>
        </div>
      </div>

      {/* 3D */}
      <div className="flex-1 relative overflow-hidden">
        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Loader2 size={32} className="text-amber-300/80 animate-spin" /></div>}>
          <FrameViewer3D imageUrl={imageUrl} artMm={art} spec={shownSpec} mode={mode} />
        </Suspense>
      </div>

      {/* Frames + size */}
      <div className="border-t border-white/10 px-4 md:px-6 py-3 space-y-3">
        {frames && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Frame">
            {[null, ...frames].map((f) => {
              const active = (f?.id ?? null) === frameId;
              return (
                <button key={f?.id ?? "none"} role="radio" aria-checked={active} onClick={() => { setPicked(true); setFrameId(f?.id ?? null); }}
                  className={`flex-shrink-0 flex items-center gap-2 pl-1.5 pr-3 py-1.5 border transition-colors ${active ? "border-amber-300 bg-white/10" : "border-white/15 hover:border-white/40"}`}>
                  <span className="w-7 h-7 border border-black/30 shadow-inner" style={{ background: swatch(f?.spec ?? null) }} />
                  <span className="text-left">
                    <span className="block text-xs text-white leading-tight">{f ? f.name : "No frame"}</span>
                    <span className="block text-[10px] text-white/50">{f ? `+ ${formatMoney(f.price)}` : "Canvas only"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-widest">
          <span className="flex items-center gap-2 text-white/40"><Move3d size={13} /> Drag to look around · scroll to zoom</span>
          <span className="text-white/60">
            {art ? `Painting ${cm(art.widthMm)} × ${cm(art.heightMm)} cm` : "Size not recorded — shown at about 60 cm"}
            {outer && <> · {shownName ?? "Frame"}: {cm(outer.widthMm)} × {cm(outer.heightMm)} cm framed</>}
            {mode === "room" && art && " · shown at real size"}
          </span>
        </div>
      </div>
    </div>
  );
}
