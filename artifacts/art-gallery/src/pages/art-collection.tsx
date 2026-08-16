import { useListArtworks, useGetArtworkFilters, useSearchArtworks } from "@workspace/api-client-react";
import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Loader2, Filter, X, Search, Sparkles, ChevronDown } from "lucide-react";
import type { Artwork } from "@workspace/api-client-react";

/**
 * Filter state.
 *
 * Category, style and size are lookup ids now rather than free-text names —
 * which is what makes the category filter work at all. It used to send
 * `artType=Handicraft` against a column that no longer holds that value.
 */
type Filters = {
  nationality?: string;
  artCategoryId?: number;
  artStyleId?: number;
  sizeId?: number;
};

export default function ArtCollection() {
  const [filters, setFilters] = useState<Filters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [location] = useLocation();

  const { data: artworks, isLoading } = useListArtworks(filters);
  const { data: filterOptions } = useGetArtworkFilters();
  const searchMutation = useSearchArtworks();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const q = params.get("search");
    if (q) {
      setSearchQuery(q);
      setActiveQuery(q);
      searchMutation.mutate({ data: { query: q } });
    }

    // Deep links such as /art?artCategory=Paintings (used by the "Explore all"
    // links below) need to arrive with the filter already applied. Names are
    // resolved to ids once the lookup lists have loaded.
    const category = params.get("artCategory");
    const style = params.get("artStyle") ?? params.get("artType");
    if (category || style) setPendingUrlFilter({ category, style });
  }, []);

  const [pendingUrlFilter, setPendingUrlFilter] =
    useState<{ category: string | null; style: string | null } | null>(null);

  useEffect(() => {
    if (!pendingUrlFilter || !filterOptions) return;
    const byName = (list: { id: number; name: string }[], name: string | null) =>
      name ? list.find((o) => o.name.toLowerCase() === name.toLowerCase())?.id : undefined;

    setFilters((f) => ({
      ...f,
      artCategoryId: byName(filterOptions.categories, pendingUrlFilter.category) ?? f.artCategoryId,
      artStyleId: byName(filterOptions.styles, pendingUrlFilter.style) ?? f.artStyleId,
    }));
    setPendingUrlFilter(null);
  }, [pendingUrlFilter, filterOptions]);

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const isAiSearchMode = !!activeQuery;

  const needle = searchQuery.trim().toLowerCase();
  const instantResults = useMemo<Artwork[]>(() => {
    if (!needle || !artworks) return [];
    return artworks.filter((art) =>
      art.title.toLowerCase().includes(needle) ||
      (art.artistName ?? "").toLowerCase().includes(needle) ||
      (art.theme ?? "").toLowerCase().includes(needle) ||
      (art.artStyle ?? "").toLowerCase().includes(needle) ||
      (art.artCategory ?? "").toLowerCase().includes(needle)
    );
  }, [needle, artworks]);

  const isSearchMode = isAiSearchMode || needle.length > 0;

  const groups = useMemo<[string, Artwork[]][]>(() => {
    if (!artworks || artworks.length === 0) return [];
    const map = new Map<string, Artwork[]>();
    for (const art of artworks) {
      // Group by category — the curated axis. Style is the finer filter.
      const group = art.artCategory?.trim() || "Other";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(art);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 6);
  }, [artworks]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setActiveQuery(searchQuery.trim());
    searchMutation.mutate({ data: { query: searchQuery.trim() } });
  };

  const clearSearch = () => {
    setActiveQuery("");
    setSearchQuery("");
    searchMutation.reset();
  };

  return (
    <div className="bg-background min-h-screen text-foreground pt-28 pb-24">
      <div className="container mx-auto max-w-7xl px-6 md:px-12">

        {/* ── Header ── */}
        <header className="mb-10 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-[0.3em] text-secondary mb-3"
          >
            Curated Works
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-6xl font-display text-primary mb-6"
          >
            The Collection
          </motion.h1>
          <div className="w-24 h-[1px] bg-secondary mx-auto mb-8" />
          <p className="text-base text-foreground/60 max-w-2xl mx-auto italic">
            Each piece is a portal. Unhurried, immerse yourself in the legacy of a nation.
          </p>
        </header>

        {/* ── AI Search Bar ── */}
        <div className="mb-12 max-w-2xl mx-auto">
          <form onSubmit={handleSearch} className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-secondary" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-secondary">AI-Powered Search</span>
            </div>
            <div className="relative flex">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for art by feeling, theme, or style…"
                className="flex-1 pl-11 pr-4 py-4 bg-card border border-border text-sm text-foreground placeholder:text-foreground/35 focus:outline-none focus:border-secondary transition-colors font-serif"
              />
              <button
                type="submit"
                disabled={searchMutation.isPending}
                className="px-6 bg-primary text-primary-foreground text-[10px] uppercase tracking-[0.2em] font-display hover:bg-secondary transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {searchMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Search"}
              </button>
            </div>
          </form>

          {/* Active search indicator */}
          <AnimatePresence>
            {isSearchMode && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center justify-between mt-3 px-1"
              >
                <p className="text-xs text-foreground/50 italic">
                  {isAiSearchMode && searchMutation.isPending
                    ? "Claude is reading the collection…"
                    : isAiSearchMode && searchMutation.data && searchMutation.data.length > 0
                    ? `${searchMutation.data.length} ${searchMutation.data.length === 1 ? "work" : "works"} found for "${activeQuery}"`
                    : `${instantResults.length} ${instantResults.length === 1 ? "work" : "works"} matching "${searchQuery.trim()}"`}
                </p>
                <button
                  onClick={clearSearch}
                  className="text-xs uppercase tracking-widest text-secondary hover:text-primary transition-colors flex items-center gap-1"
                >
                  <X size={11} /> Clear search
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col lg:flex-row gap-14">

          {/* ── Filter Sidebar — hidden in search mode ── */}
          <AnimatePresence>
            {!isSearchMode && (
              <motion.aside
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="lg:w-56 flex-shrink-0"
              >
                <div className="sticky top-28">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-primary">
                      <Filter size={16} />
                      <span className="font-display text-base uppercase tracking-widest">Refine</span>
                    </div>
                    {hasActiveFilters && (
                      <button
                        onClick={() => setFilters({})}
                        className="text-xs text-secondary hover:text-primary transition-colors uppercase tracking-widest flex items-center gap-1"
                      >
                        <X size={12} /> Clear
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {filterOptions && (
                      <>
                        <CollapsibleFilterSection title="Category">
                          <LookupFilterGroup
                            options={filterOptions.categories}
                            selected={filters.artCategoryId}
                            onChange={(v) => setFilters((f) => ({ ...f, artCategoryId: v }))}
                          />
                        </CollapsibleFilterSection>
                        <CollapsibleFilterSection title="Style">
                          <LookupFilterGroup
                            options={filterOptions.styles}
                            selected={filters.artStyleId}
                            onChange={(v) => setFilters((f) => ({ ...f, artStyleId: v }))}
                          />
                        </CollapsibleFilterSection>
                        <CollapsibleFilterSection title="Origin">
                          <FilterGroup
                            options={filterOptions.nationalities}
                            selected={filters.nationality}
                            onChange={(v) => setFilters((f) => ({ ...f, nationality: v }))}
                          />
                        </CollapsibleFilterSection>
                        <CollapsibleFilterSection title="Scale" last>
                          <LookupFilterGroup
                            options={filterOptions.sizes}
                            selected={filters.sizeId}
                            onChange={(v) => setFilters((f) => ({ ...f, sizeId: v }))}
                          />
                        </CollapsibleFilterSection>
                      </>
                    )}
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* ── Main content ── */}
          <main className="flex-1 min-w-0">

            {/* Search results: flat grid */}
            {isSearchMode ? (
              isAiSearchMode && searchMutation.isPending ? (
                <div className="flex flex-col items-center gap-4 py-32">
                  <Loader2 className="animate-spin text-primary w-10 h-10" />
                  <p className="text-sm text-foreground/40 italic">Claude is reading the collection…</p>
                </div>
              ) : (() => {
                  // Decide which results to show: AI results if any, otherwise instant results
                  const aiResults = isAiSearchMode && searchMutation.data ? searchMutation.data : null;
                  const displayResults = (aiResults && aiResults.length > 0) ? aiResults : instantResults;
                  if (displayResults.length > 0) {
                    return (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                          {displayResults.map((art, i) => (
                            <motion.div key={art.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.4 }}>
                              <SearchResultCard artwork={art} />
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    );
                  }
                  return (
                    <div className="text-center py-32 border border-border bg-card">
                      <p className="text-xl text-foreground/50 font-display mb-3">No works found for "{searchQuery.trim()}"</p>
                      <p className="text-sm text-foreground/40 italic mb-6">
                        Try a different word — "mountain", "portrait", "landscape", or an artist name
                      </p>
                      <button onClick={clearSearch} className="text-secondary hover:text-primary transition-colors border-b border-current pb-1 uppercase tracking-widest text-xs">
                        Browse the full collection
                      </button>
                    </div>
                  );
                })()
            ) : (
              /* Mosaic groups */
              isLoading ? (
                <div className="flex justify-center py-32">
                  <Loader2 className="animate-spin text-primary w-12 h-12" />
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-32 border border-border bg-card">
                  <p className="text-xl text-foreground/50 font-display">
                    No works found matching your refinement.
                  </p>
                  <button
                    onClick={() => setFilters({})}
                    className="mt-6 text-secondary hover:text-primary transition-colors border-b border-current pb-1 uppercase tracking-widest text-sm"
                  >
                    Clear Refinements
                  </button>
                </div>
              ) : (
                <div className="space-y-28">
                  {groups.map(([category, works], idx) => (
                    <MosaicGroup
                      key={category}
                      category={category}
                      artworks={works}
                      index={idx}
                    />
                  ))}
                </div>
              )
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   Mosaic Group Component
   Row 1: Large (2/3) + Two stacked (1/3)
   Row 2: Four equal thumbnails
════════════════════════════════════════ */
function MosaicGroup({
  category,
  artworks,
  index,
}: {
  category: string;
  artworks: Artwork[];
  index: number;
}) {
  const hero = artworks[0];
  const stacked = artworks.slice(1, 3);
  const strip = artworks.slice(3, 7);
  const rest = artworks.slice(7);
  const [showRest, setShowRest] = useState(false);

  return (
    <motion.section
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.85, delay: index * 0.04 }}
    >
      {/* Group heading */}
      <div className="flex items-baseline gap-6 mb-6 border-b border-border pb-4">
        <h2 className="font-display text-2xl md:text-3xl text-primary">{category}</h2>
        <span className="text-xs uppercase tracking-widest text-secondary">
          {artworks.length} {artworks.length === 1 ? "work" : "works"}
        </span>
        <div className="flex-1 h-[1px] bg-border hidden sm:block" />
        <Link
          href={`/art?artCategory=${encodeURIComponent(category)}`}
          className="text-xs uppercase tracking-widest text-foreground/50 hover:text-primary transition-colors hidden sm:block"
        >
          View all →
        </Link>
      </div>

      {/* Row 1: Large left (2/3) + two stacked right (1/3) */}
      <div className="flex gap-2 mb-2" style={{ height: "440px" }}>
        {/* Large hero */}
        <Link href={`/art/${hero.id}`} className="block group overflow-hidden bg-card border border-border flex-shrink-0 relative" style={{ width: "66.67%" }}>
          <img
            src={hero.imageUrl}
            alt={hero.title}
            className="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 border border-border/60">
            <span className="text-[10px] uppercase tracking-[0.25em] text-secondary">{category}</span>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-5 md:p-7">
            <p className="text-[10px] uppercase tracking-[0.2em] text-secondary/80 mb-1">
              {hero.theme} · {hero.year}
            </p>
            <h3 className="font-display text-xl md:text-2xl text-white leading-tight mb-1">{hero.title}</h3>
            <p className="text-white/55 text-sm italic">by {hero.artistName}</p>
            <div className="mt-3 inline-flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <span className="text-xs uppercase tracking-widest text-secondary">Explore</span>
              <div className="w-6 h-px bg-secondary" />
            </div>
          </div>
        </Link>

        {/* Two stacked on the right */}
        <div className="flex flex-col gap-2 flex-1">
          {stacked.length > 0 ? (
            stacked.map((art) => (
              <Link
                key={art.id}
                href={`/art/${art.id}`}
                className="block group overflow-hidden bg-card border border-border relative flex-1"
              >
                <img
                  src={art.imageUrl}
                  alt={art.title}
                  className="w-full h-full object-cover grayscale-[15%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-70 group-hover:opacity-90 transition-opacity" />
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <h4 className="font-display text-sm text-white leading-tight line-clamp-1">{art.title}</h4>
                  <p className="text-white/50 text-[11px] italic line-clamp-1">by {art.artistName}</p>
                </div>
              </Link>
            ))
          ) : (
            <div className="flex-1 bg-card border border-border/30" />
          )}
          {stacked.length === 1 && <div className="flex-1 bg-card border border-border/30" />}
        </div>
      </div>

      {/* Row 2: Four equal strip */}
      {strip.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          {strip.map((art) => (
            <Link key={art.id} href={`/art/${art.id}`} className="block group overflow-hidden bg-card border border-border relative h-[140px] md:h-[160px]">
              <img
                src={art.imageUrl}
                alt={art.title}
                className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-600 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />
              <div className="absolute bottom-0 inset-x-0 p-2.5">
                <h4 className="font-display text-xs text-white leading-tight line-clamp-2">{art.title}</h4>
                <p className="text-white/45 text-[10px] mt-0.5 italic line-clamp-1">{art.artistName}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Additional artworks (show more) */}
      {rest.length > 0 && showRest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          {rest.map((art) => (
            <Link key={art.id} href={`/art/${art.id}`} className="block group overflow-hidden bg-card border border-border relative h-[140px] md:h-[160px]">
              <img
                src={art.imageUrl}
                alt={art.title}
                className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-600 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />
              <div className="absolute bottom-0 inset-x-0 p-2.5">
                <h4 className="font-display text-xs text-white line-clamp-2">{art.title}</h4>
                <p className="text-white/45 text-[10px] mt-0.5 italic line-clamp-1">{art.artistName}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => setShowRest((v) => !v)}
            className="inline-flex items-center gap-4 border border-border px-8 py-3 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300 group"
          >
            {showRest ? (
              <span>Show Less</span>
            ) : (
              <>
                <span>Show More</span>
                <span className="text-secondary group-hover:text-primary-foreground transition-colors">+{rest.length}</span>
              </>
            )}
            <div className="w-4 h-px bg-current" />
          </button>
        </div>
      )}
    </motion.section>
  );
}

/* ════════════════════════════════════════
   Search Result Card
════════════════════════════════════════ */
function SearchResultCard({ artwork }: { artwork: Artwork }) {
  return (
    <Link href={`/art/${artwork.id}`} className="block group">
      <div className="aspect-[3/4] overflow-hidden bg-card border border-border relative">
        <img
          src={artwork.imageUrl}
          alt={artwork.title}
          className="w-full h-full object-cover grayscale-[15%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="absolute bottom-0 inset-x-0 p-3 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-400">
          <p className="text-[10px] uppercase tracking-widest text-secondary truncate">{artwork.artStyle ?? artwork.artCategory}</p>
        </div>
      </div>
      <div className="mt-2.5 px-0.5">
        <h4 className="text-xs font-display text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {artwork.title}
        </h4>
        <p className="text-[11px] text-foreground/50 mt-0.5 italic line-clamp-1">{artwork.artistName}</p>
        <p className="text-[10px] text-secondary mt-0.5 uppercase tracking-wide line-clamp-1">{artwork.theme}</p>
      </div>
    </Link>
  );
}

/* ════════════════════════════════════════
   Collapsible Filter Section
════════════════════════════════════════ */
/**
 * Each filter group starts collapsed and expands on click, so the sidebar
 * reads as a short list of headings rather than a wall of options up front.
 */
function CollapsibleFilterSection({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`py-4 ${last ? "" : "border-b border-border"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left group"
      >
        <h3 className="text-xs uppercase tracking-widest text-foreground/50 group-hover:text-foreground/80 transition-colors">
          {title}
        </h3>
        <ChevronDown
          size={14}
          className={`text-foreground/40 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════
   Filter Sidebar Group
════════════════════════════════════════ */
/**
 * Filter by lookup id, showing how many public artworks each option has.
 *
 * An option with a count of zero is disabled rather than hidden, so the visitor
 * can see the gallery has no Photography yet instead of wondering why the
 * category is missing. Previously the sidebar was built from DISTINCT on a
 * free-text column, so it offered values like "waterpaint" as if they were
 * curated categories — and the real categories matched nothing.
 */
function LookupFilterGroup({
  options,
  selected,
  onChange,
}: {
  options: { id: number; name: string; count: number }[];
  selected?: number;
  onChange: (v?: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => onChange(undefined)}
        className={`block text-left w-full text-sm transition-colors ${
          selected == null ? "text-primary font-medium" : "text-foreground/60 hover:text-foreground"
        }`}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.id}
          disabled={opt.count === 0}
          onClick={() => onChange(selected === opt.id ? undefined : opt.id)}
          className={`flex items-baseline justify-between gap-2 text-left w-full text-sm transition-colors ${
            selected === opt.id
              ? "text-primary font-medium"
              : opt.count === 0
                ? "text-foreground/25 cursor-not-allowed"
                : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <span>{opt.name}</span>
          <span className="text-[10px] text-foreground/30 tabular-nums">{opt.count}</span>
        </button>
      ))}
    </div>
  );
}

function FilterGroup({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected?: string;
  onChange: (v?: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => onChange(undefined)}
        className={`block text-left w-full text-sm transition-colors ${
          !selected ? "text-primary font-medium" : "text-foreground/60 hover:text-foreground"
        }`}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(selected === opt ? undefined : opt)}
          className={`block text-left w-full text-sm transition-colors ${
            selected === opt
              ? "text-primary font-medium"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
