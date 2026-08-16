import { useEffect, useCallback, lazy, Suspense } from "react";
import { X, Loader2, RotateCcw } from "lucide-react";

// Lazy-load the heavy 3-D viewer so it doesn't bloat the main bundle
const FrameViewer3D = lazy(() => import("./FrameViewer3D"));

export interface FrameViewerModalProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  artistName: string;
  size?: string | null;
}

export default function FrameViewerModal({
  open,
  onClose,
  imageUrl,
  title,
  artistName,
  size,
}: FrameViewerModalProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: "rgba(10, 6, 2, 0.97)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`3D frame view of ${title}`}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40 mb-0.5">3D Frame Preview</p>
          <p className="font-display text-white text-lg leading-tight">{title}</p>
          <p className="text-white/50 italic text-sm">by {artistName}</p>
        </div>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors p-2"
          aria-label="Close 3D viewer"
        >
          <X size={22} />
        </button>
      </div>

      {/* ── 3D canvas area ───────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <Loader2 size={36} className="text-amber-500/70 animate-spin" />
                <p className="text-white/40 text-xs uppercase tracking-widest">Loading frame…</p>
              </div>
            </div>
          }
        >
          <FrameViewer3D imageUrl={imageUrl} size={size} />
        </Suspense>
      </div>

      {/* ── Bottom hint bar ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/30 text-xs">
          <RotateCcw size={12} />
          <span>Drag to rotate · Scroll to zoom</span>
        </div>
        {size && (
          <p className="text-white/30 text-xs uppercase tracking-widest">{size}</p>
        )}
      </div>
    </div>
  );
}
