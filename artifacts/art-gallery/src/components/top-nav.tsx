import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, useClerk, Show } from "@clerk/react";

const NAV_LINKS = [
  { href: "/", label: "Gallery" },
  { href: "/art", label: "Artworks" },
  { href: "/specialty", label: "Specialty Art" },
  { href: "/artists", label: "Artists" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "Our Story" },
  { href: "/cart", label: "Cart" },
  { href: "/portals", label: "Portals" },
];

export function TopNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const close = () => setIsOpen(false);

  const handleSignOut = () => {
    signOut({ redirectUrl: "/" });
    close();
  };

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location === href || location.startsWith(href + "/") || location.startsWith(href + "?");
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-400 ${
          scrolled
            ? "bg-background/93 backdrop-blur-md border-b border-border/50 py-3"
            : "bg-background/70 backdrop-blur-sm py-4"
        }`}
      >
        <div className="container mx-auto px-6 md:px-10 flex items-center justify-between">
          <Link href="/" className="flex flex-col items-start leading-none group">
            <span className="font-display text-[11px] tracking-[0.22em] uppercase text-primary group-hover:text-secondary transition-colors">
              Maktaba Al-Fann
            </span>
            <span
              className="text-[17px] text-secondary/80 group-hover:text-secondary transition-colors"
              style={{ fontFamily: "'Scheherazade New', serif", lineHeight: "1.1" }}
            >
              مكتبة الفن
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-7">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`relative text-[10px] uppercase tracking-[0.20em] font-display transition-colors group ${
                  isActive(href)
                    ? "text-primary"
                    : "text-foreground/55 hover:text-primary"
                }`}
              >
                {label}
                <span
                  className={`absolute -bottom-0.5 left-0 h-px bg-secondary transition-all duration-300 ${
                    isActive(href) ? "w-full" : "w-0 group-hover:w-full"
                  }`}
                />
              </Link>
            ))}
          </nav>

          <button
            onClick={() => setIsOpen(true)}
            className="md:hidden text-foreground hover:text-primary transition-colors focus:outline-none"
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-background/97 backdrop-blur-xl flex flex-col overflow-y-auto md:hidden"
          >
            <div className="flex-shrink-0 container mx-auto px-6 py-5 flex justify-between items-center border-b border-border/30">
              <Link href="/" onClick={close} className="flex flex-col items-start leading-none">
                <span className="font-display text-[11px] tracking-[0.22em] uppercase text-primary">
                  Maktaba Al-Fann
                </span>
                <span
                  className="text-[17px] text-secondary/80"
                  style={{ fontFamily: "'Scheherazade New', serif", lineHeight: "1.1" }}
                >
                  مكتبة الفن
                </span>
              </Link>
              <button
                onClick={close}
                className="text-foreground hover:text-primary transition-colors focus:outline-none"
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-10 px-8">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  className={`font-display text-3xl transition-colors ${
                    isActive(href)
                      ? "text-primary"
                      : "text-foreground/65 hover:text-secondary"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="flex-shrink-0 flex flex-col items-center gap-4 px-8 py-6 border-t border-border/30">
              <Show when="signed-in">
                <p className="text-xs text-foreground/40 truncate max-w-[240px]">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-foreground/50 hover:text-destructive transition-colors"
                >
                  <LogOut size={13} /> Sign Out
                </button>
              </Show>
              <Show when="signed-out">
                <Link
                  href="/sign-in"
                  onClick={close}
                  className="font-display text-xl text-foreground hover:text-secondary transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  onClick={close}
                  className="text-xs uppercase tracking-widest text-secondary hover:text-primary transition-colors"
                >
                  Create Account
                </Link>
              </Show>
            </div>

            <div className="flex-shrink-0 py-5 text-center text-[10px] text-foreground/25 font-sans uppercase tracking-widest">
              Lahore &bull; Dubai &bull; London
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
