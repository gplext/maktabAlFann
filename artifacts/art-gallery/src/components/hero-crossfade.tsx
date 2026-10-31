import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

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

export function HeroCrossfade({ slides, intervalMs = 5000, className = "" }: Props) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const advance = useCallback(() => {
    setCurrent((i) => (i + 1) % Math.max(slides.length, 1));
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const id = setInterval(advance, intervalMs);
    return () => clearInterval(id);
  }, [advance, intervalMs, paused, slides.length]);

  if (slides.length === 0) return null;

  const active = slides[current] ?? slides[0];

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={current}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        >
          <img
            src={active.imageUrl}
            alt={active.category}
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

      {/* Dot indicators — bottom right */}
      <div className="absolute bottom-8 right-8 z-20 flex gap-2 items-center">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            aria-label={`Slide ${i + 1}`}
            className={`block transition-all duration-500 rounded-full ${
              i === current
                ? "w-6 h-[2px] bg-secondary"
                : "w-2 h-[2px] bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
