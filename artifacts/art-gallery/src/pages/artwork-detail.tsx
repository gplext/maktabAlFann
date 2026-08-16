import {
  useGetArtwork,
  getGetArtworkQueryKey,
  useAddToCart,
  useListArtworks,
  useGetArtworkAddons,
  getGetArtworkAddonsQueryKey,
} from "@workspace/api-client-react";
import { useParams } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useMemo, useState } from "react";
import { Loader2, Package, MapPin, Tag, Info } from "lucide-react";
import { Link } from "wouter";
import { useCartSession } from "@/hooks/useCartSession";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/money";
import Timeline from "@/components/timeline";

export default function ArtworkDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: artwork, isLoading } = useGetArtwork(Number(id), {
    query: { enabled: !!id, queryKey: getGetArtworkQueryKey(Number(id)) },
  });

  const { data: addons } = useGetArtworkAddons(Number(id), {
    query: { enabled: !!id, queryKey: getGetArtworkAddonsQueryKey(Number(id)) },
  });

  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);

  const sessionId = useCartSession();
  const addToCart = useAddToCart();
  const { toast } = useToast();

  const toggleAddon = (addonId: number) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((i) => i !== addonId) : [...prev, addonId]
    );
  };

  const handleEnquire = () => {
    if (!artwork || !sessionId) return;
    const selectedAddons = (addons ?? []).filter((a) => selectedAddonIds.includes(a.id));
    const notesValue = selectedAddons.length > 0
      ? JSON.stringify({ addons: selectedAddons.map((a) => ({ id: a.id, name: a.name })) })
      : undefined;
    addToCart.mutate(
      { data: { artworkId: artwork.id, sessionId, notes: notesValue } },
      {
        onSuccess: () => {
          toast({
            title: "Added to Collection",
            description: selectedAddons.length > 0
              ? `Artwork + ${selectedAddons.length} add-on${selectedAddons.length > 1 ? "s" : ""} added.`
              : "This artwork has been added to your enquiry list.",
          });
          setSelectedAddonIds([]);
        },
      }
    );
  };

  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], [-50, 50]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary w-12 h-12" />
      </div>
    );
  }

  if (!artwork) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-2xl font-display text-primary">
        Artwork not found
      </div>
    );
  }

  // Storage display
  const isWithArtist = !artwork.storageLocation || artwork.storageLocation.toLowerCase().includes("artist");
  const storageDisplayName = isWithArtist ? "With Artist" : artwork.storageLocation;
  const supplierDisplay = isWithArtist ? "With Artist" : (artwork.supplierName || artwork.storageLocation);

  // Dimensions
  // `size` is a bucket code now (L, M, ...), so it can no longer stand in for a
  // measurement — fall back to the free-text `dimensions` instead.
  const dimensionString = artwork.widthCm && artwork.heightCm
    ? `${artwork.widthCm} × ${artwork.heightCm} cm`
    : (artwork.dimensions || null);

  // All artwork form fields for right column
  const allDetails: { label: string; value: string | null | undefined }[] = [
    { label: "Short Description", value: artwork.shortDescription },
    { label: "Theme", value: artwork.theme },
    { label: "Category", value: artwork.artCategory },
    { label: "Style", value: artwork.artStyle },
    { label: "Medium", value: artwork.medium },
    { label: "Technique", value: artwork.technique },
    { label: "Dimensions", value: dimensionString },
    { label: "Size", value: artwork.sizeLabel },
    { label: "Year", value: String(artwork.year) },
    { label: "Frame", value: artwork.frameIncluded ? (artwork.frameDescription || "Included") : "Not included" },
  ].filter((r) => r.value);

  // Left sidebar details (compact)
  const sidebarDetails: { label: string; value: string | null | undefined }[] = [
    { label: "Medium", value: artwork.medium || artwork.artStyle },
    { label: "Dimensions", value: dimensionString ?? artwork.sizeLabel },
    { label: "Theme", value: artwork.theme },
    { label: "Frame", value: artwork.frameIncluded ? (artwork.frameDescription || "Included") : "Not included" },
  ].filter((r) => r.value);

  return (
    <div className="bg-background min-h-screen text-foreground pt-32 pb-24">
      <div className="container mx-auto max-w-6xl px-6 md:px-12">

        {/* ── Header ── */}
        <header className="mb-16 text-center max-w-3xl mx-auto">
          {artwork.tagline && (
            <p className="text-sm uppercase tracking-widest text-secondary/70 italic mb-3">{artwork.tagline}</p>
          )}
          <span className="text-sm uppercase tracking-widest text-secondary block mb-4">
            {artwork.nationality} &bull; {artwork.year}
          </span>
          <h1 className="text-4xl md:text-6xl font-display text-primary mb-6 leading-tight">
            {artwork.title}
          </h1>
          <p className="text-2xl italic text-foreground/60">by {artwork.artistName}</p>
        </header>

        {/* ── Main image ── */}
        <div className="mb-24 relative overflow-hidden bg-card border border-border p-4 md:p-8" ref={ref}>
          <motion.div style={{ y: imgY }} className="relative aspect-[4/3] md:aspect-[16/9]">
            <img src={artwork.imageUrl} alt={artwork.title} className="w-full h-full object-contain" />
          </motion.div>
        </div>

        {/* ── Two-column body ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 mb-24">

          {/* ── LEFT: Acquire + Availability ── */}
          <div className="md:col-span-4 space-y-6">

            {/* Acquire This Work */}
            <div className="bg-card border border-border p-7">
              <h3 className="font-display text-xl text-primary mb-5 border-b border-border pb-4">
                Acquire This Work
              </h3>

              {/* Price */}
              <div className="mb-6">
                {artwork.displayPrice ? (
                  <div className="text-center py-4 border border-secondary/30 bg-secondary/5">
                    <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-1">Gallery Price</p>
                    <p className="font-display text-3xl text-secondary">
                      {formatMoney(artwork.displayPrice)}
                    </p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-foreground/50 italic py-3 border border-border">
                    Price upon request
                  </p>
                )}
              </div>

              {/* Add-ons */}
              {addons && addons.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Package size={13} className="text-secondary" />
                    <span className="text-[10px] uppercase tracking-widest text-foreground/50">Enhance Your Purchase</span>
                  </div>
                  <div className="space-y-2">
                    {addons.map((addon) => {
                      const isChecked = selectedAddonIds.includes(addon.id);
                      return (
                        <label key={addon.id}
                          className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${isChecked ? "border-secondary bg-secondary/5" : "border-border hover:border-secondary/50"}`}
                        >
                          <input type="checkbox" checked={isChecked} onChange={() => toggleAddon(addon.id)} className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-display text-primary leading-tight">{addon.name}</p>
                            {addon.description && <p className="text-xs text-foreground/50 mt-0.5 italic line-clamp-2 leading-relaxed">{addon.description}</p>}
                            <span className="inline-block mt-1 text-[9px] uppercase tracking-widest text-secondary">{addon.type}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {selectedAddonIds.length > 0 && (
                    <p className="mt-3 text-center text-[10px] text-secondary uppercase tracking-widest">
                      {selectedAddonIds.length} add-on{selectedAddonIds.length > 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={handleEnquire}
                disabled={addToCart.isPending}
                className="w-full block text-center py-4 bg-primary text-primary-foreground font-display text-lg hover:bg-primary/90 transition-colors uppercase tracking-widest disabled:opacity-50"
              >
                {addToCart.isPending ? "Adding..." : "Add to Collection"}
              </button>

              {/* How to buy */}
              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-start gap-2 mb-2">
                  <Info size={12} className="text-secondary mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] uppercase tracking-widest text-foreground/50">How to Purchase</span>
                </div>
                <p className="text-xs text-foreground/55 leading-relaxed">
                  Press <span className="text-foreground/80 font-medium">"Add to Collection"</span> to add to cart.
                  Relevant frame and supply items can be included with this artwork.
                  The item can then be purchased from the <Link href="/cart" className="text-secondary underline underline-offset-2">Your Collection</Link> menu.
                  Note that depending on supplier, artwork availability might need to be confirmed.
                </p>
              </div>
            </div>

            {/* Availability */}
            {artwork.storageLocation && (
              <div className="bg-card border border-border p-6">
                <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
                  <MapPin size={14} className="text-secondary" />
                  <h3 className="font-display text-base text-primary">Availability</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-foreground/60">Location</dt>
                    <dd className="font-medium text-right">{storageDisplayName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-foreground/60">Supplier</dt>
                    <dd className="font-medium text-right">{supplierDisplay}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>

          {/* ── RIGHT: Full Artwork Info + Brief Artist ── */}
          <div className="md:col-span-8 space-y-10">

            {/* All artwork details grid */}
            <section>
              <h2 className="text-2xl font-display text-primary mb-6 flex items-center gap-4">
                <span className="w-8 h-[1px] bg-secondary" />
                About This Work
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
                {allDetails.map(({ label, value }) => (
                  <div key={label} className={label === "Short Description" ? "sm:col-span-2" : ""}>
                    <dt className="text-[10px] uppercase tracking-widest text-foreground/45 mb-1">{label}</dt>
                    <dd className={`text-sm text-foreground/90 ${label === "Short Description" ? "leading-relaxed" : "font-medium"}`}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Tags */}
            {artwork.tags && artwork.tags.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={12} className="text-secondary" />
                  <h3 className="text-[10px] uppercase tracking-widest text-foreground/50">Tags</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {artwork.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1.5 border border-border text-[10px] uppercase tracking-widest text-foreground/60 bg-card">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Brief Artist Card */}
            <section className="border border-border bg-card overflow-hidden">
              <div className="flex gap-0">
                {artwork.artistPhotoUrl && (
                  <div className="w-28 flex-shrink-0 overflow-hidden bg-background">
                    <img
                      src={artwork.artistPhotoUrl}
                      alt={artwork.artistName}
                      className="w-full h-full object-cover"
                      style={{ minHeight: "112px" }}
                    />
                  </div>
                )}
                <div className="flex-1 p-6">
                  <p className="text-[10px] uppercase tracking-widest text-secondary mb-1">The Artist</p>
                  <h4 className="font-display text-xl text-primary mb-1">{artwork.artistName}</h4>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-widest text-foreground/50 mb-3">
                    {artwork.artistCountry && <span>{artwork.artistCountry}</span>}
                    {artwork.artistBirthYear && <span>b. {artwork.artistBirthYear}</span>}
                    {artwork.artistStyle && <span>{artwork.artistStyle}</span>}
                  </div>
                  {artwork.artistBio && (
                    <p className="text-sm text-foreground/65 leading-relaxed line-clamp-3 mb-3">
                      {artwork.artistBio}
                    </p>
                  )}
                  <Link
                    href={`/artists/${artwork.artistId}`}
                    className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest text-secondary hover:text-primary transition-colors"
                  >
                    View Full Profile
                    <span className="w-5 h-px bg-current inline-block" />
                  </Link>
                </div>
              </div>
            </section>

          </div>
        </div>

        {/* ── Cultural Timeline ── */}
        {artwork.timeline && artwork.timeline.length > 0 && (
          <div className="mt-24 pt-20 border-t border-border">
            <h2 className="text-4xl font-display text-center text-primary mb-16">
              Cultural Timeline
            </h2>
            <Timeline events={artwork.timeline} />
          </div>
        )}
      </div>

      {/* ── Related Works ── */}
      <RelatedWorks currentId={artwork.id} artStyle={artwork.artStyle} artCategory={artwork.artCategory} />
    </div>
  );
}

function RelatedWorks({
  currentId,
  artStyle,
  artCategory,
}: {
  currentId: number;
  artStyle?: string | null;
  artCategory?: string | null;
}) {
  // Prefer style for "related"; fall back to category when the artwork has no
  // style set, so the section is never empty for want of a filter.
  const label = artStyle || artCategory || "";
  const { data: all, isLoading } = useListArtworks(
    artStyle ? { artStyle } : artCategory ? { artCategory } : {},
  );
  const related = useMemo(() => (all ?? []).filter((a) => a.id !== currentId).slice(0, 8), [all, currentId]);
  if (isLoading || related.length === 0) return null;

  return (
    <section className="mt-32 pt-16 border-t border-border bg-card">
      <div className="container mx-auto max-w-6xl px-6 md:px-12 py-16">
        <div className="flex items-baseline gap-8 mb-10">
          <h2 className="font-display text-3xl md:text-4xl text-primary">Related Works</h2>
          <div className="flex-1 h-px bg-border hidden md:block" />
          <span className="text-[10px] uppercase tracking-[0.3em] text-secondary hidden md:block">{label}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {related.map((art, i) => (
            <motion.div key={art.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.6 }}>
              <Link href={`/art/${art.id}`} className="block group">
                <div className="relative overflow-hidden bg-background border border-border h-[160px] md:h-[200px]">
                  <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-50 group-hover:opacity-90 transition-opacity duration-500" />
                  <div className="absolute bottom-0 inset-x-0 p-3 translate-y-1 group-hover:translate-y-0 transition-transform duration-400">
                    <h4 className="font-display text-xs md:text-sm text-white leading-tight line-clamp-2">{art.title}</h4>
                  </div>
                </div>
                <div className="mt-2.5 px-0.5">
                  <p className="text-xs font-display text-foreground group-hover:text-primary transition-colors line-clamp-1">{art.title}</p>
                  <p className="text-[11px] text-foreground/50 mt-0.5 italic line-clamp-1">{art.artistName}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/art" className="inline-flex items-center gap-4 text-primary hover:text-secondary transition-colors group">
            <span className="font-display text-base uppercase tracking-widest">View Full Collection</span>
            <div className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
          </Link>
        </div>
      </div>
    </section>
  );
}
