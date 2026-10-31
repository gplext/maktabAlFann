import { useGetArtist, useGetArtistPortfolio, getGetArtistQueryKey, getGetArtistPortfolioQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

type AdminPortfolioItem = { url: string; label?: string };

export default function ArtistProfile() {
  const { id } = useParams<{ id: string }>();
  const artistId = Number(id);
  const { data: artist, isLoading } = useGetArtist(artistId, {
    query: { enabled: !!id, queryKey: getGetArtistQueryKey(artistId) }
  });
  const { data: portfolio } = useGetArtistPortfolio(artistId, {
    query: { enabled: !!id, queryKey: getGetArtistPortfolioQueryKey(artistId) }
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>;
  }

  if (!artist) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-2xl font-display text-primary">Artist not found</div>;
  }

  const hasPortfolio = portfolio && portfolio.imageUrls && portfolio.imageUrls.length > 0;
  const adminItems: AdminPortfolioItem[] = ((portfolio as unknown as { adminItems?: AdminPortfolioItem[] })?.adminItems) ?? [];
  const hasAdminPortfolio = adminItems.length > 0;

  return (
    <div className="bg-background min-h-screen text-foreground pt-32 pb-24">
      <div className="container mx-auto max-w-6xl px-6 md:px-12">
        <Link href="/artists" className="inline-flex items-center gap-2 text-secondary hover:text-primary transition-colors mb-12 uppercase tracking-widest text-sm">
          <ArrowLeft size={16} /> Back to Masters
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-32">
          <div className="lg:col-span-5">
            <div className="sticky top-32">
              <div className="relative p-4 bg-card border border-border">
                <img 
                  src={artist.photoUrl} 
                  alt={artist.name} 
                  className="w-full aspect-[3/4] object-cover grayscale-[30%]"
                />
              </div>
              <div className="mt-12 space-y-6">
                <h1 className="text-5xl font-display text-primary">{artist.name}</h1>
                <div className="flex gap-4 items-center">
                  <span className="text-secondary font-display text-xl">{artist.birthYear}</span>
                  <span className="w-12 h-[1px] bg-border"></span>
                  <span className="text-muted-foreground uppercase tracking-widest text-sm">{artist.country}</span>
                </div>
                <div className="pt-8 border-t border-border">
                  <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Primary Style</h3>
                  <p className="text-xl font-serif text-foreground/90">{artist.style}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-20 pt-8">
            <section>
              <h2 className="text-3xl font-display text-primary mb-8 flex items-center gap-4">
                <span className="w-8 h-[1px] bg-secondary"></span>
                Biography
              </h2>
              <div className="text-lg leading-loose text-foreground/80 font-serif space-y-6 whitespace-pre-line">
                {artist.biography}
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {artist.influences && (
                <section>
                  <h3 className="text-xl font-display text-secondary mb-4">Influences</h3>
                  <p className="leading-relaxed text-foreground/80 italic">{artist.influences}</p>
                </section>
              )}
              {artist.awards && (
                <section>
                  <h3 className="text-xl font-display text-secondary mb-4">Recognitions</h3>
                  <p className="leading-relaxed text-foreground/80 whitespace-pre-line">{artist.awards}</p>
                </section>
              )}
            </div>

            {artist.exhibitions && (
              <section className="bg-card border border-border p-8">
                <h3 className="text-2xl font-display text-primary mb-6">Notable Exhibitions</h3>
                <p className="leading-loose text-foreground/80 whitespace-pre-line">{artist.exhibitions}</p>
              </section>
            )}
          </div>
        </div>

        {artist.artworks && artist.artworks.length > 0 && (
          <div className="pt-24 border-t border-border">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-display text-primary mb-4">Works in Gallery</h2>
              <div className="w-16 h-[1px] bg-secondary mx-auto"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {artist.artworks.map((artwork, idx) => (
                <motion.div
                  key={artwork.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: idx * 0.1 }}
                >
                  <Link href={`/art/${artwork.id}`} className="group block">
                    <div className="bg-card p-4 border border-border">
                      <div className="aspect-[4/3] overflow-hidden mb-6">
                        <img 
                          src={artwork.imageUrl} 
                          alt={artwork.title}
                          className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700"
                        />
                      </div>
                      <div className="text-center">
                        <h3 className="text-xl font-display text-primary group-hover:text-secondary transition-colors">{artwork.title}</h3>
                        <p className="text-sm text-muted-foreground mt-2">{artwork.year} &bull; {artwork.artType}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {hasPortfolio && (
          <div className="pt-24 border-t border-border">
            <div className="text-center mb-16">
              <span className="text-xs uppercase tracking-widest text-secondary mb-4 block font-display">Curated Works</span>
              <h2 className="text-4xl font-display text-primary mb-4">Portfolio — Works Not for Sale</h2>
              <div className="w-16 h-[1px] bg-secondary mx-auto mb-6" />
              {portfolio.description && (
                <p className="text-base italic text-foreground/60 font-serif max-w-2xl mx-auto leading-relaxed">
                  {portfolio.description}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {portfolio.imageUrls.map((url, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: (idx % 3) * 0.1 }}
                >
                  <div className="relative overflow-hidden bg-card border border-border group/port">
                    <div className="aspect-[4/3] overflow-hidden">
                      <img
                        src={url}
                        alt={`${artist.name} — Portfolio ${idx + 1}`}
                        className="w-full h-full object-cover grayscale-[15%] group-hover/port:grayscale-0 transition-all duration-700 group-hover/port:scale-[1.03]"
                      />
                    </div>
                    <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground text-[10px] uppercase tracking-widest px-3 py-1.5 font-display">
                      Not on Sale
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {hasAdminPortfolio && (
          <div className="pt-24 border-t border-border">
            <div className="text-center mb-16">
              <span className="text-xs uppercase tracking-widest text-secondary mb-4 block font-display">Gallery Curated</span>
              <h2 className="text-4xl font-display text-primary mb-4">Special Portfolio</h2>
              <div className="w-16 h-[1px] bg-secondary mx-auto mb-6" />
              <p className="text-sm italic text-foreground/50 uppercase tracking-widest">
                Selected by Maktaba Al-Fann — Not for Sale
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adminItems.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: (idx % 3) * 0.1 }}
                >
                  <div className="relative overflow-hidden bg-card border border-border group/port">
                    <div className="aspect-[4/3] overflow-hidden">
                      <img
                        src={item.url}
                        alt={item.label ?? `${artist.name} — Special Portfolio ${idx + 1}`}
                        className="w-full h-full object-cover grayscale-[15%] group-hover/port:grayscale-0 transition-all duration-700 group-hover/port:scale-[1.03]"
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end">
                      {item.label && (
                        <div className="bg-background/90 text-foreground/80 text-[10px] uppercase tracking-widest px-3 py-1.5 font-display">
                          {item.label}
                        </div>
                      )}
                      <div className="ml-auto flex flex-col items-end gap-1 p-2">
                        <span className="bg-secondary text-secondary-foreground text-[9px] uppercase tracking-widest px-2 py-0.5 font-display">
                          Special Portfolio
                        </span>
                        <span className="bg-primary text-primary-foreground text-[9px] uppercase tracking-widest px-2 py-0.5 font-display">
                          Not for Sale
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
