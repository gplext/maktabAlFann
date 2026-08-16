import { Link } from "wouter";
import { TopNav } from "@/components/top-nav";
import { Palette, Building2, Crown } from "lucide-react";

const portals = [
  {
    href: "/artist-portal",
    icon: <Palette size={28} strokeWidth={1.2} />,
    label: "Artist Portal",
    sub: "For Artists",
    description:
      "Showcase your portfolio, submit new works for review, track earnings and commissions, and manage your public artist profile.",
    cta: "Enter Artist Portal",
    accent: "from-primary/8 to-primary/3 border-primary/20 hover:border-primary/40",
    ctaCls: "bg-primary text-primary-foreground hover:bg-primary/90",
  },
  {
    href: "/gallery-portal",
    icon: <Building2 size={28} strokeWidth={1.2} />,
    label: "Gallery Portal",
    sub: "For Gallery Owners",
    description:
      "Manage your gallery's presence, curate artists, handle commission records, and oversee the collection on display.",
    cta: "Enter Gallery Portal",
    accent: "from-secondary/10 to-secondary/4 border-secondary/25 hover:border-secondary/50",
    ctaCls: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
  },
  {
    href: "/collector",
    icon: <Crown size={28} strokeWidth={1.2} />,
    label: "Collector Portal",
    sub: "For Art Collectors",
    description:
      "Tour your private gallery villa, view every work you have acquired beautifully displayed on the walls, and manage your order history.",
    cta: "Enter My Collection",
    accent: "from-amber-50 to-amber-50/30 border-amber-300/40 hover:border-amber-400/60",
    ctaCls: "bg-amber-700 text-white hover:bg-amber-800",
  },
];

export default function Portals() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      {/* ── Hero ── */}
      <div className="pt-32 pb-16 text-center px-6 relative overflow-hidden">
        {/* decorative rule lines */}
        <div className="absolute inset-0 pointer-events-none select-none">
          <div className="absolute top-20 left-0 right-0 h-px bg-border/40" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-border/40" />
        </div>

        <p className="text-[10px] uppercase tracking-[0.35em] text-secondary mb-4 font-display">
          Maktaba Al-Fann
        </p>
        <h1 className="font-display text-5xl md:text-6xl text-primary mb-5 leading-tight">
          Portals
        </h1>
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="h-px w-16 bg-secondary/50" />
          <span
            className="text-2xl text-secondary/60"
            style={{ fontFamily: "'Scheherazade New', serif" }}
          >
            ✦
          </span>
          <div className="h-px w-16 bg-secondary/50" />
        </div>
        <p className="text-foreground/55 max-w-md mx-auto text-sm leading-relaxed">
          Choose your portal to access the part of Maktaba Al-Fann that belongs to you.
        </p>
      </div>

      {/* ── Portal Cards ── */}
      <div className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {portals.map((p) => (
            <Link key={p.href} href={p.href}>
              <div
                className={`group relative flex flex-col h-full bg-gradient-to-b ${p.accent} border rounded-sm p-8 transition-all duration-300 cursor-pointer`}
              >
                {/* ornamental top border */}
                <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />

                <div className="text-foreground/60 group-hover:text-primary transition-colors mb-5">
                  {p.icon}
                </div>

                <p className="text-[9px] uppercase tracking-[0.3em] text-foreground/40 mb-1">
                  {p.sub}
                </p>
                <h2 className="font-display text-2xl text-primary mb-4 leading-tight">
                  {p.label}
                </h2>

                <p className="text-sm text-foreground/55 leading-relaxed flex-1 mb-8">
                  {p.description}
                </p>

                <span
                  className={`inline-block w-full text-center text-[10px] uppercase tracking-[0.25em] font-display py-3 px-6 transition-colors ${p.ctaCls}`}
                >
                  {p.cta}
                </span>

                {/* ornamental bottom corner dots */}
                <div className="absolute bottom-4 right-4 flex gap-1 opacity-20">
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="w-1 h-1 rounded-full bg-current" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ornamental footer */}
        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-6">
            <div className="h-px flex-1 bg-border/40" />
            <span
              className="text-foreground/20 text-sm"
              style={{ fontFamily: "'Scheherazade New', serif" }}
            >
              مكتبة الفن
            </span>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <p className="text-[9px] uppercase tracking-[0.3em] text-foreground/25 mt-4">
            Lahore &bull; Dubai &bull; London
          </p>
        </div>
      </div>
    </div>
  );
}
