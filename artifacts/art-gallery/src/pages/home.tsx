import { useGetFeaturedArtworks, useGetGalleryStats, useListArtworks } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { HeroCrossfade, type HeroSlide } from "@/components/hero-crossfade";
import { usePageMeta, DEFAULT_TITLE, DEFAULT_DESC } from "@/lib/seo";
import { useCarousel } from "@/lib/carousel";
import { ArtCarousel } from "@/components/art-carousel";

const STATIC_SLIDES: HeroSlide[] = [
  { imageUrl: "https://picsum.photos/seed/lahore-fort/1920/1080",  label: "Architecture",    category: "Mughal Grandeur" },
  { imageUrl: "https://picsum.photos/seed/badshahi/1920/1080",     label: "Sacred Spaces",   category: "Sufi Traditions" },
  { imageUrl: "https://picsum.photos/seed/karakoram/1920/1080",    label: "Landscape",       category: "Mountain Valleys" },
  { imageUrl: "https://picsum.photos/seed/indus-valley/1920/1080", label: "Cultural Heritage", category: "Ancient Civilisations" },
  { imageUrl: "https://picsum.photos/seed/miniature-art/1920/1080",label: "Fine Art",        category: "Miniature Painting" },
  { imageUrl: "https://picsum.photos/seed/walled-lahore/1920/1080",label: "Living History",  category: "Walled City Stories" },
];

const THEME_LABELS: Record<string, { label: string; category: string }> = {
  Landscape:           { label: "Landscape",        category: "Mountain Valleys" },
  Portrait:            { label: "Portraiture",      category: "Human Stories" },
  Abstract:            { label: "Contemporary",     category: "Abstract Expression" },
  "Cultural Heritage": { label: "Cultural Heritage", category: "Ancient Civilisations" },
  Sufism:              { label: "Sacred Spaces",    category: "Sufi Traditions" },
  Mughal:              { label: "Architecture",     category: "Mughal Grandeur" },
  "Folk Art":          { label: "Folk Tradition",   category: "Living Heritage" },
  Contemporary:        { label: "Contemporary",     category: "Modern Vision" },
  "Still Life":        { label: "Fine Art",         category: "Still Life" },
  Geometric:           { label: "Pattern",          category: "Geometric Abstraction" },
  Streets:             { label: "Urban Life",       category: "City Streets" },
  Culture:             { label: "Cultural Heritage", category: "Cultural Expression" },
  History:             { label: "Living History",   category: "Historical Narratives" },
};

const MOOD_CHIPS = [
  "Misty Mountains",
  "Busy Bazaars",
  "Calligraphic Calm",
  "Portraits of Resilience",
  "Geometric Wonder",
  "Coastal Light",
  "Desert Reverie",
  "Ancient Mughal",
];

export default function Home() {
  usePageMeta({ title: DEFAULT_TITLE, description: DEFAULT_DESC });
  const { data: artworks, isLoading: loadingArtworks } = useGetFeaturedArtworks();
  // Images and order come from Admin → Carousels ("home-hero").
  const { data: carousel, isLoading: loadingCarousel, isError: carouselFailed } = useCarousel("home-hero");
  const { data: stats, isLoading: loadingStats } = useGetGalleryStats();
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();

  const heroSlides = useMemo<HeroSlide[]>(() => {
    if (loadingCarousel) return [];
    const source = carousel?.items.length
      ? carousel.items.map((a) => ({ imageUrl: a.slideUrl ?? a.imageUrl, theme: a.theme, style: a.artStyle }))
      : (carouselFailed ? artworks ?? [] : []).map((a) => ({ imageUrl: a.imageUrl, theme: a.theme, style: a.artType }));
    const fromArtworks: HeroSlide[] = source
      .filter((a) => a.imageUrl && !a.imageUrl.includes("placehold.co"))
      .map((a) => {
        const mapped =
          THEME_LABELS[a.theme ?? ""] ??
          THEME_LABELS[a.style ?? ""] ?? {
            label: a.style ?? "Fine Art",
            category: a.theme ?? a.style ?? "Pakistani Art",
          };
        return { imageUrl: a.imageUrl, label: mapped.label, category: mapped.category };
      });
    return fromArtworks.length > 0 ? fromArtworks : STATIC_SLIDES;
  }, [carousel, loadingCarousel, carouselFailed, artworks]);

  const featured = artworks?.slice(0, 4) ?? [];
  // "More from the Collection": up to 20 other works (not the four shown above), as a sliding row.
  const { data: collection } = useListArtworks({ limit: 40 });
  const compact = useMemo(() => {
    const shown = new Set((artworks ?? []).slice(0, 4).map((a) => a.id));
    return (collection ?? [])
      .filter((a) => !shown.has(a.id) && a.imageUrl && !a.imageUrl.includes("placehold.co"))
      .slice(0, 20);
  }, [collection, artworks]);

  const handleSearch = (query: string) => {
    if (!query.trim()) return;
    navigate(`/art?search=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="bg-background text-foreground font-sans">

      {/* ══════════════════════════════════════
          SECTION 1 — Title block on clean ivory
      ══════════════════════════════════════ */}
      <section className="pt-28 md:pt-32 pb-10 px-6 md:px-16 lg:px-24">
        <div className="max-w-screen-xl mx-auto">

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="flex items-center gap-6 mb-10"
          >
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] uppercase tracking-[0.35em] text-secondary whitespace-nowrap">
              Est. 2025 &nbsp;·&nbsp; Lahore, Pakistan
            </span>
            <div className="w-8 h-px bg-border" />
          </motion.div>

          <div className="flex flex-col lg:flex-row lg:items-end gap-8 lg:gap-16">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="hidden lg:flex flex-col items-center gap-4 pb-3"
            >
              <div className="w-px h-28 bg-secondary/40" />
              <span
                style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                className="text-[9px] uppercase tracking-[0.4em] text-secondary/60 rotate-180 select-none"
              >
                Fine Pakistani Art
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1"
            >
              <h1 className="font-display text-[clamp(3.5rem,10vw,8.5rem)] leading-[0.92] tracking-tight text-primary lg:text-right">
                Maktaba<br />Al-Fann
              </h1>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="mt-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6 border-t border-border pt-8"
          >
            <p className="text-base md:text-lg text-foreground/55 italic leading-relaxed max-w-xl font-serif">
              A window into Pakistan's soul — its streets, Sufi shrines,
              mountain valleys, and ancient Mughal heritage.
            </p>
            <Link
              href="/about"
              className="inline-flex items-center gap-4 text-primary hover:text-secondary transition-colors group flex-shrink-0"
            >
              <span className="font-display text-base uppercase tracking-widest">Our Story</span>
              <div className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 2 — Full-width carousel strip
      ══════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full"
      >
        <HeroCrossfade
          slides={heroSlides}
          intervalMs={3000}
          className="w-full h-[55vh] md:h-[68vh] lg:h-[78vh]"
        />
      </motion.section>

      {/* ══════════════════════════════════════
          SECTION 3 — Crimson stats panel
          (full-width, gold numbers, white labels)
      ══════════════════════════════════════ */}
      <section className="w-full bg-primary py-14 md:py-16">
        {loadingStats ? (
          <div className="flex justify-center">
            <Loader2 className="animate-spin text-primary-foreground/50 w-8 h-8" />
          </div>
        ) : stats ? (
          <div className="max-w-screen-xl mx-auto px-6 md:px-10 grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-4">
            {[
              { value: stats.totalArtworks,       label: "Artworks" },
              { value: stats.totalArtists,         label: "Artists" },
              { value: stats.countriesRepresented, label: "Countries" },
              { value: stats.artTypes,             label: "Mediums" },
            ].map(({ value, label }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.6 }}
                className="flex flex-col items-center text-center"
              >
                <span className="font-display text-5xl md:text-6xl lg:text-7xl text-secondary tabular-nums leading-none mb-3">
                  {value}
                </span>
                <span className="text-[10px] uppercase tracking-[0.35em] text-primary-foreground/80">
                  {label}
                </span>
              </motion.div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ══════════════════════════════════════
          SECTION 4 — Editorial split artworks
      ══════════════════════════════════════ */}
      <section className="py-24 px-6 md:px-16 lg:px-24">
        <div className="max-w-screen-xl mx-auto">

          <div className="flex items-baseline gap-8 mb-16">
            <h2 className="font-display text-3xl md:text-4xl text-primary">Stories from Pakistan</h2>
            <div className="flex-1 h-px bg-border hidden md:block" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-secondary hidden md:block">
              Curated Narratives
            </span>
          </div>

          {loadingArtworks ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-primary w-10 h-10" />
            </div>
          ) : (
            <div className="space-y-10 md:space-y-16">
              {featured.map((artwork, i) => {
                const isEven = i % 2 === 0;
                return (
                  <motion.div
                    key={artwork.id}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.9, delay: i * 0.05 }}
                    className={`flex flex-col ${isEven ? "md:flex-row" : "md:flex-row-reverse"} border-b border-border last:border-b-0`}
                  >
                    <Link
                      href={`/art/${artwork.id}`}
                      className="block relative w-full md:w-[58%] md:min-h-[420px] group overflow-hidden bg-card flex-shrink-0"
                    >
                      {/* On desktop the image fills the whole row, however tall the text beside it is: no empty band. */}
                      <div className="aspect-[4/3] md:aspect-auto md:absolute md:inset-0 overflow-hidden relative">
                        <img loading="lazy" decoding="async"
                          src={artwork.imageUrl}
                          alt={artwork.title}
                          className="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-primary/8 group-hover:bg-transparent transition-colors duration-500" />
                      </div>
                    </Link>

                    <div className="flex flex-col justify-center px-8 md:px-12 py-10 md:py-16 flex-1">
                      <span className="text-[10px] uppercase tracking-[0.35em] text-secondary mb-4">
                        {artwork.theme} &nbsp;·&nbsp; {artwork.year}
                      </span>
                      <h3 className="font-display text-2xl md:text-3xl text-primary leading-snug mb-4">
                        <Link href={`/art/${artwork.id}`} className="hover:text-secondary transition-colors">
                          {artwork.title}
                        </Link>
                      </h3>
                      <p className="text-sm italic text-foreground/50 mb-6">by {artwork.artistName}</p>
                      <p className="text-sm text-foreground/65 leading-relaxed mb-10 max-w-sm">
                        {artwork.shortDescription ||
                          "A profound piece exploring the depths of cultural heritage and artistic expression."}
                      </p>
                      <Link
                        href={`/art/${artwork.id}`}
                        className="inline-flex items-center gap-4 text-primary hover:text-secondary transition-colors group self-start"
                      >
                        <span className="text-xs uppercase tracking-[0.25em] font-display">Enquire</span>
                        <div className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 5 — "Find Art That Speaks to You"
          discovery section with mood chips
      ══════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-6 bg-card border-y border-border">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-[10px] uppercase tracking-[0.4em] text-secondary mb-5">Discover</p>
            <h2 className="font-display text-3xl md:text-4xl text-primary mb-4 leading-snug">
              Find Art That Speaks to You
            </h2>
            <p className="text-sm text-foreground/50 italic mb-10">
              Describe a feeling, a place, or a memory — we'll find the work for you.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch(searchQuery);
              }}
              className="relative mb-8"
            >
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Describe what you're looking for…"
                className="w-full pl-11 pr-28 py-4 bg-background border border-border text-sm text-foreground placeholder:text-foreground/35 focus:outline-none focus:border-secondary transition-colors font-serif"
              />
              <button
                type="submit"
                className="absolute right-0 top-0 h-full px-5 bg-primary text-primary-foreground text-[10px] uppercase tracking-[0.2em] font-display hover:bg-secondary transition-colors"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap justify-center gap-2.5">
              {MOOD_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleSearch(chip)}
                  className="px-4 py-2 border border-border text-[10px] uppercase tracking-[0.18em] text-foreground/60 font-display hover:border-secondary hover:text-secondary hover:bg-secondary/5 transition-all duration-200"
                >
                  {chip}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SECTION 6 — More from the Collection (sliding row)
      ══════════════════════════════════════ */}
      {compact.length > 0 && (
        <section className="py-20 px-6 md:px-16 lg:px-24">
          <div className="max-w-screen-xl mx-auto">
            <div className="flex items-baseline gap-8 mb-10">
              <h2 className="font-display text-xl text-primary uppercase tracking-widest">More from the Collection</h2>
              <div className="flex-1 h-px bg-border hidden md:block" />
            </div>
            <ArtCarousel items={compact} />
            <div className="mt-12 text-center">
              <Link
                href="/art"
                className="inline-flex items-center gap-4 text-primary hover:text-secondary transition-colors group"
              >
                <span className="font-display text-base uppercase tracking-widest">View Full Collection</span>
                <div className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════
          SECTION 7 — Our Story CTA
      ══════════════════════════════════════ */}
      <section className="py-20 border-t border-border">
        <div className="flex justify-center">
          <Link
            href="/about"
            className="inline-flex items-center gap-5 text-primary hover:text-secondary transition-colors group"
          >
            <div className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
            <span className="font-display text-xl uppercase tracking-widest">Our Story</span>
            <div className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
          </Link>
        </div>
      </section>
    </div>
  );
}
