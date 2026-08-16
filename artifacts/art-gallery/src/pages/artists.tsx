import { useListArtists, useGetArtist, useGetArtistPortfolio, getGetArtistQueryKey, getGetArtistPortfolioQueryKey } from "@workspace/api-client-react";
import type { Artist } from "@workspace/api-client-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Loader2, Search, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Artists() {
  const [filters, setFilters] = useState<{ search?: string; country?: string; style?: string }>({});
  const { data: artists, isLoading } = useListArtists(filters);

  const hasActiveFilters = !!(filters.search || filters.country || filters.style);

  const countries = useMemo(
    () => [...new Set((artists ?? []).map((a) => a.country))].sort(),
    [artists]
  );
  const styles = useMemo(
    () => [...new Set((artists ?? []).map((a) => a.style))].sort(),
    [artists]
  );

  const featured = useMemo(() => {
    if (!artists) return [];
    return [...artists].sort((a, b) => b.artworkCount - a.artworkCount).slice(0, 5);
  }, [artists]);

  return (
    <div className="bg-background min-h-screen text-foreground pt-28 pb-24">
      <div className="container mx-auto max-w-7xl px-6 md:px-12">
        <header className="mb-14 text-center">
          <h1 className="text-5xl md:text-7xl font-display text-primary mb-6">The Masters</h1>
          <div className="w-24 h-[1px] bg-secondary mx-auto mb-8" />
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto italic font-serif">
            The hands that shape our heritage. Meet the visionaries translating generations of
            history onto canvas.
          </p>
        </header>

        <div className="mb-10 max-w-4xl mx-auto space-y-5">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={18}
            />
            <Input
              placeholder="Search artists by name or origin…"
              value={filters.search || ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-12 py-5 text-base bg-card border-border rounded-none focus-visible:ring-secondary font-serif"
            />
          </div>
          <div className="flex flex-wrap gap-4 justify-center items-center">
            <FilterSelect
              value={filters.country}
              onChange={(v) => setFilters((f) => ({ ...f, country: v }))}
              options={countries}
              placeholder="Country of Origin"
            />
            <FilterSelect
              value={filters.style}
              onChange={(v) => setFilters((f) => ({ ...f, style: v }))}
              options={styles}
              placeholder="Style"
            />
            {hasActiveFilters && (
              <button
                onClick={() => setFilters({})}
                className="text-sm uppercase tracking-widest text-secondary hover:text-primary transition-colors border-b border-current pb-0.5"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-40">
          <Loader2 className="animate-spin text-primary w-12 h-12" />
        </div>
      ) : artists?.length === 0 ? (
        <div className="container mx-auto max-w-7xl px-6 md:px-12">
          <div className="text-center py-32 border border-border bg-card">
            <p className="text-xl text-muted-foreground font-display">
              No artists found matching your criteria.
            </p>
            <button
              onClick={() => setFilters({})}
              className="mt-6 text-secondary hover:text-primary transition-colors border-b border-current pb-1 uppercase tracking-widest text-sm"
            >
              Clear Search
            </button>
          </div>
        </div>
      ) : (
        <>
          {!hasActiveFilters && featured.length > 0 && (
            <FeaturedArtistCarousel artists={featured} />
          )}

          <div className="container mx-auto max-w-7xl px-6 md:px-12 mt-2">
            {hasActiveFilters && (
              <p className="text-sm text-muted-foreground uppercase tracking-widest mb-10">
                {artists?.length} {artists?.length === 1 ? "artist" : "artists"} found
              </p>
            )}
            <div className="divide-y divide-border border-t border-b border-border">
              {artists?.map((artist, idx) => (
                <ArtistTileRow key={artist.id} artist={artist} index={idx} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FeaturedArtistCarousel({ artists }: { artists: Artist[] }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (next: number, dir: number) => {
    setDirection(dir);
    setCurrent(next);
  };

  const prev = () => go((current - 1 + artists.length) % artists.length, -1);
  const next = () => go((current + 1) % artists.length, 1);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDirection(1);
      setCurrent((c) => (c + 1) % artists.length);
    }, 5500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, artists.length]);

  const artist = artists[current];
  if (!artist) return null;

  const firstSentence = artist.shortBio
    ? (artist.shortBio.split(/[.!?]/)[0]?.trim() ?? "") + "."
    : "";

  return (
    <div className="relative w-full h-[68vh] min-h-[460px] max-h-[680px] overflow-hidden group">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={artist.id}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ opacity: 0, x: dir * 60 }),
            center: { opacity: 1, x: 0 },
            exit: (dir: number) => ({ opacity: 0, x: dir * -60 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <Link href={`/artists/${artist.id}`} className="block w-full h-full">
            <img
              src={artist.photoUrl}
              alt={artist.name}
              className="w-full h-full object-cover object-top grayscale-[15%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/55 to-transparent" />
            <div className="absolute inset-0 flex items-end pb-14 px-10 md:px-20">
              <div className="max-w-lg">
                <span className="text-xs uppercase tracking-widest text-secondary mb-4 block font-display">
                  Featured Artist · {artist.country}
                </span>
                <h2 className="text-5xl md:text-6xl font-display text-primary mb-5 leading-none">
                  {artist.name}
                </h2>
                {firstSentence && (
                  <p className="text-base md:text-lg text-foreground/70 italic font-serif mb-7 leading-relaxed">
                    &ldquo;{firstSentence}&rdquo;
                  </p>
                )}
                <span className="inline-flex items-center gap-2 text-sm uppercase tracking-widest text-secondary border-b border-secondary pb-0.5">
                  Explore Artist <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </Link>
        </motion.div>
      </AnimatePresence>

      <button
        onClick={(e) => {
          e.preventDefault();
          prev();
        }}
        className="absolute left-5 top-1/2 -translate-y-1/2 w-11 h-11 bg-background/80 border border-border flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card hover:border-secondary z-10"
        aria-label="Previous artist"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        onClick={(e) => {
          e.preventDefault();
          next();
        }}
        className="absolute right-5 top-1/2 -translate-y-1/2 w-11 h-11 bg-background/80 border border-border flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card hover:border-secondary z-10"
        aria-label="Next artist"
      >
        <ChevronRight size={20} />
      </button>

      <div className="absolute bottom-5 right-7 flex items-center gap-2 z-10">
        {artists.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.preventDefault();
              go(i, i > current ? 1 : -1);
            }}
            className={`transition-all duration-300 rounded-full ${
              i === current
                ? "w-7 h-1.5 bg-secondary"
                : "w-1.5 h-1.5 bg-foreground/30 hover:bg-foreground/60"
            }`}
            aria-label={`Go to artist ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function ArtistTileRow({ artist, index }: { artist: Artist; index: number }) {
  const [inView, setInView] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) setInView(true); },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { data: detail } = useGetArtist(artist.id, {
    query: { enabled: inView, queryKey: getGetArtistQueryKey(artist.id) },
  });

  const { data: portfolio } = useGetArtistPortfolio(artist.id, {
    query: { enabled: inView && artist.artworkCount === 0, queryKey: getGetArtistPortfolioQueryKey(artist.id) },
  });

  const artworks = detail?.artworks?.slice(0, 2) ?? [];
  const isEven = index % 2 === 0;

  const shortBioExcerpt = artist.shortBio
    ? artist.shortBio.length > 180
      ? artist.shortBio.slice(0, 180).trimEnd() + "…"
      : artist.shortBio
    : null;

  const sayingTruncated = artist.saying
    ? artist.saying.length > 120
      ? artist.saying.slice(0, 120).trimEnd() + "…"
      : artist.saying
    : null;

  return (
    <motion.div
      ref={rowRef}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col ${isEven ? "md:flex-row" : "md:flex-row-reverse"} items-stretch`}
    >
      {/* ── Info column ── */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 md:px-12 md:py-14 gap-5">
        <span className="text-xs uppercase tracking-widest text-secondary font-display">
          {artist.country}{artist.style ? ` · ${artist.style}` : ""}
        </span>

        <h2 className="text-3xl md:text-4xl font-display text-primary leading-tight">
          {artist.name}
        </h2>

        {sayingTruncated && (
          <blockquote className="border-l-2 border-secondary/50 pl-4">
            <p className="text-sm italic text-foreground/70 font-serif leading-relaxed">
              &ldquo;{sayingTruncated}&rdquo;
            </p>
            {artist.sayingAuthor && (
              <footer className="text-[11px] text-secondary mt-1.5 uppercase tracking-widest">
                — {artist.sayingAuthor}
              </footer>
            )}
          </blockquote>
        )}

        {shortBioExcerpt && (
          <p className="text-sm text-foreground/60 font-serif leading-relaxed">
            {shortBioExcerpt}
          </p>
        )}

        <div className="flex items-center gap-4 flex-wrap mt-1">
          {artist.artworkCount > 0 && (
            <span className="text-[11px] uppercase tracking-widest border border-border px-3 py-1 text-foreground/50">
              {artist.artworkCount} {artist.artworkCount === 1 ? "Work" : "Works"}
            </span>
          )}
          {artist.style && (
            <span className="text-[11px] uppercase tracking-widest border border-secondary/30 text-secondary px-3 py-1">
              {artist.style}
            </span>
          )}
        </div>

        <Link
          href={`/artists/${artist.id}`}
          className="group/link inline-flex items-center gap-2 text-sm uppercase tracking-widest text-foreground/70 hover:text-secondary transition-colors border-b border-border hover:border-secondary pb-1 self-start mt-1"
        >
          Explore Artist
          <ArrowRight size={14} className="group-hover/link:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* ── Photo column (small) ── */}
      <div className="md:w-[30%] flex-shrink-0 flex flex-col gap-1 p-1">
        <Link href={`/artists/${artist.id}`} className="block overflow-hidden group/photo relative">
          <div className="aspect-[3/4] relative">
            <img
              src={artist.photoUrl}
              alt={artist.name}
              className="w-full h-full object-cover object-top grayscale-[20%] group-hover/photo:grayscale-0 transition-all duration-700 group-hover/photo:scale-[1.02]"
            />
            {/* Permanent gradient info overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent flex flex-col justify-end p-3">
              <div className="space-y-2">
                {sayingTruncated && (
                  <div>
                    <p className="text-[10px] italic text-foreground/80 font-serif line-clamp-2 leading-snug">
                      &ldquo;{sayingTruncated}&rdquo;
                    </p>
                    {artist.sayingAuthor && (
                      <p className="text-[9px] text-secondary mt-0.5 uppercase tracking-widest">
                        — {artist.sayingAuthor}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {artist.artworkCount > 0 && (
                    <span className="text-[9px] uppercase tracking-widest bg-primary/80 text-primary-foreground px-1.5 py-0.5">
                      {artist.artworkCount} {artist.artworkCount === 1 ? "work" : "works"}
                    </span>
                  )}
                  {artist.style && (
                    <span className="text-[9px] uppercase tracking-widest border border-secondary/60 text-secondary px-1.5 py-0.5">
                      {artist.style}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Link>

        {artworks.length > 0 ? (
          <div className={`grid gap-1 ${artworks.length >= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {artworks.map((aw) => (
              <Link key={aw.id} href={`/artists/${artist.id}`} className="block overflow-hidden group/thumb">
                <div className="aspect-[4/3] relative">
                  <img
                    src={aw.thumbnailUrl ?? aw.imageUrl}
                    alt={aw.title}
                    className="w-full h-full object-cover grayscale-[20%] group-hover/thumb:grayscale-0 transition-all duration-500 group-hover/thumb:scale-[1.04]"
                  />
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                    <p className="text-xs font-display text-primary truncate">{aw.title}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : portfolio?.imageUrls?.[0] ? (
          <Link href={`/artists/${artist.id}`} className="block overflow-hidden group/thumb">
            <div className="aspect-[4/3] relative">
              <img
                src={portfolio.imageUrls[0]}
                alt={`Portfolio by ${artist.name}`}
                className="w-full h-full object-cover grayscale-[20%] group-hover/thumb:grayscale-0 transition-all duration-500 group-hover/thumb:scale-[1.04]"
              />
              <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[10px] uppercase tracking-widest px-2 py-1 font-display">
                Not on Sale
              </div>
            </div>
          </Link>
        ) : null}
      </div>
    </motion.div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value?: string;
  onChange: (v?: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="bg-card border border-border py-2.5 px-5 text-sm uppercase tracking-widest text-foreground/80 focus:outline-none focus:ring-1 focus:ring-secondary appearance-none cursor-pointer hover:border-secondary transition-colors"
    >
      <option value="">{placeholder} — All</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
