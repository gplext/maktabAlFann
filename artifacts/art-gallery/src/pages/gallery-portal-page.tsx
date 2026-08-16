import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { Loader2, Building2, LogIn, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import GalleryPortal from "./gallery-portal";

export default function GalleryPortalPage() {
  const { user, isLoaded } = useUser();
  const [, navigate] = useLocation();

  const [artistChecked, setArtistChecked] = useState(false);
  const [isArtistUser, setIsArtistUser]   = useState(false);
  const [galleryChecked, setGalleryChecked] = useState(false);
  const [isGalleryUser, setIsGalleryUser]   = useState(false);

  useEffect(() => {
    if (!user) { setArtistChecked(true); setGalleryChecked(true); return; }
    // Check artist profile
    fetch("/api/artist-portal/me", { credentials: "include" })
      .then((r) => { if (r.ok) { setIsArtistUser(true); navigate("/artist-portal", { replace: true }); } })
      .catch(() => {})
      .finally(() => setArtistChecked(true));
    // Check gallery profile
    fetch("/api/gallery-portal/me", { credentials: "include" })
      .then((r) => { if (r.ok) setIsGalleryUser(true); })
      .catch(() => {})
      .finally(() => setGalleryChecked(true));
  }, [user?.id, navigate]);

  // Still loading Clerk or waiting for profile checks
  if (!isLoaded || (user && (!artistChecked || !galleryChecked)) || isArtistUser) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Loader2 className="animate-spin text-primary w-12 h-12" />
      </div>
    );
  }

  // Signed in but not a gallery (or artist) user — collector account
  if (user && !isGalleryUser) {
    return (
      <div className="flex flex-col items-center mt-[4.5rem] px-4 bg-background py-16 min-h-[calc(100dvh-4.5rem)]">
        <div className="w-full max-w-md">
          <button onClick={() => navigate("/portals")}
            className="text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors mb-8 flex items-center gap-1.5">
            ← Portals
          </button>
          <div className="border border-border bg-card p-10 flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 border border-border bg-foreground/5 flex items-center justify-center">
              <Building2 size={28} className="text-foreground/30" />
            </div>
            <div>
              <h2 className="font-display text-2xl text-primary mb-2">Gallery Access Only</h2>
              <div className="w-16 h-px bg-border mx-auto mb-3" />
              <p className="text-sm text-foreground/50 italic leading-relaxed">
                This portal is reserved for gallery managers. Your account is registered as a collector.
              </p>
            </div>
            <button
              onClick={() => navigate("/collector")}
              className="w-full font-display uppercase tracking-widest bg-primary text-primary-foreground py-3.5 hover:bg-primary/90 transition-colors">
              Go to My Collection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not signed in — prompt to sign in via gallery flow
  if (!user) {
    return (
      <div className="flex flex-col items-center mt-[4.5rem] px-4 bg-background py-16 min-h-[calc(100dvh-4.5rem)]">
        <div className="w-full max-w-md">
          <button onClick={() => navigate("/portals")}
            className="text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors mb-8 flex items-center gap-1.5">
            ← Portals
          </button>
          <div className="border border-secondary/40 bg-card p-10 flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 border border-secondary/40 bg-secondary/10 flex items-center justify-center">
              <Building2 size={28} className="text-secondary" />
            </div>
            <div>
              <h2 className="font-display text-3xl text-primary mb-2">Gallery Portal</h2>
              <div className="w-16 h-px bg-secondary mx-auto mb-3" />
              <p className="text-sm text-foreground/50 italic leading-relaxed">
                Sign in to manage your gallery, add artists, and submit artworks on their behalf.
              </p>
            </div>
            <div className="w-full space-y-3">
              <button
                onClick={() => navigate("/sign-in?after=/gallery-portal")}
                className="w-full font-display uppercase tracking-widest bg-secondary text-secondary-foreground py-4 hover:bg-secondary/90 transition-colors flex items-center justify-center gap-2"
              >
                <LogIn size={15} />Sign In as Gallery
              </button>
              <button
                onClick={() => navigate("/sign-up?after=/gallery-portal")}
                className="w-full text-[11px] uppercase tracking-widest text-foreground/50 hover:text-foreground/80 border border-border py-3 transition-colors bg-background flex items-center justify-center gap-2"
              >
                <UserPlus size={13} />New here? Create a gallery account
              </button>
            </div>
            <p className="text-[10px] text-foreground/30 uppercase tracking-widest italic">
              After signing in, your gallery dashboard will open automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Signed in as a gallery user — render the full gallery portal
  return (
    <GalleryPortal
      onSwitchMode={() => navigate("/artist-portal")}
    />
  );
}
