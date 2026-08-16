import { useState, useEffect, useCallback, useRef } from "react";
import { useUser, useClerk } from "@clerk/react";
import {
  Loader2, User, Image as ImageIcon, Plus, Trash2, Edit2,
  LogOut, Save, CheckCircle, Building2, Users, Palette, Settings,
  ChevronDown, ChevronUp, AlertTriangle, Clock, XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/image-uploader";

function toStorageUrl(p: string) {
  return `/api/storage${p.startsWith("/") ? p : `/${p}`}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type GalleryProfile = {
  id: number; clerkUserId: string; name: string; description: string;
  email: string; phone: string; city: string; country: string;
  websiteUrl: string; logoUrl: string; status: string;
};

type GalleryArtist = {
  id: number; name: string; style: string; photoUrl: string;
  country: string; isVerified: string; artworkCount: number;
};

type GalleryArtwork = {
  id: number; title: string; imageUrl: string;
  year: number; shortDescription: string; status: string;
  artistId: number; artistName: string; medium: string;
  theme: string; expectedPrice: number | null; displayPrice: number | null;
  artCategoryId: number; artCategory: string;
  artStyleId: number | null; artStyle: string | null;
  sizeId: number | null; size: string | null;
  techniqueId: number | null; technique: string | null;
};

type LookupOption = { id: number; name: string };
type SizeOption = { id: number; code: string; label: string };

type GalleryTab = "profile" | "artists" | "add-artwork" | "my-artworks";

// ── Constants ─────────────────────────────────────────────────────────────────
const THEMES = [
  "Landscape", "Portrait", "Abstract", "Cultural Heritage",
  "Sufism", "Mughal", "Folk Art", "Contemporary", "Still Life", "Geometric",
];

const GALLERY_MENU: { key: GalleryTab; label: string; icon: React.ReactNode }[] = [
  { key: "profile",      label: "Gallery Profile", icon: <Building2 size={14} /> },
  { key: "artists",      label: "My Artists",      icon: <Users size={14} /> },
  { key: "add-artwork",  label: "Add Artwork",      icon: <Plus size={14} /> },
  { key: "my-artworks",  label: "My Artworks",      icon: <ImageIcon size={14} /> },
];

const EMPTY_ARTIST_FORM = {
  name: "", style: "", country: "Pakistan",
  birthYear: String(new Date().getFullYear() - 30),
  gender: "", shortBio: "", biography: "",
  influences: "", websiteUrl: "", contactEmail: "",
  phone: "", photoUrl: "", additionalNotes: "",
};

type ArtistMatchResult = {
  id: number; name: string; style: string; country: string;
  photoUrl: string; contactEmail: string; phone: string;
  isVerified: string; shortBio: string;
};
const EMPTY_ARTWORK_FORM = {
  title: "", year: String(new Date().getFullYear()),
  shortDescription: "", imageUrl: "", medium: "", theme: "Cultural Heritage",
  dimensions: "", widthCm: "", heightCm: "", expectedPrice: "", tagline: "",
  // Lookup ids, held as strings because that is what <select> returns.
  artCategoryId: "", artStyleId: "", techniqueId: "", sizeId: "",
};

// ── Styling helpers ───────────────────────────────────────────────────────────
const inp  = "w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60";
const lbl  = "text-[10px] uppercase tracking-widest text-foreground/60";
const sel  = `${inp} cursor-pointer`;

// ── Main component ────────────────────────────────────────────────────────────
interface GalleryPortalProps {
  onSwitchMode?: () => void;
  hasArtistProfile?: boolean;
}

export default function GalleryPortal({ onSwitchMode, hasArtistProfile }: GalleryPortalProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();

  const [gallery, setGallery]       = useState<GalleryProfile | null | "loading">("loading");
  const [tab, setTab]               = useState<GalleryTab>("profile");
  const [artists, setArtists]       = useState<GalleryArtist[]>([]);
  const [artworks, setArtworks]     = useState<GalleryArtwork[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artworksLoading, setArtworksLoading] = useState(false);

  // ── Profile form ─────────────────────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({
    name: "", description: "", email: "", phone: "",
    city: "", country: "Pakistan", websiteUrl: "", logoUrl: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);

  // ── Add Artist form ──────────────────────────────────────────────────────
  const [showArtistForm, setShowArtistForm] = useState(false);
  const [showExtendedArtistForm, setShowExtendedArtistForm] = useState(false);
  const [artistForm, setArtistForm] = useState({ ...EMPTY_ARTIST_FORM });
  const [artistSaving, setArtistSaving] = useState(false);
  const [editingArtistId, setEditingArtistId] = useState<number | null>(null);
  const [artistMatch, setArtistMatch] = useState<ArtistMatchResult | null>(null);
  const [checkingArtist, setCheckingArtist] = useState(false);
  const artistCheckDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Add Artwork form ─────────────────────────────────────────────────────
  const [artworkForm, setArtworkForm] = useState({ ...EMPTY_ARTWORK_FORM });
  const [selectedArtistId, setSelectedArtistId] = useState<number | "">("");
  const [artworkSaving, setArtworkSaving] = useState(false);

  // Lookup tables backing the classification dropdowns.
  const [lookupCategories, setLookupCategories] = useState<LookupOption[]>([]);
  const [lookupStyles, setLookupStyles]         = useState<LookupOption[]>([]);
  const [lookupTechniques, setLookupTechniques] = useState<LookupOption[]>([]);
  const [lookupSizes, setLookupSizes]           = useState<SizeOption[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/lookup/art-categories").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/lookup/art-styles").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/lookup/techniques").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/lookup/sizes").then((r) => (r.ok ? r.json() : [])),
    ]).then(([c, st, te, si]) => {
      setLookupCategories(c);
      setLookupStyles(st);
      setLookupTechniques(te);
      setLookupSizes(si);
    }).catch(() => { /* dropdowns simply stay empty */ });
  }, []);
  const [editingArtworkId, setEditingArtworkId] = useState<number | null>(null);

  // ── Load gallery profile ─────────────────────────────────────────────────
  const loadGallery = useCallback(async () => {
    setGallery("loading");
    const res = await fetch("/api/gallery-portal/me", { credentials: "include" });
    if (res.status === 404) { setGallery(null); return; }
    if (!res.ok) { setGallery(null); return; }
    const data: GalleryProfile = await res.json();
    setGallery(data);
    setProfileForm({
      name: data.name, description: data.description,
      email: data.email, phone: data.phone, city: data.city,
      country: data.country, websiteUrl: data.websiteUrl, logoUrl: data.logoUrl,
    });
  }, []);

  const loadArtists = useCallback(async () => {
    setArtistsLoading(true);
    const res = await fetch("/api/gallery-portal/artists", { credentials: "include" });
    if (res.ok) setArtists(await res.json());
    setArtistsLoading(false);
  }, []);

  const loadArtworks = useCallback(async () => {
    setArtworksLoading(true);
    const res = await fetch("/api/gallery-portal/artworks", { credentials: "include" });
    if (res.ok) setArtworks(await res.json());
    setArtworksLoading(false);
  }, []);

  useEffect(() => { loadGallery(); }, [loadGallery]);

  useEffect(() => {
    if (gallery && gallery !== "loading") {
      loadArtists();
      loadArtworks();
    }
  }, [gallery, loadArtists, loadArtworks]);

  // ── Profile save / create ────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      toast({ title: "Gallery name is required.", variant: "destructive" });
      return;
    }
    if (!profileForm.email.trim()) {
      toast({ title: "Email is required.", variant: "destructive" });
      return;
    }
    if (!profileForm.phone.trim()) {
      toast({ title: "Phone number is required.", variant: "destructive" });
      return;
    }
    setProfileSaving(true);
    const isNew = !gallery || gallery === "loading";
    const url    = isNew ? "/api/gallery-portal/register" : "/api/gallery-portal/profile";
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    });
    if (res.ok) {
      const data: GalleryProfile = await res.json();
      setGallery(data);
      setProfileEditing(false);
      toast({ title: isNew ? "Gallery profile created." : "Gallery profile updated." });
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ title: "Error", description: d.error ?? "Could not save profile.", variant: "destructive" });
    }
    setProfileSaving(false);
  };

  // ── Start editing an existing artist ────────────────────────────────────
  const startEditArtist = async (artistId: number) => {
    setShowArtistForm(true);
    setEditingArtistId(artistId);
    setArtistMatch(null);
    try {
      const res = await fetch(`/api/gallery-portal/artists/${artistId}`, { credentials: "include" });
      if (res.ok) {
        const a = await res.json();
        setArtistForm({
          name: a.name ?? "",
          style: a.style ?? "",
          country: a.country ?? "Pakistan",
          birthYear: String(a.birthYear ?? new Date().getFullYear() - 30),
          gender: a.gender ?? "",
          shortBio: a.shortBio ?? "",
          biography: a.biography ?? "",
          influences: a.influences ?? "",
          websiteUrl: a.websiteUrl ?? "",
          contactEmail: a.contactEmail ?? "",
          phone: a.phone ?? "",
          photoUrl: a.photoUrl ?? "",
          additionalNotes: "",
        });
      }
    } catch { /* ignore */ }
  };

  const resetArtistForm = () => {
    setArtistForm({ ...EMPTY_ARTIST_FORM });
    setArtistMatch(null);
    setEditingArtistId(null);
    setShowExtendedArtistForm(false);
    setShowArtistForm(false);
  };

  // ── Artist email/phone check ─────────────────────────────────────────────
  const triggerArtistCheck = (email: string, phone: string) => {
    if (artistCheckDebounce.current) clearTimeout(artistCheckDebounce.current);
    setArtistMatch(null);
    const trimEmail = email.trim();
    const trimPhone = phone.trim();
    if (!trimEmail && !trimPhone) return;
    artistCheckDebounce.current = setTimeout(async () => {
      setCheckingArtist(true);
      try {
        const res = await fetch("/api/gallery-portal/check-artist", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimEmail, phone: trimPhone }),
        });
        if (res.ok) {
          const data = await res.json();
          setArtistMatch(data.match ? data.artist : null);
        }
      } catch { /* ignore */ }
      setCheckingArtist(false);
    }, 600);
  };

  const setArtistField = (key: string, value: string) => {
    setArtistForm((p) => {
      const next = { ...p, [key]: value };
      if (key === "contactEmail" || key === "phone") {
        triggerArtistCheck(next.contactEmail, next.phone);
      }
      return next;
    });
  };

  // ── Add / Update Artist ───────────────────────────────────────────────────
  const saveArtist = async () => {
    if (!artistForm.name.trim()) { toast({ title: "Artist name is required.", variant: "destructive" }); return; }
    if (!artistForm.style.trim()) { toast({ title: "Art style is required.", variant: "destructive" }); return; }
    if (!artistForm.contactEmail.trim()) { toast({ title: "Contact email is required.", variant: "destructive" }); return; }
    if (!artistForm.phone.trim()) { toast({ title: "Phone number is required.", variant: "destructive" }); return; }
    setArtistSaving(true);

    if (editingArtistId) {
      // Update existing artist
      const res = await fetch(`/api/gallery-portal/artists/${editingArtistId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...artistForm, birthYear: Number(artistForm.birthYear) || undefined }),
      });
      if (res.ok) {
        const updated = await res.json();
        setArtists((prev) => prev.map((a) => a.id === editingArtistId ? { ...a, ...updated } : a));
        toast({ title: "Artist profile updated." });
        resetArtistForm();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: "Error", description: d.error ?? "Could not update artist.", variant: "destructive" });
      }
    } else {
      // Add new artist
      const res = await fetch("/api/gallery-portal/artists", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...artistForm, birthYear: Number(artistForm.birthYear) || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        const wasExisting: boolean = data.wasExisting;
        setArtists((prev) => {
          const exists = prev.some((a) => a.id === data.id);
          return exists ? prev : [...prev, { ...data, artworkCount: data.artworkCount ?? 0 }];
        });
        toast({ title: wasExisting ? "Artist already exists — added to your gallery." : "Artist added to your gallery." });
        resetArtistForm();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: "Error", description: d.error ?? "Could not add artist.", variant: "destructive" });
      }
    }
    setArtistSaving(false);
  };

  const removeArtist = async (artistId: number) => {
    if (!confirm("Remove this artist from your gallery?")) return;
    const res = await fetch(`/api/gallery-portal/artists/${artistId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setArtists((prev) => prev.filter((a) => a.id !== artistId));
      toast({ title: "Artist removed from gallery." });
    }
  };

  // ── Add / Edit Artwork ───────────────────────────────────────────────────
  const resetArtworkForm = () => {
    setArtworkForm({ ...EMPTY_ARTWORK_FORM });
    setSelectedArtistId("");
    setEditingArtworkId(null);
  };

  const startEditArtwork = (aw: GalleryArtwork) => {
    setEditingArtworkId(aw.id);
    setSelectedArtistId(aw.artistId);
    setArtworkForm({
      title: aw.title, year: String(aw.year),
      shortDescription: aw.shortDescription, imageUrl: aw.imageUrl,
      medium: aw.medium ?? "", theme: aw.theme ?? "",
      dimensions: "", widthCm: "", heightCm: "",
      expectedPrice: aw.expectedPrice != null ? String(aw.expectedPrice) : "",
      tagline: "",
      artCategoryId: aw.artCategoryId != null ? String(aw.artCategoryId) : "",
      artStyleId:    aw.artStyleId    != null ? String(aw.artStyleId)    : "",
      techniqueId:   aw.techniqueId   != null ? String(aw.techniqueId)   : "",
      sizeId:        aw.sizeId        != null ? String(aw.sizeId)        : "",
    });
    setTab("add-artwork");
  };

  const saveArtwork = async () => {
    if (!artworkForm.title.trim()) { toast({ title: "Title is required.", variant: "destructive" }); return; }
    if (!selectedArtistId) { toast({ title: "Please select an artist.", variant: "destructive" }); return; }
    if (!artworkForm.shortDescription.trim()) { toast({ title: "Description is required.", variant: "destructive" }); return; }
    if (!artworkForm.artCategoryId) { toast({ title: "Please choose an art category.", variant: "destructive" }); return; }
    setArtworkSaving(true);

    const num = (v: string) => (v === "" ? null : Number(v));
    // Classification travels as lookup ids; the public price is derived on the
    // server from the artist's commission rate and is never sent from here.
    const artworkPayload = {
      title: artworkForm.title,
      shortDescription: artworkForm.shortDescription,
      imageUrl: artworkForm.imageUrl,
      medium: artworkForm.medium,
      theme: artworkForm.theme,
      dimensions: artworkForm.dimensions,
      tagline: artworkForm.tagline || null,
      year: Number(artworkForm.year),
      widthCm: num(artworkForm.widthCm),
      heightCm: num(artworkForm.heightCm),
      expectedPrice: num(artworkForm.expectedPrice),
      artCategoryId: Number(artworkForm.artCategoryId),
      artStyleId: num(artworkForm.artStyleId),
      techniqueId: num(artworkForm.techniqueId),
      sizeId: num(artworkForm.sizeId),
    };

    if (editingArtworkId) {
      // Update existing
      const res = await fetch(`/api/gallery-portal/artworks/${editingArtworkId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(artworkPayload),
      });
      if (res.ok) {
        const updated = await res.json();
        setArtworks((prev) => prev.map((a) =>
          a.id === editingArtworkId ? { ...a, ...updated, artistName: a.artistName } : a,
        ));
        toast({ title: "Artwork updated." });
        resetArtworkForm();
        setTab("my-artworks");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: "Error", description: d.error ?? "Could not update artwork.", variant: "destructive" });
      }
    } else {
      // Create / link
      const res = await fetch("/api/gallery-portal/artworks", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...artworkPayload,
          artistId: selectedArtistId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const wasExisting: boolean = data.wasExisting;
        setArtworks((prev) => {
          const exists = prev.some((a) => a.id === data.id);
          return exists ? prev : [...prev, data];
        });
        // Update artist artwork count
        setArtists((prev) =>
          prev.map((a) =>
            a.id === Number(selectedArtistId)
              ? { ...a, artworkCount: a.artworkCount + (wasExisting ? 0 : 1) }
              : a,
          ),
        );
        toast({ title: wasExisting ? "Artwork already exists — added to your gallery." : "Artwork added to your gallery." });
        resetArtworkForm();
        setTab("my-artworks");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: "Error", description: d.error ?? "Could not add artwork.", variant: "destructive" });
      }
    }
    setArtworkSaving(false);
  };

  const removeArtwork = async (id: number) => {
    if (!confirm("Remove this artwork from your gallery?")) return;
    const res = await fetch(`/api/gallery-portal/artworks/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setArtworks((prev) => prev.filter((a) => a.id !== id));
      toast({ title: "Artwork removed from gallery." });
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (gallery === "loading") {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Loader2 className="animate-spin text-primary w-12 h-12" />
      </div>
    );
  }

  // ── No gallery profile yet ───────────────────────────────────────────────
  if (!gallery) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4 py-20">
        <div className="w-full max-w-lg border border-border bg-card p-10 space-y-6">
          <div className="text-center space-y-2">
            <Building2 size={32} className="text-primary mx-auto" />
            <h1 className="font-display text-3xl text-primary">Create Your Gallery Profile</h1>
            <p className="text-sm text-foreground/50 italic">Set up your gallery to start adding artists and artworks.</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={lbl}>Gallery Name *</label>
              <input className={inp} value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Al-Fann Gallery" />
            </div>
            <div>
              <label className={lbl}>Description</label>
              <textarea className={inp} rows={3} value={profileForm.description} onChange={(e) => setProfileForm((p) => ({ ...p, description: e.target.value }))} placeholder="A brief description of your gallery…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>City</label>
                <input className={inp} value={profileForm.city} onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))} placeholder="Lahore" />
              </div>
              <div>
                <label className={lbl}>Country</label>
                <input className={inp} value={profileForm.country} onChange={(e) => setProfileForm((p) => ({ ...p, country: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Email <span className="text-destructive">*</span></label>
                <input type="email" className={inp} value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} placeholder="gallery@example.com" />
              </div>
              <div>
                <label className={lbl}>Phone <span className="text-destructive">*</span></label>
                <input className={inp} value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+92 300 0000000" />
              </div>
            </div>
            <div>
              <label className={lbl}>Website</label>
              <input className={inp} value={profileForm.websiteUrl} onChange={(e) => setProfileForm((p) => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://mygallery.pk" />
            </div>
            <div>
              <label className={lbl}>Gallery Logo</label>
              <ImageUploader
                onUploadComplete={(p) => setProfileForm((prev) => ({ ...prev, logoUrl: toStorageUrl(p) }))}
                label="Upload Logo"
              />
            </div>
          </div>
          <button
            onClick={saveProfile}
            disabled={profileSaving}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 text-[11px] uppercase tracking-widest hover:bg-primary/90 transition disabled:opacity-50"
          >
            {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
            Create Gallery Profile
          </button>
          {onSwitchMode && (
            <button onClick={onSwitchMode} className="w-full text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition py-1">
              ← Switch to Artist Portal
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Pending approval screen ──────────────────────────────────────────────
  if (gallery.status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4 py-20">
        <div className="w-full max-w-md border border-border bg-card p-10 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center mx-auto">
            <Clock size={28} className="text-amber-600" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl text-primary">Registration Submitted</h1>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Your gallery <span className="font-semibold text-foreground">{gallery.name}</span> has been submitted for review.
              Our admin team will verify your details and approve your account.
            </p>
            <p className="text-[11px] uppercase tracking-widest text-foreground/40 pt-2">
              You will be able to log in once approved.
            </p>
          </div>
          <div className="border-t border-border pt-6 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-foreground/40">Submitted details</p>
            <div className="text-left space-y-2">
              {gallery.email && <p className="text-xs text-foreground/60"><span className="text-foreground/40 uppercase tracking-widest text-[10px]">Email · </span>{gallery.email}</p>}
              {gallery.phone && <p className="text-xs text-foreground/60"><span className="text-foreground/40 uppercase tracking-widest text-[10px]">Phone · </span>{gallery.phone}</p>}
              {gallery.city && <p className="text-xs text-foreground/60"><span className="text-foreground/40 uppercase tracking-widest text-[10px]">City · </span>{gallery.city}, {gallery.country}</p>}
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition py-2 border border-border">
            <LogOut size={12} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ── Rejected screen ──────────────────────────────────────────────────────
  if (gallery.status === "rejected") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4 py-20">
        <div className="w-full max-w-md border border-border bg-card p-10 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-200 flex items-center justify-center mx-auto">
            <XCircle size={28} className="text-rose-500" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl text-primary">Registration Not Approved</h1>
            <p className="text-sm text-foreground/60 leading-relaxed">
              Unfortunately, your gallery registration for <span className="font-semibold text-foreground">{gallery.name}</span> was not approved.
              Please contact us for more information.
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition py-2 border border-border">
            <LogOut size={12} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ── Portal UI ────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background">
      {/* ─── Sidebar ─── */}
      <aside className="w-56 fixed top-16 bottom-0 left-0 z-40 bg-card border-r border-border flex flex-col">
        <div className="p-5 border-b border-border">
          {gallery.logoUrl ? (
            <img src={gallery.logoUrl} alt={gallery.name} className="w-14 h-14 object-cover border border-border mb-3" />
          ) : (
            <div className="w-14 h-14 bg-foreground/5 border border-border flex items-center justify-center mb-3">
              <Building2 size={20} className="text-foreground/30" />
            </div>
          )}
          <p className="font-display text-sm text-primary truncate">{gallery.name}</p>
          {gallery.city && <p className="text-[10px] uppercase tracking-widest text-foreground/50 truncate mt-0.5">{gallery.city}, {gallery.country}</p>}
          <span className="flex items-center gap-1 text-[10px] text-emerald-700 mt-1">
            <CheckCircle size={10} />Gallery
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {GALLERY_MENU.map(({ key, label, icon }) => (
            <button key={key}
              onClick={() => { setTab(key); if (key === "add-artwork") resetArtworkForm(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-[10px] uppercase tracking-widest transition-all rounded-none ${
                tab === key
                  ? "bg-primary/8 text-primary border-l-2 border-primary font-semibold"
                  : "text-foreground/60 hover:text-foreground hover:bg-foreground/4 border-l-2 border-transparent"
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-0.5">
          <p className="text-[10px] text-foreground/30 uppercase tracking-widest truncate px-3 mb-2">
            {user?.primaryEmailAddress?.emailAddress}
          </p>
          {onSwitchMode && hasArtistProfile && (
            <button onClick={onSwitchMode}
              className="w-full flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors px-3 py-1.5">
              <Palette size={12} />Artist Portal
            </button>
          )}
          <button onClick={() => signOut({ redirectUrl: "/" })}
            className="w-full flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/40 hover:text-destructive transition-colors px-3 py-1.5">
            <LogOut size={12} />Sign Out
          </button>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <main className="ml-56 flex-1 pt-24 pb-20 px-8 md:px-12">

        {/* ── Profile Tab ── */}
        {tab === "profile" && (
          <section className="max-w-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display text-2xl text-primary">Gallery Profile</h2>
                <div className="w-12 h-px bg-secondary mt-2" />
              </div>
              {!profileEditing && (
                <button onClick={() => setProfileEditing(true)}
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/70 hover:text-primary border border-primary/30 hover:border-primary/60 px-3 py-1.5 transition">
                  <Edit2 size={11} />Edit
                </button>
              )}
            </div>

            {profileEditing ? (
              <div className="space-y-4">
                <div>
                  <label className={lbl}>Gallery Name *</label>
                  <input className={inp} value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Description</label>
                  <textarea className={inp} rows={4} value={profileForm.description} onChange={(e) => setProfileForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>City</label><input className={inp} value={profileForm.city} onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))} /></div>
                  <div><label className={lbl}>Country</label><input className={inp} value={profileForm.country} onChange={(e) => setProfileForm((p) => ({ ...p, country: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Email <span className="text-destructive">*</span></label><input type="email" className={inp} value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} /></div>
                  <div><label className={lbl}>Phone <span className="text-destructive">*</span></label><input className={inp} value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} /></div>
                </div>
                <div>
                  <label className={lbl}>Website</label>
                  <input className={inp} value={profileForm.websiteUrl} onChange={(e) => setProfileForm((p) => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://" />
                </div>
                <div>
                  <label className={lbl}>Gallery Logo</label>
                  <ImageUploader onUploadComplete={(p) => setProfileForm((prev) => ({ ...prev, logoUrl: toStorageUrl(p) }))} label="Upload Logo" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveProfile} disabled={profileSaving}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 text-[10px] uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition">
                    {profileSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}Save
                  </button>
                  <button onClick={() => { setProfileEditing(false); setProfileForm({ name: gallery.name, description: gallery.description, email: gallery.email, phone: gallery.phone, city: gallery.city, country: gallery.country, websiteUrl: gallery.websiteUrl, logoUrl: gallery.logoUrl }); }}
                    className="px-6 py-2.5 text-[10px] uppercase tracking-widest text-foreground/50 hover:text-foreground border border-border hover:border-foreground/40 transition">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {gallery.logoUrl && <img src={gallery.logoUrl} alt={gallery.name} className="w-24 h-24 object-cover border border-border" />}
                <div className="space-y-3">
                  <Row label="Gallery Name" value={gallery.name} />
                  {gallery.description && <Row label="Description" value={gallery.description} />}
                  {gallery.city && <Row label="Location" value={`${gallery.city}, ${gallery.country}`} />}
                  {gallery.email && <Row label="Email" value={gallery.email} />}
                  {gallery.phone && <Row label="Phone" value={gallery.phone} />}
                  {gallery.websiteUrl && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-1">Website</p>
                      <a href={gallery.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{gallery.websiteUrl}</a>
                    </div>
                  )}
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-[10px] uppercase tracking-widest text-foreground/40">
                    {artists.length} artist{artists.length !== 1 ? "s" : ""} · {artworks.length} artwork{artworks.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Artists Tab ── */}
        {tab === "artists" && (
          <section>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display text-2xl text-primary">My Artists</h2>
                <div className="w-12 h-px bg-secondary mt-2" />
              </div>
              <button onClick={() => showArtistForm ? resetArtistForm() : setShowArtistForm(true)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition">
                <Plus size={11} />{showArtistForm ? "Cancel" : "Add Artist"}
              </button>
            </div>

            {/* Add Artist inline form */}
            {showArtistForm && (
              <div className="border border-border bg-card p-6 mb-8 space-y-4 max-w-2xl">
                <p className="font-display text-base text-primary">{editingArtistId ? "Edit Artist" : "Add an Artist"}</p>
                {!editingArtistId && <p className="text-[10px] text-foreground/50 uppercase tracking-widest">If the artist already exists in our database, they will be linked to your gallery without creating a duplicate.</p>}

                {/* ── Core fields ── */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className={lbl}>Artist Name *</label>
                    <input className={inp} value={artistForm.name} onChange={(e) => setArtistField("name", e.target.value)} placeholder="Full name" />
                  </div>
                  <div>
                    <label className={lbl}>Art Style *</label>
                    <input className={inp} value={artistForm.style} onChange={(e) => setArtistField("style", e.target.value)} placeholder="e.g. Miniature Painting" />
                  </div>
                  <div>
                    <label className={lbl}>Country</label>
                    <input className={inp} value={artistForm.country} onChange={(e) => setArtistField("country", e.target.value)} />
                  </div>

                  {/* Email & Phone — required, trigger existence check */}
                  <div className="col-span-2 grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className={lbl}>
                        Contact Email <span className="text-destructive">*</span>
                        {checkingArtist && <Loader2 size={10} className="inline ml-1 animate-spin text-foreground/40" />}
                      </label>
                      <input
                        type="email" className={inp}
                        value={artistForm.contactEmail}
                        onChange={(e) => setArtistField("contactEmail", e.target.value)}
                        placeholder="artist@example.com"
                      />
                    </div>
                    <div>
                      <label className={lbl}>Phone Number <span className="text-destructive">*</span></label>
                      <input
                        className={inp}
                        value={artistForm.phone}
                        onChange={(e) => setArtistField("phone", e.target.value)}
                        placeholder="+92 300 0000000"
                      />
                    </div>
                  </div>

                  {/* Artist match result */}
                  {artistMatch && (
                    <div className="col-span-2 border border-amber-300 bg-amber-50 p-4 flex gap-3 items-start">
                      <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display text-amber-800 mb-1">Artist already exists in the database</p>
                        <p className="text-xs text-amber-700 leading-relaxed mb-3">
                          This email or phone matches an existing artist. They will be linked to your gallery instead of creating a duplicate.
                        </p>
                        <div className="flex items-center gap-3 bg-white border border-amber-200 p-3">
                          {artistMatch.photoUrl ? (
                            <img src={artistMatch.photoUrl} alt={artistMatch.name} className="w-12 h-12 object-cover border border-amber-200 flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                              <User size={16} className="text-amber-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-display text-amber-900 truncate">{artistMatch.name}</p>
                            <p className="text-[10px] uppercase tracking-widest text-amber-700 mt-0.5">{artistMatch.style}</p>
                            {artistMatch.country && <p className="text-[10px] text-amber-600 mt-0.5">{artistMatch.country}</p>}
                            {artistMatch.shortBio && <p className="text-xs text-amber-700 italic mt-1 line-clamp-2">{artistMatch.shortBio}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={lbl}>Birth Year</label>
                    <input type="number" className={inp} value={artistForm.birthYear} onChange={(e) => setArtistField("birthYear", e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Gender</label>
                    <input className={inp} value={artistForm.gender} onChange={(e) => setArtistField("gender", e.target.value)} placeholder="e.g. Male / Female / Prefer not to say" />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Short Bio</label>
                    <textarea className={inp} rows={2} value={artistForm.shortBio} onChange={(e) => setArtistField("shortBio", e.target.value)} placeholder="A brief note about the artist…" />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Photo</label>
                    <ImageUploader onUploadComplete={(p) => setArtistForm((prev) => ({ ...prev, photoUrl: toStorageUrl(p) }))} label="Upload Photo" />
                  </div>
                </div>

                <button onClick={saveArtist} disabled={artistSaving}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 text-[10px] uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition">
                  {artistSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {editingArtistId ? "Save Changes" : artistMatch ? "Link Existing Artist" : "Add Artist"}
                </button>

                {/* ── Collapsible extended profile ── */}
                <div className="border border-border">
                  <button
                    type="button"
                    onClick={() => setShowExtendedArtistForm((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-[10px] uppercase tracking-widest text-foreground/60 hover:text-foreground hover:bg-foreground/3 transition-colors"
                  >
                    <span>Extended Profile Details <span className="text-foreground/30">(Optional)</span></span>
                    {showExtendedArtistForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showExtendedArtistForm && (
                    <div className="px-4 pb-5 pt-1 space-y-4 border-t border-border">
                      <p className="text-[10px] text-foreground/40 uppercase tracking-widest pt-1">
                        All fields below are optional — fill in as much as you know about this artist.
                      </p>
                      <div>
                        <label className={lbl}>Full Biography</label>
                        <textarea className={inp} rows={4} value={artistForm.biography} onChange={(e) => setArtistField("biography", e.target.value)} placeholder="The artist's story, background, and artistic journey…" />
                      </div>
                      <div>
                        <label className={lbl}>Influences</label>
                        <input className={inp} value={artistForm.influences} onChange={(e) => setArtistField("influences", e.target.value)} placeholder="Artists, movements, or traditions that shaped them" />
                      </div>
                      <div>
                        <label className={lbl}>Website / Social</label>
                        <input className={inp} value={artistForm.websiteUrl} onChange={(e) => setArtistField("websiteUrl", e.target.value)} placeholder="https://…" />
                      </div>
                      <div>
                        <label className={lbl}>Any Other Optional Details About the Artist</label>
                        <textarea className={inp} rows={3} value={artistForm.additionalNotes} onChange={(e) => setArtistField("additionalNotes", e.target.value)} placeholder="e.g. awards, exhibitions, collector notes, special remarks…" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {artistsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
            ) : artists.length === 0 ? (
              <div className="text-center py-16 text-foreground/40">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm italic">No artists yet. Add your first artist above.</p>
              </div>
            ) : (
              <div className="grid gap-4 max-w-4xl">
                {artists.map((artist) => (
                  <div key={artist.id} className="flex items-center gap-4 border border-border bg-card p-4">
                    {artist.photoUrl ? (
                      <img src={artist.photoUrl} alt={artist.name} className="w-14 h-14 object-cover border border-border flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 bg-foreground/5 border border-border flex items-center justify-center flex-shrink-0">
                        <User size={18} className="text-foreground/30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-primary truncate">{artist.name}</p>
                      <p className="text-[10px] uppercase tracking-widest text-foreground/50 mt-0.5">{artist.style}</p>
                      <p className="text-[10px] text-foreground/40 mt-0.5">
                        {artist.country} · {artist.artworkCount} artwork{artist.artworkCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditArtist(artist.id)}
                        className="text-[10px] uppercase tracking-widest text-primary/60 hover:text-primary border border-primary/20 hover:border-primary/50 px-3 py-1.5 transition flex items-center gap-1">
                        <Edit2 size={10} />Edit
                      </button>
                      <button
                        onClick={() => { setSelectedArtistId(artist.id); setTab("add-artwork"); resetArtworkForm(); setSelectedArtistId(artist.id); }}
                        className="text-[10px] uppercase tracking-widest text-primary/60 hover:text-primary border border-primary/20 hover:border-primary/50 px-3 py-1.5 transition flex items-center gap-1">
                        <Plus size={10} />Artwork
                      </button>
                      <button onClick={() => removeArtist(artist.id)}
                        className="text-[10px] text-rose-400 hover:text-rose-600 border border-rose-200 hover:border-rose-400 px-3 py-1.5 transition flex items-center gap-1">
                        <Trash2 size={10} />Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Add Artwork Tab ── */}
        {tab === "add-artwork" && (
          <section className="max-w-3xl">
            <div className="mb-8">
              <h2 className="font-display text-2xl text-primary">{editingArtworkId ? "Edit Artwork" : "Add Artwork"}</h2>
              <div className="w-12 h-px bg-secondary mt-2" />
            </div>

            {artists.length === 0 ? (
              <div className="text-center py-16 text-foreground/40 border border-border bg-card p-12">
                <Users size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm italic mb-4">Add at least one artist to your gallery first.</p>
                <button onClick={() => setTab("artists")}
                  className="text-[10px] uppercase tracking-widest text-primary hover:underline">
                  Go to My Artists →
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="p-4 border border-amber-200 bg-amber-50 text-amber-800 text-[11px] uppercase tracking-widest">
                  If an artwork with the same title already exists for the selected artist, it will be linked to your gallery without creating a duplicate.
                </div>

                {/* Artist selector */}
                <div>
                  <label className={lbl}>Artist *</label>
                  <select className={sel} value={selectedArtistId}
                    onChange={(e) => setSelectedArtistId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">— Select artist —</option>
                    {artists.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Artwork fields */}
                <div>
                  <label className={lbl}>Title *</label>
                  <input className={inp} value={artworkForm.title} onChange={(e) => setArtworkForm((p) => ({ ...p, title: e.target.value }))} placeholder="Artwork title" />
                </div>
                <div>
                  <label className={lbl}>Short Description *</label>
                  <textarea className={inp} rows={3} value={artworkForm.shortDescription} onChange={(e) => setArtworkForm((p) => ({ ...p, shortDescription: e.target.value }))} placeholder="Brief description of the artwork…" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Art Category *</label>
                    <select className={sel} value={artworkForm.artCategoryId} onChange={(e) => setArtworkForm((p) => ({ ...p, artCategoryId: e.target.value }))} required>
                      <option value="">— Select —</option>
                      {lookupCategories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Art Style</label>
                    <select className={sel} value={artworkForm.artStyleId} onChange={(e) => setArtworkForm((p) => ({ ...p, artStyleId: e.target.value }))}>
                      <option value="">— Select —</option>
                      {lookupStyles.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Technique</label>
                    <select className={sel} value={artworkForm.techniqueId} onChange={(e) => setArtworkForm((p) => ({ ...p, techniqueId: e.target.value }))}>
                      <option value="">— Select —</option>
                      {lookupTechniques.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Size</label>
                    <select className={sel} value={artworkForm.sizeId} onChange={(e) => setArtworkForm((p) => ({ ...p, sizeId: e.target.value }))}>
                      <option value="">— Select —</option>
                      {lookupSizes.map((s) => <option key={s.id} value={String(s.id)}>{s.code} — {s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Year</label>
                    <input type="number" className={inp} value={artworkForm.year} onChange={(e) => setArtworkForm((p) => ({ ...p, year: e.target.value }))} />
                  </div>
                  <div>
                    <label className={lbl}>Medium</label>
                    <input className={inp} value={artworkForm.medium} onChange={(e) => setArtworkForm((p) => ({ ...p, medium: e.target.value }))} placeholder="e.g. Oil on canvas" />
                  </div>
                  <div>
                    <label className={lbl}>Theme</label>
                    <select className={sel} value={artworkForm.theme} onChange={(e) => setArtworkForm((p) => ({ ...p, theme: e.target.value }))}>
                      {THEMES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Width (cm)</label>
                    <input type="number" className={inp} value={artworkForm.widthCm} onChange={(e) => setArtworkForm((p) => ({ ...p, widthCm: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div>
                    <label className={lbl}>Height (cm)</label>
                    <input type="number" className={inp} value={artworkForm.heightCm} onChange={(e) => setArtworkForm((p) => ({ ...p, heightCm: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Expected Price (PKR)</label>
                    <input type="number" className={inp} value={artworkForm.expectedPrice} onChange={(e) => setArtworkForm((p) => ({ ...p, expectedPrice: e.target.value }))} placeholder="Optional" />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Artwork Image</label>
                  <ImageUploader onUploadComplete={(p) => setArtworkForm((prev) => ({ ...prev, imageUrl: toStorageUrl(p) }))} label="Upload Artwork Image" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={saveArtwork} disabled={artworkSaving}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 text-[10px] uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition">
                    {artworkSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {editingArtworkId ? "Update Artwork" : "Add to Gallery"}
                  </button>
                  {editingArtworkId && (
                    <button onClick={() => { resetArtworkForm(); setTab("my-artworks"); }}
                      className="px-6 py-2.5 text-[10px] uppercase tracking-widest text-foreground/50 hover:text-foreground border border-border hover:border-foreground/40 transition">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── My Artworks Tab ── */}
        {tab === "my-artworks" && (
          <section>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display text-2xl text-primary">My Artworks</h2>
                <div className="w-12 h-px bg-secondary mt-2" />
              </div>
              <button onClick={() => { resetArtworkForm(); setTab("add-artwork"); }}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition">
                <Plus size={11} />Add Artwork
              </button>
            </div>

            {artworksLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
            ) : artworks.length === 0 ? (
              <div className="text-center py-16 text-foreground/40">
                <ImageIcon size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm italic">No artworks yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {artworks.map((aw) => (
                  <div key={aw.id} className="border border-border bg-card group relative overflow-hidden">
                    {aw.imageUrl ? (
                      <img src={aw.imageUrl} alt={aw.title} className="w-full aspect-[4/3] object-cover" />
                    ) : (
                      <div className="w-full aspect-[4/3] bg-foreground/5 flex items-center justify-center">
                        <ImageIcon size={24} className="text-foreground/20" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="font-display text-sm text-primary truncate">{aw.title}</p>
                      <p className="text-[10px] uppercase tracking-widest text-foreground/50 mt-0.5 truncate">{aw.artistName}</p>
                      <p className="text-[10px] text-foreground/40 mt-0.5">{[aw.artCategory, aw.artStyle].filter(Boolean).join(" · ")} · {aw.year}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => startEditArtwork(aw)}
                          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-primary/60 hover:text-primary border border-primary/20 hover:border-primary/50 px-2 py-1 transition">
                          <Edit2 size={9} />Edit
                        </button>
                        <button onClick={() => removeArtwork(aw.id)}
                          className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-600 border border-rose-200 hover:border-rose-400 px-2 py-1 transition">
                          <Trash2 size={9} />Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// ── Tiny helper ───────────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-1">{label}</p>
      <p className="text-sm text-foreground/80">{value}</p>
    </div>
  );
}
