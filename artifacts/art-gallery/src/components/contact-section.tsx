import { useEffect } from "react";
import { Link } from "wouter";
import { MessageCircle, Mail, MapPin, Palette, Truck, Frame } from "lucide-react";
import { useContact, whatsappLink, prettyPhone } from "@/lib/contact";

const TOPICS = [
  { icon: Palette, title: "An artwork", text: "Ask about a painting, its price, size or availability, or request a commission." },
  { icon: Truck, title: "An order", text: "Check an order, change the delivery address, or report a problem on arrival." },
  { icon: Frame, title: "Framing", text: "Get help choosing a frame or a size for your wall." },
];

/** "Get in touch" — the last part of the Our Story page (/about#contact). */
export function ContactSection() {
  const { data: contact, isLoading } = useContact();

  // Arriving from a "/about#contact" link: scroll down to this section.
  useEffect(() => {
    if (window.location.hash === "#contact") document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <section id="contact" className="scroll-mt-28 border-t border-border pt-24 mt-32">
      <div>
        <header className="mb-16 text-center">
          <h2 className="text-4xl md:text-6xl font-display text-primary mb-6 leading-tight">Get in Touch</h2>
          <div className="w-24 h-px bg-secondary mx-auto mb-8" />
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto italic font-serif">
            We are happy to help — about a work you love, an order on its way, or showing your art with us.
          </p>
        </header>

        <div className="flex flex-wrap justify-center gap-4 mb-16">
          {contact?.whatsapp && (
            <a href={whatsappLink(contact.whatsapp, "Assalam o Alaikum, I have a question about Maktaba Al-Fann.")}
              target="_blank" rel="noopener noreferrer"
              className="w-full md:w-[calc((100%-2rem)/3)] border border-border bg-card p-8 hover:border-primary transition-colors group">
              <MessageCircle className="text-secondary mb-4" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-foreground/50 mb-2">WhatsApp (fastest)</p>
              <p className="font-display text-xl text-primary group-hover:text-secondary transition-colors">{prettyPhone(contact.whatsapp)}</p>
            </a>
          )}
          {contact?.email && (
            <a href={`mailto:${contact.email}`} className="w-full md:w-[calc((100%-2rem)/3)] border border-border bg-card p-8 hover:border-primary transition-colors group">
              <Mail className="text-secondary mb-4" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-foreground/50 mb-2">Email</p>
              <p className="font-serif text-lg text-primary group-hover:text-secondary transition-colors break-all">{contact.email}</p>
            </a>
          )}
          <div className="w-full md:w-[calc((100%-2rem)/3)] border border-border bg-card p-8">
            <MapPin className="text-secondary mb-4" />
            <p className="text-[10px] uppercase tracking-[0.3em] text-foreground/50 mb-2">Based in</p>
            <p className="font-display text-xl text-primary">{contact?.city ?? "Lahore, Pakistan"}</p>
            <p className="text-sm text-foreground/60 mt-2">We work online and deliver across Pakistan.</p>
          </div>
        </div>
        {!isLoading && !contact?.whatsapp && !contact?.email && (
          <p className="text-center text-sm text-foreground/50 -mt-10 mb-16">Contact details are being updated. Please check back soon.</p>
        )}

        <section className="mb-16">
          <h2 className="font-display text-2xl text-primary mb-6 text-center">How can we help?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TOPICS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="text-center px-4">
                <Icon className="mx-auto text-secondary mb-3" size={22} />
                <p className="font-display text-lg text-foreground mb-2">{title}</p>
                <p className="text-sm text-foreground/60 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border pt-12 text-center">
          <h2 className="font-display text-2xl text-primary mb-3">Artists and galleries</h2>
          <p className="text-foreground/70 max-w-xl mx-auto mb-6">
            Want to show and sell your work on Maktaba Al-Fann? Register through our portals and our team will be in touch.
          </p>
          <Link href="/portals" className="inline-flex items-center gap-4 text-primary hover:text-secondary transition-colors group">
            <span className="text-xs uppercase tracking-[0.25em] font-display">Join as an artist or gallery</span>
            <span className="w-8 h-px bg-current group-hover:w-14 transition-all duration-500" />
          </Link>
        </section>
      </div>
    </section>
  );
}
