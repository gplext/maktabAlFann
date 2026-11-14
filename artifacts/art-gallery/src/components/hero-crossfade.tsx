import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HeroSlide {
  imageUrl: string;
  category: string;
  label?: string;
}

interface Props {
  slides: HeroSlide[];
  intervalMs?: number;
  className?: string;
}

export function HeroCrossfade({ slides: allSlides, intervalMs = 3000, className = "" }: Props) {
  // Pictures that fail to load are dropped from the rotation, so the carousel never shows an empty frame.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const slides = useMemo(() => allSlides.filter((s) => !broken.has(s.imageUrl)), [allSlides, broken]);
  const [current, setCurrent] = useState(0);
  useEffect(() => { if (current >= slides.length && slides.length > 0) setCurrent(0); }, [current, slides.length]);
  // Bumped when a visitor picks a slide, so the 3-second timer restarts from that slide.
  const [manual, setManual] = useState(0);

  const advance = useCallback(() => {
    setCurrent((i) => (i + 1) % Math.max(slides.length, 1));
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(advance, intervalMs);
    return () => clearInterval(id);
  }, [advance, intervalMs, slides.length, manual]);

  const go = (i: number) => {
    const n = Math.max(slides.length, 1);
    setCurrent(((i % n) + n) % n);
    setManual((m) => m + 1);
  };

  // Preload every slide so changing slides never waits on a download; note any that fail.
  useEffect(() => {
    allSlides.forEach((s) => {
      const img = new Image();
      img.onerror = () => setBroken((b) => (b.has(s.imageUrl) ? b : new Set(b).add(s.imageUrl)));
      img.src = s.imageUrl;
    });
  }, [allSlides]);

  if (slides.length === 0) return <div className={className} />;

  const active = slides[current] ?? slides[0];

  return (
    <div
      className={`relative overflow-hidden ${className}`}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={current}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <img
            src={active.imageUrl}
            onError={() => setBroken((b) => new Set(b).add(active.imageUrl))}
            alt={`${active.category} — Pakistani art at Maktaba Al-Fann`}
            className="w-full h-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
          <div className="absolute inset-0 bg-primary/15 mix-blend-multiply" />
        </motion.div>
      </AnimatePresence>

      {/* Category label — bottom left */}
      <div className="absolute bottom-6 left-8 z-20 flex flex-col gap-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <span className="text-[10px] uppercase tracking-[0.35em] text-secondary/80 block mb-0.5">
              {active.label ?? "Pakistani Art"}
            </span>
            <span className="font-display text-base md:text-lg text-white/90">
              {active.category}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Previous / next — large enough to tap */}
      {slides.length > 1 && (
        <>
          <button onClick={() => go(current - 1)} aria-label="Previous painting"
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-black/35 hover:bg-black/55 text-white border border-white/30 backdrop-blur-sm transition-colors">
            <ChevronLeft className="w-6 h-6 md:w-7 md:h-7" />
          </button>
          <button onClick={() => go(current + 1)} aria-label="Next painting"
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-black/35 hover:bg-black/55 text-white border border-white/30 backdrop-blur-sm transition-colors">
            <ChevronRight className="w-6 h-6 md:w-7 md:h-7" />
          </button>
        </>
      )}

      {/* Slide markers — bottom right: close together, each bar 24–40 px wide with a 40 px tall click area.
          Phones use the arrows instead: ten 40 px markers wouldn't fit across the screen. */}
      <div className="absolute bottom-5 right-6 z-20 hidden md:flex items-center">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            aria-label={`Show painting ${i + 1}`}
            aria-current={i === current}
            className="group h-10 px-1 flex items-center"
          >
            <span className={`block h-1 rounded-full transition-all duration-500 ${
              i === current ? "w-10 bg-secondary" : "w-6 bg-white/50 group-hover:bg-white/80"
            }`} />
          </button>
        ))}
      </div>
    </div>
  );
}
