import { useGetGalleryAbout } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function About() {
  const { data: about, isLoading } = useGetGalleryAbout();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>;
  }

  if (!about) {
    return null;
  }

  return (
    <div className="bg-background min-h-screen text-foreground pt-32 pb-24">
      <div className="container mx-auto px-6 md:px-12 max-w-5xl">
        <header className="mb-24 text-center">
          <span className="text-sm uppercase tracking-widest text-secondary block mb-6">Founded {about.founded}</span>
          <h1 className="text-5xl md:text-7xl font-display text-primary mb-8 leading-tight">Our Story</h1>
          <div className="w-24 h-[1px] bg-secondary mx-auto"></div>
        </header>

        <article className="prose prose-lg md:prose-xl prose-stone mx-auto font-serif text-foreground/90 leading-loose prose-headings:font-display prose-headings:text-primary prose-a:text-secondary">
          <p className="text-2xl md:text-3xl leading-relaxed text-primary italic mb-16 text-center">
            "{about.mission}"
          </p>

          <div className="relative mb-24 p-8 md:p-16 bg-card border border-border shadow-sm">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-6">
              <span className="text-2xl font-display text-secondary">The Genesis</span>
            </div>
            <p className="whitespace-pre-line text-lg">
              {about.history}
            </p>
          </div>

          {about.vision && (
             <div className="text-center mb-32">
               <h2 className="text-3xl font-display text-primary mb-8">A Vision for Tomorrow</h2>
               <p className="italic text-foreground/80 max-w-3xl mx-auto">{about.vision}</p>
             </div>
          )}
        </article>

        {about.team && about.team.length > 0 && (
          <section className="mt-32 pt-24 border-t border-border">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-display text-primary mb-6">The Curators</h2>
              <div className="w-16 h-[1px] bg-secondary mx-auto"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
              {about.team.map((member, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: idx * 0.1 }}
                  className="text-center"
                >
                  <div className="mx-auto w-48 h-48 rounded-full overflow-hidden border-2 border-border mb-8 p-2 bg-card">
                    {member.photoUrl ? (
                      <img 
                        src={member.photoUrl} 
                        alt={member.name}
                        className="w-full h-full object-cover rounded-full grayscale-[30%]"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-muted flex items-center justify-center text-primary font-display text-2xl">
                        {member.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <h3 className="text-2xl font-display text-primary mb-2">{member.name}</h3>
                  <span className="text-xs uppercase tracking-widest text-secondary block mb-4">{member.role}</span>
                  <p className="text-sm font-serif text-foreground/70 leading-relaxed max-w-xs mx-auto">
                    {member.bio}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
