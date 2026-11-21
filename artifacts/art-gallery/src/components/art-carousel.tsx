import { useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ArtCard = { id: number; title: string; artistName: string; imageUrl: string; artType?: string | null };

/**
 * A row of artwork cards that slides by itself (one card every few seconds,
 * looping back to the start) and can be moved with the arrows or by swiping.
 */
export function ArtCarousel({ items, intervalMs = 3000, endless = false, speed = 45 }: {
  items: ArtCard[];
  intervalMs?: number;
  /** Banner mode: glides continuously (no stops) and loops forever — the cards repeat, so it never rewinds. */
  endless?: boolean;
  /** Banner speed in pixels per second. */
  speed?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const step = useCallback((dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const by = card ? card.getBoundingClientRect().width + 16 : el.clientWidth / 2;
    if (endless) {
      // The list is rendered twice; past the first copy, jump back by one copy (looks identical) and keep going.
      const copy = el.children[items.length] as HTMLElement | undefined;
      const half = copy ? copy.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft : el.scrollWidth / 2;
      if (dir === 1 && el.scrollLeft >= half - 4) el.scrollTo({ left: el.scrollLeft - half, behavior: "instant" });
      if (dir === -1 && el.scrollLeft <= 4) el.scrollTo({ left: el.scrollLeft + half, behavior: "instant" });
      requestAnimationFrame(() => el.scrollBy({ left: dir * by, behavior: "smooth" }));
      return;
    }
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    const atStart = el.scrollLeft <= 4;
    if (dir === 1 && atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
    else if (dir === -1 && atStart) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    else el.scrollBy({ left: dir * by, behavior: "smooth" });
  }, [endless, items.length]);

  const start = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (items.length < 2) return;
    timer.current = setInterval(() => step(1), intervalMs);
  }, [items.length, intervalMs, step]);

  useEffect(() => {
    if (endless) return; // banner mode moves itself (below)
    start();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [start, endless]);

  // Banner mode: move a little every frame, at a steady speed, and wrap round seamlessly.
  const pos = useRef(0);
  useEffect(() => {
    if (!endless || items.length < 2) return;
    const el = track.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100); // a hidden tab doesn't cause a big jump
      last = now;
      const copy = el.children[items.length] as HTMLElement | undefined;
      const half = copy ? copy.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft : el.scrollWidth / 2;
      if (half > 0) {
        if (Math.abs(el.scrollLeft - pos.current) > 2) pos.current = el.scrollLeft; // an arrow press moved it
        pos.current += (speed * dt) / 1000;
        if (pos.current >= half) pos.current -= half;
        if (pos.current < 0) pos.current += half;
        el.scrollLeft = pos.current;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endless, items.length, speed]);

  // An arrow press restarts the timer so the row doesn't jump right after it.
  const press = (dir: 1 | -1) => {
    if (endless) {
      // Banner mode: hop one card instantly; the glide carries on from there.
      const el = track.current;
      const card = el?.firstElementChild as HTMLElement | null;
      if (el && card) { pos.current += dir * (card.getBoundingClientRect().width + 16); el.scrollLeft = pos.current; }
      return;
    }
    step(dir); start();
  };

  if (items.length === 0) return null;

  return (
    <div className="relative group/carousel">
      <div
        ref={track}
        className={`flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${endless ? "" : "snap-x snap-mandatory scroll-smooth"}`}
      >
        {(endless ? [...items, ...items] : items).map((artwork, i) => (
          <Link key={`${artwork.id}-${i}`} href={`/art/${artwork.id}`}
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
        className="absolute left-2 top-[38%] -translate-y-1/2 z-10 w-12 h-12 md:w-14 md:h-14 bg-background/90 border border-border shadow-md flex items-center justify-center text-foreground hover:border-secondary hover:text-primary transition-colors">
        <ChevronLeft className="w-6 h-6 md:w-7 md:h-7" />
      </button>
      <button onClick={() => press(1)} aria-label="Next artworks"
        className="absolute right-2 top-[38%] -translate-y-1/2 z-10 w-12 h-12 md:w-14 md:h-14 bg-background/90 border border-border shadow-md flex items-center justify-center text-foreground hover:border-secondary hover:text-primary transition-colors">
        <ChevronRight className="w-6 h-6 md:w-7 md:h-7" />
      </button>
    </div>
  );
}
