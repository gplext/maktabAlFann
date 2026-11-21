import { useQuery } from "@tanstack/react-query";

/**
 * A frame drawn around one of our paintings, in plain CSS (no 3D), for shop cards and Admin.
 * Proportions follow the real frame: a 4 cm moulding around a painting about 60 cm wide.
 * The four sides are mitred at the corners and lit from the top left.
 */

export type ThumbLook = {
  finish: string; colourHex: string; textureUrl: string | null; faceWidthMm: number;
};

const FINISH_BG: Record<string, string> = {
  gold: "linear-gradient(135deg,#f6dc92 0%,#c9a04c 28%,#8a6220 52%,#d9b764 74%,#a37a2c 100%)",
  silver: "linear-gradient(135deg,#ffffff 0%,#cfd2d7 30%,#8d929a 55%,#e4e6ea 78%,#a9adb4 100%)",
  walnut: "repeating-linear-gradient(90deg,#6a432a 0 3px,#4c2e1a 3px 5px,#5e3b22 5px 11px,#3f2513 11px 12px)",
  natural: "repeating-linear-gradient(90deg,#d4aa76 0 3px,#a97e4c 3px 5px,#c79c66 5px 11px,#9b7142 11px 12px)",
  black: "linear-gradient(135deg,#3a3836,#141312 45%,#2a2826)",
  white: "linear-gradient(135deg,#ffffff,#ecebe6 50%,#dedbd3)",
};
const MOUNT: Record<string, { mm: number; colour: string }> = { none: { mm: 0, colour: "" }, white: { mm: 50, colour: "#F6F4EE" }, cream: { mm: 50, colour: "#ECE2CB" } };

/** Strong landscape paintings from the collection to show inside frame previews. */
export function usePreviewPaintings() {
  const { data } = useQuery<{ imageUrl: string; title: string }[]>({
    queryKey: ["/frames/preview-paintings"],
    queryFn: async () => { const r = await fetch("/api/frames/preview-paintings"); return r.ok ? r.json() : []; },
    staleTime: 10 * 60_000,
  });
  return data ?? [];
}

export function FramedThumb({ look, mount = "none", glass = false, imageUrl, className = "" }: {
  look: ThumbLook; mount?: string; glass?: boolean; imageUrl?: string | null; className?: string;
}) {
  const m = MOUNT[mount] ?? MOUNT.none!;
  // Painting = 60 cm; everything is scaled to fit 84% of the card width.
  const k = 84 / (600 + 2 * (look.faceWidthMm + m.mm));
  const face = look.faceWidthMm * k, mat = m.mm * k, paint = 600 * k;
  const bg = look.finish === "custom"
    ? (look.textureUrl ? `url(${look.textureUrl}) center/cover` : look.colourHex)
    : FINISH_BG[look.finish] ?? look.colourHex;
  const cq = (v: number) => `${v}cqw`;

  return (
    <div className={`flex items-center justify-center bg-[#E7E3DC] ${className}`} style={{ containerType: "inline-size" }}>
      <div className="relative" style={{ padding: cq(face), background: bg, boxShadow: "0 1.5cqw 3cqw rgba(0,0,0,.28), 0 .3cqw .6cqw rgba(0,0,0,.2)" }}>
        {/* Mitred light: top and left catch the light, bottom and right fall into shade. */}
        <div className="absolute inset-0 pointer-events-none" style={{
          borderStyle: "solid", borderWidth: cq(face),
          borderColor: "rgba(255,255,255,.22) rgba(0,0,0,.16) rgba(0,0,0,.30) rgba(255,255,255,.10)",
        }} />
        <div style={{ padding: mat ? cq(mat) : 0, background: m.colour || undefined, boxShadow: "inset 0 .25cqw .6cqw rgba(0,0,0,.45)" }}>
          <div className="relative bg-[#cfc6b6]" style={{ width: cq(paint), aspectRatio: "4 / 3", boxShadow: mat ? "0 0 0 .15cqw rgba(255,255,255,.9), inset 0 .2cqw .5cqw rgba(0,0,0,.35)" : "inset 0 .3cqw .7cqw rgba(0,0,0,.45)" }}>
            {imageUrl && <img src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />}
            {glass && <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(120deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 35%,rgba(255,255,255,0) 70%,rgba(255,255,255,.12) 100%)" }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
