import { useUser } from "@/lib/auth";
import { Loader2, Building2, LogIn, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import GalleryPortal from "./gallery-portal";

export default function GalleryPortalPage() {
  const { user, isLoaded } = useUser();
  const [, navigate] = useLocation();

  // Any signed-in account can open the gallery portal (it offers to create a gallery profile).
  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Loader2 className="animate-spin text-primary w-12 h-12" />
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
                onClick={() => navigate("/sign-up?role=gallery_owner&after=/gallery-portal")}
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
    />
  );
}
