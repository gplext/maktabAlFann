import { useListArtists, useGetArtist, useGetArtistPortfolio, getGetArtistQueryKey, getGetArtistPortfolioQueryKey } from "@workspace/api-client-react";
import type { Artist } from "@workspace/api-client-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Loader2, Search, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePageMeta, SITE_NAME } from "@/lib/seo";
import { ArtistImage } from "@/components/artist-image";
import { useCarousel } from "@/lib/carousel";

/** Artists placed at a fixed position in the full list (1 = first). */
const PINNED: { name: string; position: number }[] = [
  { name: "Saad Gul", position: 4 },
];

export default function Artists() {
  usePageMeta({ title: `Pakistani Artists — Painters & Sculptors | ${SITE_NAME}`, description: "Meet the Pakistani artists of Maktaba Al-Fann: their stories, styles, influences and original works available to buy online." });
  // Masters are shown by default; "All" clears the level.
  const DEFAULT_FILTERS: ArtistFilters = { level: "master" };
  const [filters, setFilters] = useState<ArtistFilters>(DEFAULT_FILTERS);
  const { data: artists, isLoading } = useListArtists(filters);
  const { data: allArtists } = useListArtists({});
  const { data: facets } = useArtistFilters(filters);

  const hasActiveFilters = !!(filters.search || filters.style || filters.level !== "master");
  const showCarousel = !filters.search && !filters.style;

  // 10 artists per page; back to page 1 whenever the filters change.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filters.search, filters.style, filters.level]);
  const listTopRef = useRef<HTMLDivElement>(null);
  const goToPage = (n: number) => {
    setPage(n);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // The full list keeps its usual order, except pinned artists sit at their set position.
  const ordered = useMemo(() => {
    if (!artists || filters.search || filters.style) return artists;
    const list = [...artists];
    for (const pin of PINNED) {
      const from = list.findIndex((a) => a.name.trim().toLowerCase() === pin.name.toLowerCase());
      if (from < 0) continue;
      const [a] = list.splice(from, 1);
      list.splice(Math.min(pin.position - 1, list.length), 0, a!);
    }
    return list;
  }, [artists, filters.search, filters.style]);

  const totalPages = Math.max(1, Math.ceil((ordered?.length ?? 0) / PAGE_SIZE));
  const pageItems = ordered?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Page numbers: all when there are few, otherwise first, last and the pages around the current one.
  const pageList = useMemo(() => {
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const set = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
    const sorted = [...set].sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1]! > 1) out.push("…"); out.push(n); });
    return out;
  }, [totalPages, page]);

  // Every style that has public paintings, with how many paintings it holds (same counts as the Artworks page).
  const styleOptions = useMemo(() => {
    const list = (facets?.styles ?? []).map((s) => ({ value: s.name, label: `${s.name} (${s.count})` }));
    if (filters.style && !list.some((o) => o.value === filters.style)) list.unshift({ value: filters.style, label: `${filters.style} (0)` });
    return list;
  }, [facets, filters.style]);

  // Which artists and in what order come from Admin → Carousels ("artists-featured").
  const { data: carousel } = useCarousel("artists-featured");
  // Each slide shows one of the artist's landscape paintings, picked by the server; no carousel without them.
  const featured = useMemo<FeaturedSlide[]>(() => {
    if (!allArtists || !carousel) return [];
    const byId = new Map(allArtists.map((a) => [a.id, a]));
    return carousel.items
      .map((i) => ({ artist: byId.get(i.id), imageUrl: i.slideUrl ?? i.imageUrl }))
      .filter((s): s is FeaturedSlide => !!s.artist && !!s.imageUrl);
  }, [allArtists, carousel]);

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
              placeholder="Search artists by name…"
              value={filters.search || ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-12 py-5 text-base bg-card border-border rounded-none focus-visible:ring-secondary font-serif placeholder:text-foreground/40"
            />
          </div>
          <div className="flex flex-wrap gap-2 justify-center items-center">
            {[
              ...(facets?.levels ?? []),
              ...(facets ? [{ value: undefined, label: "All", count: facets.levels.reduce((n, l) => n + l.count, 0) }] : []),
            ].map((l) => {
              const active = filters.level === l.value;
              return (
                <button
                  key={l.value ?? "all"}
                  onClick={() => setFilters((f) => ({ ...f, level: l.value }))}
                  aria-pressed={active}
                  className={`px-5 py-2 text-sm uppercase tracking-widest border transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground/80 hover:border-secondary"
                  }`}
                >
                  {l.label} <span className={active ? "opacity-80" : "text-foreground/50"}>({l.count})</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 justify-center items-center">
            <FilterSelect
              value={filters.style}
              onChange={(v) => setFilters((f) => ({ ...f, style: v }))}
              options={styleOptions}
              placeholder="Style"
            />
            {hasActiveFilters && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
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
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-6 text-secondary hover:text-primary transition-colors border-b border-current pb-1 uppercase tracking-widest text-sm"
            >
              Clear Search
            </button>
          </div>
        </div>
      ) : (
        <>
          {showCarousel && featured.length > 0 && (
            <FeaturedArtistCarousel slides={featured} />
          )}

          <div ref={listTopRef} className="container mx-auto max-w-7xl px-6 md:px-12 mt-2 scroll-mt-28">
            {hasActiveFilters && (
              <p className="text-sm text-foreground/60 uppercase tracking-widest mb-10">
                {artists?.length} {artists?.length === 1 ? "artist" : "artists"} found
              </p>
            )}
            <div className="divide-y divide-border border-t border-b border-border">
              {pageItems?.map((artist, idx) => (
                <ArtistTileRow key={artist.id} artist={artist} index={idx} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav aria-label="Pages" className="mt-16 flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => goToPage(page - 1)} disabled={page === 1} aria-label="Previous page"
                  className="h-11 w-11 border border-border flex items-center justify-center hover:border-primary hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors">
                  <ChevronLeft size={18} />
                </button>
                {pageList.map((n, i) =>
                  n === "…" ? (
                    <span key={`gap${i}`} className="h-11 w-8 flex items-center justify-center text-foreground/40">…</span>
                  ) : (
                    <button key={n} onClick={() => goToPage(n)} aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined}
                      className={`h-11 min-w-11 px-3 border text-sm font-display transition-colors ${
                        n === page
                          ? "border-primary bg-primary text-primary-foreground pointer-events-none"
                          : "border-border text-foreground/70 hover:border-primary hover:text-primary"}`}>
                      {n}
                    </button>
                  ),
                )}
                <button onClick={() => goToPage(page + 1)} disabled={page === totalPages} aria-label="Next page"
                  className="h-11 w-11 border border-border flex items-center justify-center hover:border-primary hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors">
                  <ChevronRight size={18} />
                </button>
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type FeaturedSlide = { artist: Artist; imageUrl: string };

/** The first sentence of a bio, without cutting at "b. 1988", initials like "R. M." or inside brackets. */
function firstSentence(text: string): string {
  const t = text.trim();
  const end = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = end.exec(t))) {
    const head = t.slice(0, m.index + 1);
    const openBrackets = (head.match(/\(/g)?.length ?? 0) - (head.match(/\)/g)?.length ?? 0);
    if (openBrackets > 0) continue;
    if (/(?:^|[\s(])(?:b|d|c|ca|St|Dr|Mr|Mrs|Ms|Jr|Sr|No|[A-Z])\.$/.test(head)) continue;
    return head;
  }
  return t;
}

function FeaturedArtistCarousel({ slides }: { slides: FeaturedSlide[] }) {
  const artists = slides.map((s) => s.artist);
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
    }, 3500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, artists.length]);

  // Load every slide picture up front so each change is instant.
  useEffect(() => {
    for (const s of slides) { const img = new Image(); img.src = s.imageUrl; }
  }, [slides]);

  const artist = artists[current];
  if (!artist) return null;

  const slideImage = slides[current]!.imageUrl;
  const quote = artist.shortBio ? firstSentence(artist.shortBio) : "";

  return (
    <div className="relative w-full h-[calc(100svh-4.5rem)] min-h-[460px] overflow-hidden group">
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
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <Link href={`/artists/${artist.id}`} className="block w-full h-full">
            <img src={slideImage} alt={`Painting by ${artist.name}`} loading="eager"
              className="w-full h-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/55 to-transparent" />
            <div className="absolute inset-0 flex items-end pb-14 px-10 md:px-20">
              <div className="max-w-lg">
                <span className="text-xs uppercase tracking-widest text-secondary mb-4 block font-display">
                  Featured Artist · {artist.country}
                </span>
                <h2 className="text-5xl md:text-6xl font-display text-primary mb-5 leading-none">
                  {artist.name}
                </h2>
                {quote && (
                  <p className="text-base md:text-lg text-foreground/70 italic font-serif mb-7 leading-relaxed line-clamp-3">
                    &ldquo;{quote}&rdquo;
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
        className="absolute left-5 top-1/2 -translate-y-1/2 w-12 h-12 md:w-14 md:h-14 bg-background/85 border border-border shadow-md flex items-center justify-center text-foreground hover:bg-card hover:border-secondary hover:text-primary transition-colors z-10"
        aria-label="Previous artist"
      >
        <ChevronLeft className="w-6 h-6 md:w-7 md:h-7" />
      </button>
      <button
        onClick={(e) => {
          e.preventDefault();
          next();
        }}
        className="absolute right-5 top-1/2 -translate-y-1/2 w-12 h-12 md:w-14 md:h-14 bg-background/85 border border-border shadow-md flex items-center justify-center text-foreground hover:bg-card hover:border-secondary hover:text-primary transition-colors z-10"
        aria-label="Next artist"
      >
        <ChevronRight className="w-6 h-6 md:w-7 md:h-7" />
      </button>

      {/* Markers: close together, each with a 40 px tall click area */}
      <div className="absolute bottom-3 right-4 md:right-6 flex items-center z-10 bg-background/75 backdrop-blur-sm px-2 rounded-full">
        {artists.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.preventDefault();
              go(i, i > current ? 1 : -1);
            }}
            className="group/dot h-10 px-1 flex items-center"
            aria-label={`Show artist ${i + 1}`}
            aria-current={i === current}
          >
            <span className={`block h-1 rounded-full transition-all duration-300 ${
              i === current ? "w-10 bg-secondary" : "w-6 bg-foreground/45 group-hover/dot:bg-foreground/75"
            }`} />
          </button>
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

  // 2–3 lines about the artist: the biography when the short bio is just a line (e.g. "Pakistani artist (born 1948).").
  const shortBio = artist.shortBio?.trim() ?? "";
  const bio = detail?.biography?.trim() ?? "";
  const shortBioExcerpt = (shortBio.length >= 160 || !bio ? shortBio : bio.replace(/\s+/g, " ")) || null;

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
          <p className="text-sm text-foreground/70 font-serif leading-relaxed line-clamp-3">
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
            <ArtistImage name={artist.name} photoUrl={artist.photoUrl} coverImageUrl={artist.coverImageUrl}
              className="w-full h-full [container-type:size]"
              imgClassName="object-cover object-center grayscale-[20%] group-hover/photo:grayscale-0 transition-all duration-700 group-hover/photo:scale-[1.02]" />
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
                  <img loading="lazy" decoding="async"
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
              <img loading="lazy" decoding="async"
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
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="bg-card border border-border py-2.5 px-5 text-sm uppercase tracking-widest text-foreground/80 text-center [text-align-last:center] focus:outline-none focus:ring-1 focus:ring-secondary appearance-none cursor-pointer hover:border-secondary transition-colors"
    >
      <option value="">{placeholder} — All</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

type ArtistLevel = "master" | "emerging" | "student";
type ArtistFilters = { search?: string; style?: string; level?: ArtistLevel };
const PAGE_SIZE = 10;
type ArtistFacets = {
  styles: { name: string; count: number }[];
  levels: { value: ArtistLevel; label: string; count: number }[];
};

/** Style counts (paintings) and level counts (artists) for the current filters. */
function useArtistFilters(f: { search?: string; style?: string; level?: string }) {
  const qs = new URLSearchParams();
  if (f.search?.trim()) qs.set("search", f.search.trim());
  if (f.style) qs.set("style", f.style);
  if (f.level) qs.set("level", f.level);
  const query = qs.toString();
  return useQuery<ArtistFacets>({
    queryKey: ["/artists/filters", query],
    queryFn: async () => {
      const res = await fetch(`/api/artists/filters${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("artist filters failed");
      return res.json();
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
