import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useListArtworks, useListArtists } from "@workspace/api-client-react";
import { usePageMeta, SITE_NAME } from "@/lib/seo";

const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Gallery",
    links: [
      { href: "/", label: "Home" },
      { href: "/art", label: "Artworks" },
      { href: "/gallery", label: "Gallery (partner galleries)" },
      { href: "/artists", label: "Artists" },
      { href: "/specialty", label: "Specialty Art" },
      { href: "/shop", label: "Frames & Supplies" },
      { href: "/museum", label: "3D Museum" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/about", label: "Our Story" },
      { href: "/about#contact", label: "Get in Touch" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms & Conditions" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/sign-up", label: "Create an account" },
      { href: "/account", label: "My Account" },
      { href: "/cart", label: "Cart" },
    ],
  },
  {
    title: "Artists & galleries",
    links: [
      { href: "/portals", label: "Join as an artist or gallery" },
      { href: "/artist-portal", label: "Artist portal" },
      { href: "/gallery-portal", label: "Gallery portal" },
    ],
  },
];

const heading = "text-[10px] uppercase tracking-[0.3em] text-secondary mb-4";
const linkCls = "text-sm text-foreground/70 hover:text-primary transition-colors";

/** Every page of the site on one page: the fixed pages, then every artist and every artwork. */
export default function Sitemap() {
  usePageMeta({
    title: `Sitemap | ${SITE_NAME}`,
    description: "Every page of Maktaba Al-Fann in one place: the gallery, every Pakistani artist and every artwork in the collection.",
  });
  const { data: artists, isLoading: loadingArtists } = useListArtists();
  const { data: galleries } = useQuery<{ id: number; slug: string; name: string; city: string }[]>({
    queryKey: ["/galleries/artworks"],
    queryFn: async () => { const r = await fetch("/api/galleries/artworks"); return r.ok ? r.json() : []; },
  });
  const { data: artworks, isLoading: loadingArtworks } = useListArtworks({ limit: 1000 });

  const sortedArtists = useMemo(
    () => [...(artists ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [artists],
  );
  const byCategory = useMemo(() => {
    const groups = new Map<string, { id: number; title: string; artistName: string }[]>();
    for (const a of artworks ?? []) {
      const key = a.artCategory || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ id: a.id, title: a.title, artistName: a.artistName });
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => [name, list.sort((x, y) => x.title.localeCompare(y.title))] as const);
  }, [artworks]);

  return (
    <div className="bg-background min-h-screen text-foreground pt-32 pb-24">
      <div className="container mx-auto px-6 md:px-12 max-w-6xl">
        <header className="mb-16 text-center">
          <h1 className="text-5xl md:text-7xl font-display text-primary mb-6 leading-tight">Sitemap</h1>
          <div className="w-24 h-px bg-secondary mx-auto mb-6" />
          <p className="text-lg text-foreground/70 italic font-serif">Every page of Maktaba Al-Fann in one place.</p>
        </header>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-20">
          {SECTIONS.map((s) => (
            <nav key={s.title} aria-label={s.title}>
              <h2 className={heading}>{s.title}</h2>
              <ul className="space-y-2.5">
                {s.links.map((l) => <li key={l.href}><Link href={l.href} className={linkCls}>{l.label}</Link></li>)}
              </ul>
            </nav>
          ))}
        </section>

        {!!galleries?.length && (
          <section className="border-t border-border pt-14 mb-20">
            <h2 className="font-display text-3xl text-primary mb-8">
              Partner galleries <span className="text-foreground/40 text-lg">({galleries.length})</span>
            </h2>
            <ul className="columns-2 md:columns-3 lg:columns-4 gap-8 space-y-2.5">
              {galleries.map((g) => (
                <li key={g.id} className="break-inside-avoid">
                  <Link href={`/gallery/${g.slug}`} className={linkCls}>{g.name}</Link>
                  {g.city && <span className="text-xs text-foreground/40"> — {g.city}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="border-t border-border pt-14 mb-20">
          <h2 className="font-display text-3xl text-primary mb-8">
            Artists {artists && <span className="text-foreground/40 text-lg">({artists.length})</span>}
          </h2>
          {loadingArtists ? (
            <Loader2 className="animate-spin text-primary" />
          ) : (
            <ul className="columns-2 md:columns-3 lg:columns-4 gap-8 space-y-2.5">
              {sortedArtists.map((a) => (
                <li key={a.id} className="break-inside-avoid">
                  <Link href={`/artists/${a.id}`} className={linkCls}>{a.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-border pt-14">
          <h2 className="font-display text-3xl text-primary mb-8">
            Artworks {artworks && <span className="text-foreground/40 text-lg">({artworks.length})</span>}
          </h2>
          {loadingArtworks ? (
            <Loader2 className="animate-spin text-primary" />
          ) : (
            <div className="space-y-12">
              {byCategory.map(([category, list]) => (
                <div key={category}>
                  <h3 className={heading}>{category} · {list.length}</h3>
                  <ul className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-2.5">
                    {list.map((a) => (
                      <li key={a.id} className="break-inside-avoid">
                        <Link href={`/art/${a.id}`} className={linkCls}>{a.title}</Link>
                        <span className="text-xs text-foreground/40"> — {a.artistName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
