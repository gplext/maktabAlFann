import { Link } from "wouter";
import { MessageCircle, Mail, MapPin } from "lucide-react";
import { useContact, whatsappLink, prettyPhone } from "@/lib/contact";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Explore",
    links: [
      { href: "/art", label: "Artworks" },
      { href: "/artists", label: "Artists" },
      { href: "/specialty", label: "Specialty Art" },
      { href: "/shop", label: "Frames & Supplies" },
      { href: "/museum", label: "3D Museum" },
    ],
  },
  {
    title: "Maktaba Al-Fann",
    links: [
      { href: "/about", label: "Our Story" },
      { href: "/portals", label: "Artists & Galleries: Join Us" },
      { href: "/account", label: "My Account" },
      { href: "/cart", label: "Cart" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms & Conditions" },
    ],
  },
];

export function SiteFooter() {
  const { data: contact } = useContact();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border text-foreground">
      <div className="container mx-auto max-w-7xl px-6 md:px-12 py-16 grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
        <div>
          <Link href="/" className="inline-flex flex-col leading-none">
            <span className="font-display text-lg tracking-[0.15em] uppercase text-primary whitespace-nowrap">Maktaba Al-Fann</span>
            <span className="text-secondary text-lg mt-1 self-start" lang="ur">مکتبۃ الفن</span>
          </Link>
          <p className="mt-5 text-sm text-foreground/60 leading-relaxed max-w-xs">
            An online gallery of Pakistani art — every work presented with its style, its technique and the story of the artist who made it.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-[10px] uppercase tracking-[0.3em] text-secondary mb-5">{col.title}</p>
            <ul className="space-y-3">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-foreground/70 hover:text-primary transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-secondary mb-5">Get in touch</p>
          <ul className="space-y-3 text-sm text-foreground/70">
            {contact?.whatsapp && (
              <li>
                <a href={whatsappLink(contact.whatsapp, "Assalam o Alaikum, I have a question about Maktaba Al-Fann.")}
                  target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-primary transition-colors">
                  <MessageCircle size={15} /> WhatsApp {prettyPhone(contact.whatsapp)}
                </a>
              </li>
            )}
            {contact?.email && (
              <li>
                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 hover:text-primary transition-colors">
                  <Mail size={15} /> {contact.email}
                </a>
              </li>
            )}
            <li className="inline-flex items-center gap-2"><MapPin size={15} /> {contact?.city ?? "Lahore, Pakistan"}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container mx-auto max-w-7xl px-6 md:px-12 py-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between text-xs text-foreground/50">
          <p>© {year} Maktaba Al-Fann. All rights reserved. Artwork images © their artists.</p>
          <p className="flex gap-5">
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
