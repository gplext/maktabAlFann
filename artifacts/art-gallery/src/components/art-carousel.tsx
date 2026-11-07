import { useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ArtCard = { id: number; title: string; artistName: string; imageUrl: string; artType?: string | null };

/**
 * A row of artwork cards that slides by itself (one card every few seconds,
 * looping back to the start) and can be moved with the arrows or by swiping.
 */
export function ArtCarousel({ items, intervalMs = 3000 }: { items: ArtCard[]; intervalMs?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const step = useCallback((dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const by = card ? card.getBoundingClientRect().width + 16 : el.clientWidth / 2;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    const atStart = el.scrollLeft <= 4;
    if (dir === 1 && atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
    else if (dir === -1 && atStart) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    else el.scrollBy({ left: dir * by, behavior: "smooth" });
  }, []);

  const start = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (items.length < 2) return;
    timer.current = setInterval(() => step(1), intervalMs);
  }, [items.length, intervalMs, step]);

  useEffect(() => {
    start();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [start]);

  // An arrow press restarts the timer so the row doesn't jump right after it.
  const press = (dir: 1 | -1) => { step(dir); start(); };

  if (items.length === 0) return null;

  return (
    <div className="relative group/carousel">
      <div
        ref={track}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((artwork) => (
          <Link key={artwork.id} href={`/art/${artwork.id}`}
            className="block group snap-start shrink-0 w-[46%] sm:w-[31%] md:w-[23.5%] lg:w-[18.8%]">
            <div className="aspect-[2/3] overflow-hidden bg-background border border-border relative">
              <img loading="lazy" decoding="async" src={artwork.imageUrl} alt={artwork.title}
                className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              {artwork.artType && (
                <div className="absolute bottom-0 inset-x-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <p className="text-[10px] uppercase tracking-widest text-secondary truncate">{artwork.artType}</p>
                </div>
              )}
            </div>
            <div className="mt-3 px-0.5">
              <h4 className="text-xs font-display text-foreground group-hover:text-primary transition-colors line-clamp-1">{artwork.title}</h4>
              <p className="text-[11px] text-foreground/55 mt-0.5 line-clamp-1">{artwork.artistName}</p>
            </div>
          </Link>
        ))}
      </div>

      <button onClick={() => press(-1)} aria-label="Previous artworks"
        className="absolute left-2 top-[38%] -translate-y-1/2 w-10 h-10 bg-background/85 border border-border flex items-center justify-center text-foreground hover:border-secondary transition-colors">
        <ChevronLeft size={18} />
      </button>
      <button onClick={() => press(1)} aria-label="Next artworks"
        className="absolute right-2 top-[38%] -translate-y-1/2 w-10 h-10 bg-background/85 border border-border flex items-center justify-center text-foreground hover:border-secondary transition-colors">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
