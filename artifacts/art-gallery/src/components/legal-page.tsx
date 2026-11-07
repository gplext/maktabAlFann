import type { ReactNode } from "react";

/** Shared layout for Privacy Policy and Terms & Conditions. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-background min-h-screen text-foreground pt-32 pb-24">
      <div className="container mx-auto px-6 md:px-12 max-w-3xl">
        <header className="mb-14 text-center">
          <h1 className="text-4xl md:text-6xl font-display text-primary mb-6 leading-tight">{title}</h1>
          <div className="w-24 h-px bg-secondary mx-auto mb-6" />
          <p className="text-xs uppercase tracking-widest text-foreground/50">Last updated {updated}</p>
        </header>
        <div className="text-base md:text-lg text-foreground/80 leading-relaxed font-serif mb-12">{intro}</div>
        <div className="space-y-10 font-serif text-foreground/80 leading-relaxed
          [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-primary [&_h2]:mb-4
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_p]:mb-3 [&_a]:text-secondary [&_a]:underline">
          {children}
        </div>
      </div>
    </div>
  );
}
