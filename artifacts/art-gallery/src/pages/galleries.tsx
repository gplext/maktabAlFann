import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, MapPin, ExternalLink, Search, X } from "lucide-react";
import { usePageMeta, SITE_NAME } from "@/lib/seo";
import { formatMoney } from "@/lib/money";

export type GalleryArtwork = {
  id: number; title: string; imageUrl: string; year: number; theme: string;
  artistName: string; artCategory: string; artStyle: string | null; displayPrice: number | null;
};
export type Gallery = {
  id: number; slug: string; name: string; description: string; city: string; country: string;
  websiteUrl: string; logoUrl: string; artworks: GalleryArtwork[];
};

/** One artwork tile, shared by the Gallery page and each gallery's own page. */
export function GalleryArtworkCard({ a }: { a: GalleryArtwork }) {
  return (
    <Link href={`/art/${a.id}`} className="block group">
      <div className="aspect-[3/4] overflow-hidden bg-card border border-border">
        <img src={a.imageUrl} alt={a.title} loading="lazy" decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="text-sm font-display text-foreground group-hover:text-primary transition-colors line-clamp-1">{a.title}</h3>
        <p className="text-xs text-foreground/60 italic line-clamp-1">{a.artistName}{a.year ? ` · ${a.year}` : ""}</p>
        <p className="text-[11px] text-secondary uppercase tracking-wide line-clamp-1">{a.artStyle ?? a.artCategory}</p>
        {a.displayPrice != null && <p className="text-xs text-foreground/80 mt-0.5">{formatMoney(a.displayPrice)}</p>}
      </div>
    </Link>
  );
}

/** The Gallery page: each partner gallery with the artworks it has added to Maktaba Al-Fann. */
export default function Galleries() {
  usePageMeta({
    title: `Partner Galleries — Art from Pakistani Galleries | ${SITE_NAME}`,
    description: "Artworks from Pakistan's partner galleries on Maktaba Al-Fann, shown gallery by gallery.",
  });
  const { data: galleries, isLoading } = useQuery<Gallery[]>({
    queryKey: ["/galleries/artworks"],
    queryFn: async () => {
      const res = await fetch("/api/galleries/artworks");
      if (!res.ok) throw new Error("Could not load galleries");
      return res.json();
    },
  });

  // Search: a gallery matches by its name, city or description (all its works are shown);
  // otherwise only its works that match by title, artist, style, type or subject are shown.
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const shown = useMemo(() => {
    if (!galleries || words.length === 0) return galleries ?? [];
    return galleries
      .map((g) => {
        if (has(`${g.name} ${g.city} ${g.country} ${g.description}`)) return g;
        const artworks = g.artworks.filter((a) =>
          has(`${a.title} ${a.artistName} ${a.artStyle ?? ""} ${a.artCategory} ${a.theme} ${g.name} ${g.city}`));
        return artworks.length ? { ...g, artworks } : null;
      })
      .filter((g): g is Gallery => !!g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleries, q]);
  const shownWorks = shown.reduce((n, g) => n + g.artworks.length, 0);

  return (
    <div className="bg-background min-h-screen text-foreground pt-28 pb-24">
      <div className="container mx-auto max-w-7xl px-6 md:px-12">
        <header className="mb-14 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-secondary mb-3">Partner Galleries</p>
          <h1 className="text-5xl md:text-6xl font-display text-primary mb-6">Gallery</h1>
          <div className="w-24 h-px bg-secondary mx-auto mb-8" />
          <p className="text-base text-foreground/70 max-w-2xl mx-auto italic">
            Works brought to Maktaba Al-Fann by Pakistan's galleries, shown gallery by gallery.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-32"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>
        ) : !galleries || galleries.length === 0 ? (
          <div className="text-center py-24 px-6 border border-border bg-card max-w-2xl mx-auto">
            <p className="text-xl text-foreground/70 font-display mb-3">No gallery collections yet</p>
            <p className="text-sm text-foreground/60 mb-6">
              Partner galleries' artworks will appear here as soon as they are approved.
            </p>
            <div className="flex flex-wrap gap-6 justify-center">
              <Link href="/art" className="text-secondary hover:text-primary border-b border-current pb-1 uppercase tracking-widest text-xs">Browse all artworks</Link>
              <Link href="/portals" className="text-secondary hover:text-primary border-b border-current pb-1 uppercase tracking-widest text-xs">Join as a gallery</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="max-w-2xl mx-auto mb-10">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none" />
                <input
                  type="search" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search galleries, cities, artworks or artists…" aria-label="Search galleries"
                  className="w-full pl-11 pr-10 py-4 bg-card border border-border text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-secondary transition-colors font-serif [&::-webkit-search-cancel-button]:hidden"
                />
                {q && (
                  <button onClick={() => setQ("")} aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-foreground/50 hover:text-foreground"><X size={16} /></button>
                )}
              </div>
              {words.length > 0 && (
                <p className="mt-3 text-xs uppercase tracking-widest text-foreground/60 text-center" aria-live="polite">
                  {shown.length === 0 ? "No matches" : `${shown.length} ${shown.length === 1 ? "gallery" : "galleries"} · ${shownWorks} ${shownWorks === 1 ? "work" : "works"}`}
                </p>
              )}
            </div>

            {words.length > 0 && shown.length === 0 && (
              <div className="text-center py-16 px-6 border border-border bg-card max-w-2xl mx-auto mb-16">
                <p className="text-lg text-foreground/70 font-display mb-4">Nothing matches “{q.trim()}”.</p>
                <button onClick={() => setQ("")} className="text-secondary hover:text-primary border-b border-current pb-1 uppercase tracking-widest text-xs">Show all galleries</button>
              </div>
            )}

            {words.length === 0 && galleries.length > 1 && (
              <nav aria-label="Galleries" className="flex flex-wrap justify-center gap-2 mb-16">
                {galleries.map((g) => (
                  <Link key={g.id} href={`/gallery/${g.slug}`}
                    className="h-9 px-4 inline-flex items-center border border-border text-sm text-foreground/80 hover:border-primary hover:text-primary transition-colors">
                    {g.name} <span className="ml-2 text-xs text-foreground/50">{g.artworks.length}</span>
                  </Link>
                ))}
              </nav>
            )}

            <div className="space-y-24">
              {shown.map((g) => (
                <section key={g.id} id={`gallery-${g.id}`} className="scroll-mt-28">
                  <div className="flex flex-col md:flex-row md:items-end gap-5 border-b border-border pb-6 mb-8">
                    {g.logoUrl && (
                      <img src={g.logoUrl} alt={`${g.name} logo`} loading="lazy"
                        className="w-16 h-16 object-contain border border-border bg-card p-1 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="font-display text-3xl md:text-4xl text-primary">
                        <Link href={`/gallery/${g.slug}`} className="hover:text-secondary transition-colors">{g.name}</Link>
                      </h2>
                      <p className="mt-2 text-sm text-foreground/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {(g.city || g.country) && (
                          <span className="inline-flex items-center gap-1"><MapPin size={14} /> {[g.city, g.country].filter(Boolean).join(", ")}</span>
                        )}
                        <span>{g.artworks.length} {words.length ? (g.artworks.length === 1 ? "matching work" : "matching works") : (g.artworks.length === 1 ? "work" : "works")}</span>
                        {g.websiteUrl && (
                          <a href={/^https?:\/\//.test(g.websiteUrl) ? g.websiteUrl : `https://${g.websiteUrl}`}
                            target="_blank" rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 text-secondary hover:text-primary">
                            Website <ExternalLink size={12} />
                          </a>
                        )}
                      </p>
                      {g.description && <p className="mt-3 text-sm text-foreground/70 max-w-3xl leading-relaxed">{g.description}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {g.artworks.slice(0, 8).map((a) => <GalleryArtworkCard key={a.id} a={a} />)}
                  </div>
                  <div className="mt-8">
                    <Link href={`/gallery/${g.slug}`}
                      className="inline-flex items-center gap-4 text-primary hover:text-secondary transition-colors group">
                      <span className="text-xs uppercase tracking-[0.25em] font-display">
                        {words.length === 0 && g.artworks.length > 8 ? `See all ${g.artworks.length} works from ${g.name}` : `Visit ${g.name}`}
                      </span>
                      <span className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
                    </Link>
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
