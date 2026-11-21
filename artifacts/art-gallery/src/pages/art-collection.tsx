import { useListArtworks, useGetArtworkFilters } from "@workspace/api-client-react";
import { useMemo, useState, useEffect } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useSearch } from "wouter";
import { Loader2, Filter, X, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { ArtworkSearchBox, useSuggestions } from "@/components/artwork-search-box";
import type { Artwork } from "@workspace/api-client-react";
import { usePageMeta, SITE_NAME } from "@/lib/seo";
import { formatMoney } from "@/lib/money";

type Sort = "recommended" | "newest" | "price_asc" | "price_desc";
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
];

/**
 * Filter state.
 *
 * Category, style and size are lookup ids now rather than free-text names —
 * which is what makes the category filter work at all. It used to send
 * `artType=Handicraft` against a column that no longer holds that value.
 */
type Filters = {
  artCategoryId?: number;
  artStyleId?: number;
  sizeId?: number;
  baseTypeId?: number;
  paintMaterialId?: number;
};

export default function ArtCollection() {
  usePageMeta({ title: `Buy Original Pakistani Paintings Online | ${SITE_NAME}`, description: "Browse original paintings, calligraphy, drawings and sculpture by Pakistani artists. Filter by style, medium and size, and order online with delivery in Pakistan and abroad." });
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<Sort>("recommended");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [location, navigate] = useLocation();

  // 100 artworks per page. One extra is fetched only to know whether a next page exists.
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  const filtersKey = JSON.stringify(filters) + activeQuery + sort;
  useEffect(() => { setPage(1); }, [filtersKey]);
  // The search runs in the database together with the filters, page by page (best match first).
  const q = activeQuery || undefined;
  const { data: pageRows, isLoading } = useListArtworks({ ...filters, q, sort: sort === "recommended" ? undefined : sort, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
  const artworks = useMemo(() => pageRows?.slice(0, PAGE_SIZE), [pageRows]);
  const hasNextPage = (pageRows?.length ?? 0) > PAGE_SIZE;
  const goToPage = (n: number) => { setPage(n); window.scrollTo(0, 0); };
  // Counts follow the filters chosen in the other groups; the previous numbers stay on screen while new ones load.
  const { data: filterOptions } = useGetArtworkFilters({ ...filters, q }, { query: { placeholderData: keepPreviousData } });
  // Total matching works: every artwork has exactly one art type, so the art-type counts add up
  // to the total (they ignore their own selection, so with a type chosen, use that type's count).
  const totalWorks = useMemo(() => {
    const cats = filterOptions?.categories;
    if (!cats) return null;
    return filters.artCategoryId != null
      ? (cats.find((c) => c.id === filters.artCategoryId)?.count ?? null)
      : cats.reduce((n, c) => n + c.count, 0);
  }, [filterOptions, filters.artCategoryId]);
  const totalPages = totalWorks != null ? Math.max(1, Math.ceil(totalWorks / PAGE_SIZE)) : (hasNextPage ? page + 1 : page);
  // Page numbers to show: all of them when there are few, otherwise first, last and the pages around the current one.
  const pageList = useMemo(() => {
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const set = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
    const sorted = [...set].sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1]! > 1) out.push("…"); out.push(n); });
    return out;
  }, [totalPages, page]);

  // Re-read the query string whenever it changes, so links within /art (such as
  // "View all →" to /art?artCategory=…) apply their filter, not only on first load.
  const urlSearch = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(urlSearch);

    // ?search=… (from the search box, the home page, or a shared link) is the active search.
    const term = (params.get("search") ?? "").trim();
    setSearchQuery(term);
    setActiveQuery(term);

    // Deep links such as /art?artCategory=Paintings (used by the "Explore all"
    // links below) need to arrive with the filter already applied. Names are
    // resolved to ids once the lookup lists have loaded.
    const category = params.get("artCategory");
    const style = params.get("artStyle") ?? params.get("artType");
    if (category || style) setPendingUrlFilter({ category, style });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

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

  /** The chosen filters as labelled chips ("Style: Realism"), shown above the results. */
  const activeChips = useMemo(() => {
    if (!filterOptions) return [];
    const groups: [keyof Filters, string, { id: number; name: string }[] | undefined][] = [
      ["artCategoryId", "Art type", filterOptions.categories],
      ["artStyleId", "Style", filterOptions.styles],
      ["paintMaterialId", "Medium", filterOptions.paintMaterials],
      ["baseTypeId", "Surface", filterOptions.baseTypes],
      ["sizeId", "Scale", filterOptions.sizes],
    ];
    return groups
      .map(([key, label, list]) => ({ key, label, value: nameOf(list ?? [], filters[key]) }))
      .filter((c): c is { key: keyof Filters; label: string; value: string } => !!c.value);
  }, [filters, filterOptions]);
  const isSearchMode = !!activeQuery;
  // "Did you mean…" when a search finds nothing.
  const { data: noResultHelp } = useSuggestions(activeQuery, isSearchMode && !isLoading && (artworks?.length ?? 0) === 0);

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

  /** Runs a search by putting it in the address (?search=…), so it can be shared and Back works. */
  const runSearch = (term: string) => {
    navigate(term ? `/art?search=${encodeURIComponent(term)}` : "/art");
  };
  const clearSearch = () => runSearch("");

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

        {/* ── Search ── */}
        <div className="mb-12 max-w-2xl mx-auto">
          <ArtworkSearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={runSearch}
            onPickStyle={(id) => { setFilters((f) => ({ ...f, artStyleId: id })); setSearchQuery(""); if (activeQuery) clearSearch(); }}
            onPickCategory={(id) => { setFilters((f) => ({ ...f, artCategoryId: id })); setSearchQuery(""); if (activeQuery) clearSearch(); }}
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-14">

          {/* ── Filter Sidebar (works together with the search) ── */}
          <AnimatePresence>
            {(
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
                        <CollapsibleFilterSection title="Art type" active={nameOf(filterOptions.categories, filters.artCategoryId)}>
                          <LookupFilterGroup
                            options={filterOptions.categories}
                            selected={filters.artCategoryId}
                            onChange={(v) => setFilters((f) => ({ ...f, artCategoryId: v }))}
                          />
                        </CollapsibleFilterSection>
                        <CollapsibleFilterSection title="Style" active={nameOf(filterOptions.styles, filters.artStyleId)}>
                          <LookupFilterGroup
                            options={filterOptions.styles}
                            selected={filters.artStyleId}
                            onChange={(v) => setFilters((f) => ({ ...f, artStyleId: v }))}
                          />
                        </CollapsibleFilterSection>
                        {(filterOptions.paintMaterials ?? []).some((o) => o.count > 0) && (
                          <CollapsibleFilterSection title="Medium" active={nameOf(filterOptions.paintMaterials ?? [], filters.paintMaterialId)}>
                            <LookupFilterGroup
                              options={(filterOptions.paintMaterials ?? []).filter((o) => o.count > 0)}
                              selected={filters.paintMaterialId}
                              onChange={(v) => setFilters((f) => ({ ...f, paintMaterialId: v }))}
                            />
                          </CollapsibleFilterSection>
                        )}
                        {(filterOptions.baseTypes ?? []).some((o) => o.count > 0) && (
                          <CollapsibleFilterSection title="Surface" active={nameOf(filterOptions.baseTypes ?? [], filters.baseTypeId)}>
                            <LookupFilterGroup
                              options={(filterOptions.baseTypes ?? []).filter((o) => o.count > 0)}
                              selected={filters.baseTypeId}
                              onChange={(v) => setFilters((f) => ({ ...f, baseTypeId: v }))}
                            />
                          </CollapsibleFilterSection>
                        )}
                        <CollapsibleFilterSection title="Scale" last active={nameOf(filterOptions.sizes, filters.sizeId)}>
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

            <div className="mb-6 flex justify-end">
              <label className="inline-flex items-center gap-3 text-xs uppercase tracking-widest text-foreground/60">
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-10 px-3 pr-8 bg-card border border-border text-sm normal-case tracking-normal text-foreground focus:outline-none focus:border-secondary cursor-pointer">
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>

            {(isSearchMode || activeChips.length > 0) && (
              <div className="mb-10 flex flex-wrap items-center gap-2" aria-live="polite">
                <span className="text-xs uppercase tracking-widest text-foreground/60 mr-1">
                  {isLoading ? "Searching…" : <>Showing {totalWorks != null && totalPages > 1 ? `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + (artworks?.length ?? 0)} of ${totalWorks}` : `${artworks?.length ?? 0}${hasNextPage ? "+" : ""}`} {(totalWorks ?? artworks?.length) === 1 ? "work" : "works"}:</>}
                </span>
                {isSearchMode && (
                  <button onClick={clearSearch} aria-label={`Remove search: ${activeQuery}`}
                    className="inline-flex items-center gap-2 h-9 pl-3 pr-2 bg-primary text-primary-foreground text-sm hover:bg-primary/85 transition-colors">
                    <span className="opacity-75">Search:</span> <span className="font-medium">“{activeQuery}”</span> <X size={14} />
                  </button>
                )}
                {activeChips.map((c) => (
                  <button key={c.key} onClick={() => setFilters((f) => ({ ...f, [c.key]: undefined }))}
                    aria-label={`Remove filter ${c.label}: ${c.value}`}
                    className="inline-flex items-center gap-2 h-9 pl-3 pr-2 bg-primary text-primary-foreground text-sm hover:bg-primary/85 transition-colors">
                    <span className="opacity-75">{c.label}:</span> <span className="font-medium">{c.value}</span> <X size={14} />
                  </button>
                ))}
                <button onClick={() => { setFilters({}); if (isSearchMode) clearSearch(); }}
                  className="h-9 px-3 text-xs uppercase tracking-widest text-foreground/70 border border-border hover:border-primary hover:text-primary transition-colors">
                  Clear all
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-32">
                <Loader2 className="animate-spin text-primary w-12 h-12" />
              </div>
            ) : (artworks?.length ?? 0) === 0 ? (
              <div className="text-center py-24 px-6 border border-border bg-card">
                <p className="text-xl text-foreground/70 font-display mb-3">
                  {isSearchMode ? <>No works found for “{activeQuery}”{activeChips.length ? " with these filters" : ""}</> : "No works found matching your refinement."}
                </p>
                {isSearchMode && noResultHelp?.didYouMean && (
                  <p className="text-base text-foreground/80 mb-4">
                    Did you mean{" "}
                    <button onClick={() => runSearch(noResultHelp.didYouMean!)} className="text-primary underline font-medium">
                      {noResultHelp.didYouMean}
                    </button>?
                  </p>
                )}
                {isSearchMode && (
                  <p className="text-sm text-foreground/60 italic mb-6">
                    Try another word — a place (“Hunza”), a subject (“mountain”, “cat”), a style (“realism”) or an artist’s name.
                  </p>
                )}
                <button
                  onClick={() => { setFilters({}); if (isSearchMode) clearSearch(); }}
                  className="text-secondary hover:text-primary transition-colors border-b border-current pb-1 uppercase tracking-widest text-xs"
                >
                  {activeChips.length && isSearchMode ? "Clear search and filters" : isSearchMode ? "Browse the full collection" : "Clear refinements"}
                </button>
              </div>
            ) : isSearchMode || sort !== "recommended" ? (
              /* Search results or a chosen sort order: one grid in that order */
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {artworks!.map((art) => <SearchResultCard key={art.id} artwork={art} />)}
              </motion.div>
            ) : (
              /* Mosaic groups */
              <div className="space-y-28">
                {groups.map(([category, works], idx) => (
                  <MosaicGroup key={category} category={category} artworks={works} index={idx} />
                ))}
              </div>
            )}

            {!isLoading && totalPages > 1 && (
              <nav aria-label="Pages" className="mt-20 flex flex-wrap items-center justify-center gap-2">
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
                <button onClick={() => goToPage(page + 1)} disabled={!hasNextPage} aria-label="Next page"
                  className="h-11 w-11 border border-border flex items-center justify-center hover:border-primary hover:text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors">
                  <ChevronRight size={18} />
                </button>
              </nav>
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
          <img loading="lazy" decoding="async"
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
                <img loading="lazy" decoding="async"
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
              <img loading="lazy" decoding="async"
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
              <img loading="lazy" decoding="async"
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
        <img loading="lazy" decoding="async"
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
        {artwork.displayPrice != null && (
          <p className="text-xs text-foreground/80 mt-1 font-medium">{formatMoney(artwork.displayPrice)}</p>
        )}
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
  active,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
  /** The chosen option, shown beside the heading so it stays visible when the section is closed. */
  active?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`py-4 ${last ? "" : "border-b border-border"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left group"
      >
        <h3 className={`text-xs uppercase tracking-widest transition-colors flex items-center gap-2 min-w-0 ${active ? "text-primary font-medium" : "text-foreground/60 group-hover:text-foreground"}`}>
          {title}
          {active && (
            <span className="normal-case tracking-normal text-[11px] bg-primary text-primary-foreground px-1.5 py-0.5 truncate max-w-[8rem]">{active}</span>
          )}
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
        className={`block text-left w-full text-sm px-2 py-1.5 -mx-2 transition-colors ${
          selected == null ? "text-foreground font-medium" : "text-foreground/75 hover:text-foreground hover:bg-foreground/5"
        }`}
      >
        All
      </button>
      {options.map((opt) => {
        const on = selected === opt.id;
        return (
          <button
            key={opt.id}
            disabled={opt.count === 0 && !on}
            aria-pressed={on}
            onClick={() => onChange(on ? undefined : opt.id)}
            className={`flex items-center justify-between gap-2 text-left w-full text-sm px-2 py-1.5 -mx-2 transition-colors ${
              on
                ? "bg-primary text-primary-foreground font-medium"
                : opt.count === 0
                  ? "text-foreground/30 cursor-not-allowed"
                  : "text-foreground/75 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            <span className="flex items-center gap-1.5">{on && <Check size={14} />}{opt.name}</span>
            <span className={`text-xs tabular-nums ${on ? "text-primary-foreground" : opt.count === 0 ? "text-foreground/30" : "text-foreground/70"}`}>{opt.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Display name of the chosen option in a lookup list. */
function nameOf(list: { id: number; name: string }[], id?: number): string | undefined {
  return id == null ? undefined : list.find((o) => o.id === id)?.name;
}
