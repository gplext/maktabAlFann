import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Loader2, MapPin, ExternalLink, ArrowLeft } from "lucide-react";
import { usePageMeta, SITE_NAME, clip } from "@/lib/seo";
import { GalleryArtworkCard, type Gallery } from "@/pages/galleries";
import { ArtCarousel } from "@/components/art-carousel";

/** A gallery needs at least this many paintings before its page opens with a carousel. */
const MIN_CAROUSEL_PAINTINGS = 6;

/** One partner gallery's own page: /gallery/<slug>, showing only that gallery's artworks. */
export default function GalleryDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { data: g, isLoading, isError } = useQuery<Gallery | null>({
    queryKey: ["/galleries", slug],
    queryFn: async () => {
      const res = await fetch(`/api/galleries/${encodeURIComponent(slug)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Could not load the gallery");
      return res.json();
    },
  });
  const where = g ? [g.city, g.country].filter(Boolean).join(", ") : "";
  usePageMeta(g ? {
    title: `${g.name}${where ? ` — ${where}` : ""} | Partner Gallery | ${SITE_NAME}`,
    description: clip(g.description || `${g.artworks.length} artworks from ${g.name}${where ? `, ${where}` : ""}, on ${SITE_NAME}.`, 160),
    image: g.artworks[0]?.imageUrl,
  } : g === null ? { title: `Gallery not found | ${SITE_NAME}`, noindex: true } : null);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>;
  }
  if (!g || isError) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center bg-background text-center px-6 pt-28">
        <p className="text-2xl font-display text-primary mb-4">{isError ? "Could not load this gallery." : "Gallery not found"}</p>
        <Link href="/gallery" className="text-secondary hover:text-primary border-b border-current pb-1 uppercase tracking-widest text-xs">See all galleries</Link>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-foreground pt-28 pb-24">
      <div className="container mx-auto max-w-7xl px-6 md:px-12">
        <Link href="/gallery" className="inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors mb-10 uppercase tracking-widest text-xs">
          <ArrowLeft size={14} /> All galleries
        </Link>

        {/* The gallery's paintings as a sliding row (same as "More from the Collection" on the home page).
            Left out when the gallery has too few paintings for a carousel. */}
        {(() => {
          // Top paintings: the most valuable first (by price), then the rest; up to 12.
          const paintings = g.artworks
            .filter((a) => a.artCategory === "Paintings" && a.imageUrl && !a.imageUrl.includes("placehold.co"))
            .sort((x, y) => (y.displayPrice ?? -1) - (x.displayPrice ?? -1) || x.id - y.id)
            .slice(0, 12)
            .map((a) => ({ id: a.id, title: a.title, artistName: a.artistName, imageUrl: a.imageUrl, artType: a.artStyle }));
          return paintings.length >= MIN_CAROUSEL_PAINTINGS ? (
            <section className="mb-14" aria-label={`Paintings from ${g.name}`}>
              <ArtCarousel items={paintings} endless speed={20} />
            </section>
          ) : null;
        })()}

        <header className="mb-14 flex flex-col md:flex-row md:items-end gap-6 border-b border-border pb-10">
          {g.logoUrl && (
            <img src={g.logoUrl} alt={`${g.name} logo`} className="w-24 h-24 object-contain border border-border bg-card p-2 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-secondary mb-3">Partner Gallery</p>
            <h1 className="text-4xl md:text-6xl font-display text-primary leading-tight">{g.name}</h1>
            <p className="mt-3 text-sm text-foreground/60 flex flex-wrap items-center gap-x-5 gap-y-1">
              {where && <span className="inline-flex items-center gap-1"><MapPin size={14} /> {where}</span>}
              <span>{g.artworks.length} {g.artworks.length === 1 ? "work" : "works"}</span>
              {g.websiteUrl && (
                <a href={/^https?:\/\//.test(g.websiteUrl) ? g.websiteUrl : `https://${g.websiteUrl}`}
                  target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-secondary hover:text-primary">
                  Website <ExternalLink size={12} />
                </a>
              )}
            </p>
            {g.description && <p className="mt-5 text-base text-foreground/75 max-w-3xl leading-relaxed font-serif">{g.description}</p>}
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {g.artworks.map((a) => <GalleryArtworkCard key={a.id} a={a} />)}
        </div>
      </div>
    </div>
  );
}
