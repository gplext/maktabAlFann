import { useListArtworks } from "@workspace/api-client-react";
import type { Artwork } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";

const SPECIALTY_TYPES = ["AI Art", "Sculpture Work", "Handicraft"] as const;
type SpecialtyType = (typeof SPECIALTY_TYPES)[number];

const TYPE_DESCRIPTIONS: Record<SpecialtyType, string> = {
  "AI Art": "Where algorithms meet the ancient. Generative works bridging digital intelligence with classical South Asian aesthetics.",
  "Sculpture Work": "Form given to feeling. Sculptural pieces from masters who shape stone, metal, and clay into cultural memory.",
  "Handicraft": "The patient hand. Artisanal works born of tradition — woven, stitched, cast, and fired across generations.",
};

export default function SpecialtyArt() {
  const [activeFilter, setActiveFilter] = useState<SpecialtyType | "All">("All");

  const { data: allSpecialty, isLoading } = useListArtworks({ limit: 200 });

  const specialtyArtworks = useMemo(
    () => (allSpecialty ?? []).filter((a) => a.specialtyType != null),
    [allSpecialty]
  );

  const displayedArtworks = useMemo(() => {
    if (activeFilter === "All") return specialtyArtworks;
    return specialtyArtworks.filter((a) => a.specialtyType === activeFilter);
  }, [specialtyArtworks, activeFilter]);

  const groups = useMemo<[SpecialtyType, Artwork[]][]>(() => {
    if (activeFilter !== "All") {
      if (displayedArtworks.length === 0) return [];
      return [[activeFilter, displayedArtworks]];
    }
    return SPECIALTY_TYPES.map((type) => [
      type,
      specialtyArtworks.filter((a) => a.specialtyType === type),
    ]).filter(([, works]) => works.length > 0) as [SpecialtyType, Artwork[]][];
  }, [activeFilter, displayedArtworks, specialtyArtworks]);

  return (
    <div className="bg-background min-h-screen text-foreground pt-28 pb-24">
      <div className="container mx-auto max-w-7xl px-6 md:px-12">

        <header className="mb-12 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-[0.3em] text-secondary mb-3"
          >
            Beyond the Canvas
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-6xl font-display text-primary mb-6"
          >
            Specialty Art
          </motion.h1>
          <div className="w-24 h-[1px] bg-secondary mx-auto mb-8" />
          <p className="text-base text-foreground/60 max-w-2xl mx-auto italic font-serif">
            Three distinct disciplines — AI-generated visions, sculptural forms, and hand-crafted
            heritage — each demanding a different kind of attention.
          </p>
        </header>

        {/* Filter Buttons */}
        <div className="flex flex-wrap justify-center gap-3 mb-16">
          <FilterButton
            label="All"
            active={activeFilter === "All"}
            count={specialtyArtworks.length}
            onClick={() => setActiveFilter("All")}
          />
          {SPECIALTY_TYPES.map((type) => (
            <FilterButton
              key={type}
              label={type}
              active={activeFilter === type}
              count={specialtyArtworks.filter((a) => a.specialtyType === type).length}
              onClick={() => setActiveFilter(type)}
            />
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-40">
            <Loader2 className="animate-spin text-primary w-12 h-12" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-32 border border-border bg-card">
            <p className="text-xl text-muted-foreground font-display mb-4">
              No specialty works found for this category.
            </p>
            <button
              onClick={() => setActiveFilter("All")}
              className="text-secondary hover:text-primary transition-colors border-b border-current pb-1 uppercase tracking-widest text-sm"
            >
              View all specialty art
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFilter}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45 }}
              className="space-y-28"
            >
              {groups.map(([type, works], idx) => (
                <SpecialtyMosaicGroup
                  key={type}
                  specialtyType={type}
                  artworks={works}
                  index={idx}
                  showDescription={activeFilter === "All"}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-7 py-3 text-xs uppercase tracking-[0.2em] font-display transition-all duration-300 border ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground/65 border-border hover:border-secondary hover:text-primary"
      }`}
    >
      {label}
      <span
        className={`ml-2.5 text-[10px] tabular-nums ${
          active ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function SpecialtyMosaicGroup({
  specialtyType,
  artworks,
  index,
  showDescription,
}: {
  specialtyType: SpecialtyType;
  artworks: Artwork[];
  index: number;
  showDescription: boolean;
}) {
  const hero = artworks[0];
  const stacked = artworks.slice(1, 3);
  const strip = artworks.slice(3, 7);
  const rest = artworks.slice(7);
  const [showRest, setShowRest] = useState(false);

  if (!hero) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.85, delay: index * 0.05 }}
    >
      <div className="flex items-baseline gap-6 mb-5 border-b border-border pb-4">
        <h2 className="font-display text-2xl md:text-3xl text-primary">{specialtyType}</h2>
        <span className="text-xs uppercase tracking-widest text-secondary">
          {artworks.length} {artworks.length === 1 ? "work" : "works"}
        </span>
        <div className="flex-1 h-[1px] bg-border hidden sm:block" />
      </div>

      {showDescription && (
        <p className="text-sm italic text-foreground/55 font-serif mb-7 max-w-xl">
          {TYPE_DESCRIPTIONS[specialtyType]}
        </p>
      )}

      {/* Row 1: Large left (2/3) + two stacked right (1/3) */}
      <div className="flex gap-2 mb-2" style={{ height: "440px" }}>
        <Link
          href={`/art/${hero.id}`}
          className="block group overflow-hidden bg-card border border-border flex-shrink-0 relative"
          style={{ width: "66.67%" }}
        >
          <img
            src={hero.imageUrl}
            alt={hero.title}
            className="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 border border-border/60">
            <span className="text-[10px] uppercase tracking-[0.25em] text-secondary">
              {specialtyType}
            </span>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-5 md:p-7">
            <p className="text-[10px] uppercase tracking-[0.2em] text-secondary/80 mb-1">
              {hero.theme} · {hero.year}
            </p>
            <h3 className="font-display text-xl md:text-2xl text-white leading-tight mb-1">
              {hero.title}
            </h3>
            <p className="text-white/55 text-sm italic">by {hero.artistName}</p>
            <div className="mt-3 inline-flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <span className="text-xs uppercase tracking-widest text-secondary">Explore</span>
              <div className="w-6 h-px bg-secondary" />
            </div>
          </div>
        </Link>

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
                  <h4 className="font-display text-sm text-white leading-tight line-clamp-1">
                    {art.title}
                  </h4>
                  <p className="text-white/50 text-[11px] italic line-clamp-1">
                    by {art.artistName}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <div className="flex-1 bg-card border border-border/30" />
          )}
          {stacked.length === 1 && <div className="flex-1 bg-card border border-border/30" />}
        </div>
      </div>

      {/* Row 2: Four-wide strip */}
      {strip.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          {strip.map((art) => (
            <Link
              key={art.id}
              href={`/art/${art.id}`}
              className="block group overflow-hidden bg-card border border-border relative h-[140px] md:h-[160px]"
            >
              <img
                src={art.imageUrl}
                alt={art.title}
                className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-600 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />
              <div className="absolute bottom-0 inset-x-0 p-2.5">
                <h4 className="font-display text-xs text-white leading-tight line-clamp-2">
                  {art.title}
                </h4>
                <p className="text-white/45 text-[10px] mt-0.5 italic line-clamp-1">
                  {art.artistName}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Show more */}
      {rest.length > 0 && showRest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          {rest.map((art) => (
            <Link
              key={art.id}
              href={`/art/${art.id}`}
              className="block group overflow-hidden bg-card border border-border relative h-[140px] md:h-[160px]"
            >
              <img
                src={art.imageUrl}
                alt={art.title}
                className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-600 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />
              <div className="absolute bottom-0 inset-x-0 p-2.5">
                <h4 className="font-display text-xs text-white line-clamp-2">{art.title}</h4>
                <p className="text-white/45 text-[10px] mt-0.5 italic line-clamp-1">
                  {art.artistName}
                </p>
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
                <span className="text-secondary group-hover:text-primary-foreground transition-colors">
                  +{rest.length}
                </span>
              </>
            )}
            <div className="w-4 h-px bg-current" />
          </button>
        </div>
      )}
    </motion.section>
  );
}
