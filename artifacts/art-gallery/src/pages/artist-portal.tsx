import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useUser, useClerk, Show } from "@clerk/react";
import {
  Loader2, User, Image as ImageIcon, Plus, Trash2, Edit2, ExternalLink,
  CheckCircle, Clock, XCircle, BarChart3, LogOut, Save, Upload,
  X as XIcon, Tag, DollarSign, TrendingUp, Settings, KeyRound, Eye, EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/money";
import { ImageUploader } from "@/components/image-uploader";
type LookupItem = { id: number; name: string };
type SizeItem   = { id: number; code: string; label: string; description: string };

type ArtistProfile = {
  defaultCommissionRate?: number;
  id: number; name: string; style: string; shortBio: string;
  photoUrl: string; isVerified: string; country: string;
  biography: string; influences: string; awards: string;
  exhibitions: string; contactEmail: string; websiteUrl: string;
  birthYear: number; gender: string;
  saying: string; sayingAuthor: string;
};

type PortalArtwork = {
  id: number; title: string; imageUrl: string; status: string;
  year: number; shortDescription: string; theme: string;
  medium: string; dimensions: string | null; tagline: string | null;
  widthCm: number | null; heightCm: number | null;
  tags: string[];
  frameIncluded: boolean; frameDescription: string | null;
  expectedPrice: number | null; displayPrice: number | null;

  // Classification is stored as lookup ids; the API also returns the resolved
  // names so a list can render without loading the lookup tables.
  artCategoryId: number; artCategory: string;
  artStyleId: number | null; artStyle: string | null;
  sizeId: number | null; size: string | null;
  techniqueId: number | null; technique: string | null;
  /** @deprecated Alias of artStyle. */
  artType?: string | null;
};

type CommissionRecord = {
  id: number; artworkTitle: string; salePrice: number;
  commissionRate: number; commissionAmount: number;
  artistEarning: number; currency: string; status: string;
  notes: string; createdAt: string;
};

type EarningsData = {
  total: number; published: number; pending: number;
  rejected: number; enquiryCount: number;
  purchaseCount: number; totalEarning: number;
  totalSalePrice: number; totalCommission: number;
  currency: string; defaultCommissionRate: number;
  commissions: CommissionRecord[];
};

type PortalTab = "details" | "add-artwork" | "my-artworks" | "earnings" | "settings";

const THEMES = [
  "Landscape", "Portrait", "Abstract", "Cultural Heritage",
  "Sufism", "Mughal", "Folk Art", "Contemporary", "Still Life", "Geometric",
];

const MENU: { key: PortalTab; label: string; icon: React.ReactNode }[] = [
  { key: "details",     label: "My Details",  icon: <User size={14} /> },
  { key: "add-artwork", label: "Add Artwork",  icon: <Plus size={14} /> },
  { key: "my-artworks", label: "My Artworks", icon: <ImageIcon size={14} /> },
  { key: "earnings",    label: "Earnings",    icon: <BarChart3 size={14} /> },
  { key: "settings",    label: "Settings",    icon: <Settings size={14} /> },
];

function VerifiedBadge({ status }: { status: string }) {
  if (status === "approved" || status === "verified") return <span className="flex items-center gap-1 text-[10px] text-emerald-700 mt-1"><CheckCircle size={10} />Verified</span>;
  if (status === "pending")  return <span className="flex items-center gap-1 text-[10px] text-amber-700 mt-1"><Clock size={10} />Pending Verification</span>;
  if (status === "flagged")  return <span className="flex items-center gap-1 text-[10px] text-amber-700 mt-1"><Clock size={10} />Under Review</span>;
  return null;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    pending:  { label: "Pending",   icon: <Clock size={11} />,       cls: "text-amber-700 bg-amber-50 border-amber-200" },
    approved: { label: "Published", icon: <CheckCircle size={11} />, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    rejected: { label: "Rejected",  icon: <XCircle size={11} />,     cls: "text-rose-700 bg-rose-50 border-rose-200" },
  };
  const { label, icon, cls } = map[status] ?? map.pending;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] border uppercase tracking-widest ${cls}`}>{icon}{label}</span>;
}

/**
 * Select values are held as strings because that is what a <select> gives back;
 * they are converted to numbers on submit. Empty string means "not chosen".
 */
const EMPTY_ARTWORK_FORM = {
  title: "", theme: "Cultural Heritage",
  year: String(new Date().getFullYear()),
  shortDescription: "", medium: "", dimensions: "",
  tagline: "", widthCm: "", heightCm: "",
  frameDescription: "", expectedPrice: "",
  // lookup ids
  artCategoryId: "", artStyleId: "", sizeId: "", techniqueId: "",
};

const inputCls  = "w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60";
const labelCls  = "text-[10px] uppercase tracking-widest text-foreground/60";
const selectCls = `${inputCls} cursor-pointer`;

// ── Signed-out portal — artist only ──────────────────────────────────────────
function SignedOutPortal() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [nameInput, setNameInput]           = useState("");
  const [nameChecking, setNameChecking]     = useState(false);
  const [nameMatch, setNameMatch]           = useState<boolean | null>(null);
  const [nameAlreadyClaimed, setNameAlreadyClaimed] = useState(false);
  const [emailInput, setEmailInput]         = useState("");
  const [phoneInput, setPhoneInput]         = useState("");
  const [verifying, setVerifying]           = useState(false);
  const [recordFound, setRecordFound]       = useState<boolean | null>(null);
  const [message, setMessage]               = useState("Merge my record, I am the primary artist");
  const [submitting, setSubmitting]         = useState(false);
  const [submitted, setSubmitted]           = useState(false);

  const checkName = async () => {
    const name = nameInput.trim();
    if (!name) return;
    setNameChecking(true);
    setNameMatch(null);
    setNameAlreadyClaimed(false);
    setRecordFound(null);
    try {
      const r = await fetch("/api/artist-portal/check-name", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await r.json();
      setNameMatch(data.match === true);
      setNameAlreadyClaimed(data.alreadyClaimed === true);
    } catch { setNameMatch(false); }
    setNameChecking(false);
  };

  const verifyRecord = async () => {
    setVerifying(true);
    setRecordFound(null);
    try {
      const r = await fetch("/api/artist-portal/verify-record", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim(), email: emailInput.trim(), phone: phoneInput.trim() }),
      });
      const data = await r.json();
      setRecordFound(data.recordFound === true);
    } catch { setRecordFound(false); }
    setVerifying(false);
  };

  const submitMerge = async () => {
    setSubmitting(true);
    try {
      const r = await fetch("/api/artist-portal/merge-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim(), email: emailInput.trim(), phone: phoneInput.trim(), message }),
      });
      if (r.ok) { setSubmitted(true); }
      else { const d = await r.json(); toast({ title: "Error", description: d.error ?? "Could not submit request", variant: "destructive" }); }
    } catch { toast({ title: "Error", description: "Network error", variant: "destructive" }); }
    setSubmitting(false);
  };

  const inp = "w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60";
  const lbl = "text-[10px] uppercase tracking-widest text-foreground/60 mb-1.5 block";

  // ── Artist portal — sign-in / name-check / merge-request flow ───────────────
  return (
    <div className="flex flex-col items-center mt-[4.5rem] gap-8 px-4 bg-background py-16 min-h-[calc(100dvh-4.5rem)]">
      <div className="w-full max-w-md">
        <button onClick={() => navigate("/portals")}
          className="text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors mb-8 flex items-center gap-1.5">
          ← Portals
        </button>
      </div>

      <div className="text-center">
        <div className="w-16 h-16 border border-primary/20 bg-primary/5 flex items-center justify-center mx-auto mb-5">
          <User size={28} className="text-primary/70" />
        </div>
        <h2 className="font-display text-3xl text-primary mb-2">Artist Portal</h2>
        <div className="w-16 h-px bg-secondary mx-auto mb-3" />
        <p className="text-foreground/60 italic max-w-sm text-sm mx-auto">
          Sign in with your artist account, or check your name to request access.
        </p>
      </div>

      {/* Sign In */}
      <div className="flex flex-col items-center gap-3 w-full max-w-md">
        <Link href="/sign-in"
          className="block w-full text-center font-display uppercase tracking-widest bg-primary text-primary-foreground px-12 py-4 hover:bg-primary/90 transition-colors">
          Artist Sign In
        </Link>
        <Link href="/sign-up"
          className="text-xs uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors">
          Create account
        </Link>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 w-full max-w-md">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] uppercase tracking-widest text-foreground/30">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Step 1 — name check */}
      {!submitted && (
        <div className="w-full max-w-md space-y-5 text-center">
          <div>
            <label className={lbl}>Kindly check your name</label>
            <p className="text-[10px] text-foreground/40 italic mb-2">Enter your full name exactly as registered (e.g. Ahmad Raza Khan)</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter your full name"
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); setNameMatch(null); setNameAlreadyClaimed(false); setRecordFound(null); }}
                onKeyDown={(e) => e.key === "Enter" && checkName()}
                className={inp}
              />
              <button
                onClick={checkName}
                disabled={nameChecking || !nameInput.trim()}
                className="font-display uppercase tracking-widest text-xs bg-primary text-primary-foreground px-5 py-3 hover:bg-primary/90 transition-colors disabled:opacity-50 flex-shrink-0">
                {nameChecking ? <Loader2 size={14} className="animate-spin" /> : "Check"}
              </button>
            </div>
            {nameMatch === false && !nameAlreadyClaimed && (
              <p className="text-xs text-foreground/50 mt-2 italic">No artist record found with that name. Please ensure you enter your full name exactly as registered.</p>
            )}
            {nameMatch === false && nameAlreadyClaimed && (
              <div className="mt-2 border border-border bg-card px-4 py-3 text-left space-y-2">
                <p className="text-xs text-foreground/70">This artist already has an account set up.</p>
                <p className="text-xs text-foreground/50">Please sign in using your email and password.</p>
                <Link href="/sign-in"
                  className="inline-block text-xs uppercase tracking-widest text-primary border border-primary/40 px-4 py-2 hover:bg-primary/5 transition-colors mt-1">
                  Sign In
                </Link>
              </div>
            )}
          </div>

          {/* Step 2 — email + phone */}
          {nameMatch === true && (
            <div className="border border-border bg-card p-5 space-y-4">
              <p className="text-sm text-foreground/70 italic">Confirm your identity with email or phone.</p>
              <p className="text-[10px] text-foreground/40 uppercase tracking-widest">Either one can verify your record.</p>
              <div className="space-y-3 text-left">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-foreground/60 mb-1.5 block">Email</label>
                  <input type="email" placeholder="your@email.com" value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setRecordFound(null); }}
                    className={inp} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-foreground/60 mb-1.5 block">Phone</label>
                  <input type="tel" placeholder="+92 300 000 0000" value={phoneInput}
                    onChange={(e) => { setPhoneInput(e.target.value); setRecordFound(null); }}
                    className={inp} />
                </div>
              </div>
              <button
                onClick={verifyRecord}
                disabled={verifying || (!emailInput.trim() && !phoneInput.trim())}
                className="w-full font-display uppercase tracking-widest text-xs border border-primary text-primary py-3 hover:bg-primary/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {verifying ? <><Loader2 size={14} className="animate-spin" />Verifying…</> : "Verify Record"}
              </button>
              {recordFound === false && (
                <p className="text-xs text-foreground/50 italic text-center">
                  Neither email nor phone matched the record on file. Please contact us directly.
                </p>
              )}
            </div>
          )}

          {/* Step 3 — message + submit */}
          {recordFound === true && (
            <div className="border border-border bg-card p-5 space-y-4">
              <p className="text-sm text-foreground/70 italic">
                Identity verified. Write a message to our admin and submit your request.
              </p>
              <div>
                <label className={lbl}>Message to Admin</label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none"
                />
              </div>
              <button
                onClick={submitMerge}
                disabled={submitting || !message.trim()}
                className="w-full font-display uppercase tracking-widest text-sm bg-primary text-primary-foreground py-3.5 hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <><Loader2 size={15} className="animate-spin" />Submitting…</> : "Submit Request to Admin"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success */}
      {submitted && (
        <div className="w-full max-w-md border border-border bg-card p-8 text-center space-y-3">
          <CheckCircle size={32} className="text-emerald-600 mx-auto" />
          <p className="font-display text-lg text-primary">Request Submitted</p>
          <p className="text-sm text-foreground/60 italic leading-relaxed">
            Your merge request has been sent to our admin team. Once verified, they will contact you directly with your account credentials.
          </p>
        </div>
      )}

      <p className="text-xs text-foreground/30 uppercase tracking-widest italic">
        Artists can also buy as collectors — one account, both worlds.
      </p>
    </div>
  );
}

export default function ArtistPortal() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // ── Gallery redirect: if this Clerk user has a gallery profile, send them there
  const [galleryChecked, setGalleryChecked] = useState(false);
  const [isGalleryUser, setIsGalleryUser] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/gallery-portal/me", { credentials: "include" })
      .then((r) => {
        if (r.ok) { setIsGalleryUser(true); navigate("/gallery-portal", { replace: true }); }
      })
      .catch(() => {})
      .finally(() => setGalleryChecked(true));
  }, [user?.id, navigate]);

  const [tab, setTab] = useState<PortalTab>("details");
  const [profile, setProfile] = useState<ArtistProfile | null | "loading">("loading");
  const [pendingClaim, setPendingClaim] = useState<{ status: string; createdAt: string } | null>(null);

  const [profileForm, setProfileForm]   = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl]         = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [artworks, setArtworks]               = useState<PortalArtwork[]>([]);
  const [artworksLoading, setArtworksLoading] = useState(false);
  const [artworkForm, setArtworkForm]         = useState<Record<string, string>>(EMPTY_ARTWORK_FORM);
  const [artworkImageUrl, setArtworkImageUrl] = useState("");
  const [artworkTags, setArtworkTags]         = useState<string[]>([]);
  const [tagInput, setTagInput]               = useState("");
  const [frameIncluded, setFrameIncluded]     = useState(false);
  const [editingArtworkId, setEditingArtworkId] = useState<number | null>(null);
  const [artworkSaving, setArtworkSaving]     = useState(false);

  const [earnings, setEarnings]             = useState<EarningsData | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);

  const [pwCurrent, setPwCurrent]     = useState("");
  const [pwNew, setPwNew]             = useState("");
  const [pwConfirm, setPwConfirm]     = useState("");
  const [pwSaving, setPwSaving]       = useState(false);
  const [pwShowCurrent, setPwShowCurrent] = useState(false);
  const [pwShowNew, setPwShowNew]     = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);

  const [allTags, setAllTags]                       = useState<string[]>([]);
  const [tagSuggestOpen, setTagSuggestOpen]         = useState(false);
  const tagWrapRef                                  = useRef<HTMLDivElement>(null);

  const [storageLocations, setStorageLocations]     = useState<LookupItem[]>([]);
  const [supplierLocId, setSupplierLocId]           = useState<number | "">("");
  const [supplierForm, setSupplierForm]             = useState({ contactPerson: "", phone1: "", phone2: "", email: "", address: "", city: "", googleMap: "" });

  const [lookupMediums, setLookupMediums]           = useState<LookupItem[]>([]);
  const [lookupArtCategories, setLookupArtCategories] = useState<LookupItem[]>([]);
  const [lookupArtStyles, setLookupArtStyles]       = useState<LookupItem[]>([]);
  const [lookupTechniques, setLookupTechniques]     = useState<LookupItem[]>([]);
  const [lookupSizes, setLookupSizes]               = useState<SizeItem[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/lookup/mediums").then((r)        => r.ok ? r.json() : []),
      fetch("/api/lookup/art-categories").then((r) => r.ok ? r.json() : []),
      fetch("/api/lookup/art-styles").then((r)     => r.ok ? r.json() : []),
      fetch("/api/lookup/techniques").then((r)     => r.ok ? r.json() : []),
      fetch("/api/lookup/sizes").then((r)          => r.ok ? r.json() : []),
      fetch("/api/lookup/tags").then((r)                    => r.ok ? r.json() : []),
      fetch("/api/lookup/storage-locations").then((r)       => r.ok ? r.json() : []),
    ]).then(([m, ac, as_, te, si, tg, sl]) => {
      setLookupMediums(m);
      setLookupArtCategories(ac);
      setLookupArtStyles(as_);
      setLookupTechniques(te);
      setLookupSizes(si);
      setAllTags((tg as LookupItem[]).map((t) => t.name));
      setStorageLocations(sl as LookupItem[]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagWrapRef.current && !tagWrapRef.current.contains(e.target as Node)) {
        setTagSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadArtworks = useCallback(async () => {
    setArtworksLoading(true);
    const r = await fetch("/api/artist-portal/artworks", { credentials: "include" });
    if (r.ok) setArtworks(await r.json());
    setArtworksLoading(false);
  }, []);

  const loadEarnings = useCallback(async () => {
    if (earnings) return;
    setEarningsLoading(true);
    const r = await fetch("/api/artist-portal/earnings", { credentials: "include" });
    if (r.ok) setEarnings(await r.json());
    setEarningsLoading(false);
  }, [earnings]);

  useEffect(() => {
    if (!user) return; // wait for Clerk session to be fully ready
    fetch("/api/artist-portal/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((artistData: ArtistProfile | null) => {
        setProfile(artistData);
        if (artistData) {
          const f: Record<string, string> = {};
          for (const k of [
            "name","style","country","birthYear","gender","shortBio",
            "biography","influences","awards","exhibitions",
            "contactEmail","websiteUrl","saying","sayingAuthor",
          ]) {
            f[k] = String((artistData as any)[k] ?? "");
          }
          setProfileForm(f);
          setPhotoUrl(artistData.photoUrl ?? "");
          loadArtworks();
        } else {
          fetch("/api/artist-portal/my-claim", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((claim) => { if (claim) setPendingClaim(claim); })
            .catch(() => {});
        }
      })
      .catch(() => { setProfile(null); });
  }, [user?.id, loadArtworks]);

  useEffect(() => {
    if (tab === "earnings" && profile && profile !== null) loadEarnings();
    if (tab === "my-artworks" && artworks.length === 0 && profile) loadArtworks();
  }, [tab, profile, artworks.length, loadArtworks, loadEarnings]);

  const setPF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setProfileForm((f) => ({ ...f, [k]: e.target.value }));

  const changePassword = async () => {
    if (!pwNew || !pwConfirm) {
      toast({ title: "Please fill in all password fields.", variant: "destructive" }); return;
    }
    if (pwNew !== pwConfirm) {
      toast({ title: "New passwords do not match.", variant: "destructive" }); return;
    }
    if (pwNew.length < 8) {
      toast({ title: "Password must be at least 8 characters.", variant: "destructive" }); return;
    }
    setPwSaving(true);
    try {
      await user?.updatePassword({ currentPassword: pwCurrent, newPassword: pwNew });
      toast({ title: "Password updated successfully." });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.message ?? "Could not update password.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setPwSaving(false);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    const isNew = !profile;
    const url    = isNew ? "/api/artist-portal/register" : "/api/artist-portal/profile";
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profileForm, photoUrl }),
    });
    setProfileSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setProfile(updated);
      toast({ title: isNew ? "Profile created! Welcome to the gallery." : "Profile updated." });
      if (isNew) { loadArtworks(); setTab("my-artworks"); }
    } else {
      const d = await res.json();
      toast({ title: "Error", description: d.error ?? "Could not save profile", variant: "destructive" });
    }
  };

  const setAF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setArtworkForm((f) => ({ ...f, [k]: e.target.value }));

  const resetArtworkForm = () => {
    setArtworkForm(EMPTY_ARTWORK_FORM);
    setArtworkImageUrl("");
    setArtworkTags([]);
    setTagInput("");
    setFrameIncluded(false);
    setSupplierLocId("");
    setSupplierForm({ contactPerson: "", phone1: "", phone2: "", email: "", address: "", city: "", googleMap: "" });
    setEditingArtworkId(null);
  };

  const normalizeTag = (raw: string) => raw.trim().toLowerCase();

  const addTag = (raw?: string) => {
    const t = normalizeTag(raw ?? tagInput);
    if (t && !artworkTags.map(normalizeTag).includes(t)) {
      setArtworkTags((prev) => [...prev, t]);
      if (!allTags.includes(t)) setAllTags((prev) => [...prev, t]);
    }
    setTagInput("");
    setTagSuggestOpen(false);
  };

  /** The artist's own rate, so the price preview matches what the server derives. */
  const commissionRate =
    (profile && profile !== "loading" ? profile.defaultCommissionRate : undefined) ?? 30;

  const removeTag = (tag: string) => setArtworkTags((prev) => prev.filter((t) => t !== tag));

  const editArtwork = (art: PortalArtwork) => {
    setEditingArtworkId(art.id);
    setArtworkForm({
      title: art.title, theme: art.theme,
      year: String(art.year), shortDescription: art.shortDescription,
      medium: art.medium ?? "", dimensions: art.dimensions ?? "",
      tagline: art.tagline ?? "",
      widthCm:  art.widthCm  ? String(art.widthCm)  : "",
      heightCm: art.heightCm ? String(art.heightCm) : "",
      frameDescription: art.frameDescription ?? "",
      expectedPrice: art.expectedPrice != null ? String(art.expectedPrice) : "",
      artCategoryId: art.artCategoryId != null ? String(art.artCategoryId) : "",
      artStyleId:    art.artStyleId    != null ? String(art.artStyleId)    : "",
      sizeId:        art.sizeId        != null ? String(art.sizeId)        : "",
      techniqueId:   art.techniqueId   != null ? String(art.techniqueId)   : "",
    });
    setFrameIncluded(art.frameIncluded ?? false);
    setArtworkTags(art.tags ?? []);
    setArtworkImageUrl(art.imageUrl);
    setTab("add-artwork");
  };

  const saveArtwork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artworkImageUrl) { toast({ title: "Please upload an image first.", variant: "destructive" }); return; }
    if (!artworkForm.artCategoryId) { toast({ title: "Please choose an art category.", variant: "destructive" }); return; }
    setArtworkSaving(true);
    const url    = editingArtworkId ? `/api/artist-portal/artworks/${editingArtworkId}` : "/api/artist-portal/artworks";
    const method = editingArtworkId ? "PATCH" : "POST";
    const num = (v: string) => (v === "" ? null : Number(v));
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: artworkForm.title,
        theme: artworkForm.theme,
        medium: artworkForm.medium,
        dimensions: artworkForm.dimensions,
        tagline: artworkForm.tagline || null,
        shortDescription: artworkForm.shortDescription,
        imageUrl: artworkImageUrl,
        year:          Number(artworkForm.year),
        widthCm:       num(artworkForm.widthCm),
        heightCm:      num(artworkForm.heightCm),
        // The artist states what they expect to receive. The public price is
        // derived server-side from their commission rate — it is deliberately
        // not sent from here.
        expectedPrice: num(artworkForm.expectedPrice),
        artCategoryId: Number(artworkForm.artCategoryId),
        artStyleId:    num(artworkForm.artStyleId),
        sizeId:        num(artworkForm.sizeId),
        techniqueId:   num(artworkForm.techniqueId),
        tags: artworkTags,
        frameIncluded,
        frameDescription: frameIncluded ? (artworkForm.frameDescription || null) : null,
      }),
    });
    setArtworkSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Could not save", description: body.error ?? "Please check the form.", variant: "destructive" });
      return;
    }
    if (res.ok) {
      const saved = await res.json();
      if (supplierLocId !== "") {
        const companyLoc = storageLocations.find((l) => l.name.toLowerCase() === "company warehouse");
        const isCompany = companyLoc && Number(supplierLocId) === companyLoc.id;
        await fetch(`/api/artist-portal/artworks/${saved.id}/supplier`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageLocationId: Number(supplierLocId),
            ...(isCompany ? {} : supplierForm),
          }),
        });
      }
      toast({ title: editingArtworkId ? "Artwork updated — pending review." : "Artwork submitted for review!" });
      resetArtworkForm();
      loadArtworks();
      setTab("my-artworks");
    } else {
      const d = await res.json();
      toast({ title: "Error", description: d.error ?? "Submission failed", variant: "destructive" });
    }
  };

  const deleteArtwork = async (id: number) => {
    if (!confirm("Remove this artwork?")) return;
    const res = await fetch(`/api/artist-portal/artworks/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { setArtworks((prev) => prev.filter((a) => a.id !== id)); toast({ title: "Artwork removed." }); }
  };

  const approved = artworks.filter((a) => a.status === "approved");
  const pending  = artworks.filter((a) => a.status === "pending");

  return (
    <>
      <Show when="signed-out">
        <SignedOutPortal />
      </Show>

      <Show when="signed-in">
        {(!galleryChecked || isGalleryUser || profile === "loading") ? (
          <div className="flex justify-center items-center min-h-screen bg-background">
            <Loader2 className="animate-spin text-primary w-12 h-12" />
          </div>
        ) : profile === null && !pendingClaim && !isGalleryUser ? (
          /* ── Collector account — no artist or gallery access ── */
          <div className="flex flex-col items-center mt-[4.5rem] px-4 bg-background py-16 min-h-[calc(100dvh-4.5rem)]">
            <div className="w-full max-w-md">
              <button onClick={() => navigate("/portals")}
                className="text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors mb-8 flex items-center gap-1.5">
                ← Portals
              </button>
              <div className="border border-border bg-card p-10 flex flex-col items-center gap-6 text-center">
                <div className="w-16 h-16 border border-border bg-foreground/5 flex items-center justify-center">
                  <User size={28} className="text-foreground/30" />
                </div>
                <div>
                  <h2 className="font-display text-2xl text-primary mb-2">Artist Access Only</h2>
                  <div className="w-16 h-px bg-border mx-auto mb-3" />
                  <p className="text-sm text-foreground/50 italic leading-relaxed">
                    This portal is reserved for registered artists. Your account is registered as a collector.
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
        ) : (
          <div className="flex min-h-screen bg-background">
            {/* ─── Sidebar ─── */}
            <aside className="w-56 fixed top-16 bottom-0 left-0 z-40 bg-card border-r border-border flex flex-col">
              <div className="p-5 border-b border-border">
                {profile ? (
                  <>
                    {profile.photoUrl ? (
                      <img src={profile.photoUrl} alt={profile.name} className="w-14 h-14 object-cover border border-border mb-3" />
                    ) : (
                      <div className="w-14 h-14 bg-foreground/5 border border-border flex items-center justify-center mb-3">
                        <User size={20} className="text-foreground/30" />
                      </div>
                    )}
                    <p className="font-display text-sm text-primary truncate">{profile.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-foreground/50 truncate mt-0.5">{profile.style}</p>
                    <VerifiedBadge status={profile.isVerified} />
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 bg-foreground/5 border border-border flex items-center justify-center mb-3">
                      <User size={20} className="text-foreground/30" />
                    </div>
                    <p className="text-xs text-foreground/50 italic">Complete your profile to get started</p>
                  </>
                )}
              </div>

              <nav className="flex-1 p-3 space-y-0.5">
                {MENU.map(({ key, label, icon }) => (
                  <button key={key}
                    onClick={() => {
                      if (key === "add-artwork" && !profile) {
                        toast({ title: "Create your profile first.", variant: "destructive" });
                        return;
                      }
                      setTab(key);
                      if (key === "add-artwork") resetArtworkForm();
                    }}
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

              <div className="p-3 border-t border-border">
                <p className="text-[10px] text-foreground/30 uppercase tracking-widest truncate px-3 mb-2">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
                <button onClick={() => signOut({ redirectUrl: "/" })}
                  className="w-full flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/40 hover:text-destructive transition-colors px-3 py-1.5">
                  <LogOut size={12} />Sign Out
                </button>
              </div>
            </aside>

            {/* ─── Main ─── */}
            <main className="ml-56 flex-1 pt-24 pb-20 px-8 md:px-12">

              {/* Under-review banner for flagged artists */}
              {profile && profile.isVerified === "flagged" && (
                <div className="max-w-2xl mb-8 border border-border bg-card p-5 flex gap-3 items-start">
                  <Clock size={16} className="text-foreground/40 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground/70 leading-relaxed">
                    Your profile is under review. You can add your work now — it will appear publicly once our team completes the review.
                  </p>
                </div>
              )}

              {/* My Details */}
              {tab === "details" && (
                <div className="max-w-2xl">
                  <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist & Gallery Portal</p>
                  <h1 className="font-display text-4xl text-primary mb-2">
                    {profile ? "My Details" : "Create Your Profile"}
                  </h1>
                  {!profile && pendingClaim && (
                    <div className="border border-amber-300 bg-amber-50 p-5 flex gap-3 items-start mb-8">
                      <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-display text-amber-800 mb-1">Claim request awaiting review</p>
                        <p className="text-sm text-amber-700 leading-relaxed">
                          Your request to claim an existing artist record has been submitted and is
                          pending review by our curators. You'll gain full access once it's approved.
                        </p>
                      </div>
                    </div>
                  )}
                  {!profile && !pendingClaim && (
                    <p className="text-foreground/60 italic mb-10">
                      Tell us about yourself. Your profile will be reviewed before being published in the gallery.
                    </p>
                  )}
                  <form onSubmit={saveProfile} className="space-y-6 mt-8">
                    <div className="bg-card border border-border p-6">
                      {photoUrl && (
                        <div className="mb-4 flex items-center gap-4">
                          <img src={photoUrl} alt="Profile" className="w-14 h-14 object-cover border border-border" />
                          <p className="text-xs text-foreground/50 uppercase tracking-widest">Current photo</p>
                        </div>
                      )}
                      <ImageUploader
                        label={profile ? "Replace Photo" : "Profile Photo"}
                        onUploadComplete={(p) => setPhotoUrl(`/api/storage${p.startsWith("/") ? p : "/" + p}`)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {([
                        { k: "name",         l: "Full Name *",      req: true },
                        { k: "style",        l: "Artistic Style *", req: true },
                        { k: "country",      l: "Country" },
                        { k: "birthYear",    l: "Year of Birth",    type: "number" },
                        { k: "gender",       l: "Gender" },
                        { k: "contactEmail", l: "Contact Email",    type: "email" },
                        { k: "websiteUrl",   l: "Website / Social" },
                        { k: "influences",   l: "Influences" },
                      ] as { k: string; l: string; req?: boolean; type?: string }[]).map(({ k, l, req, type }) => (
                        <div key={k} className="flex flex-col gap-1.5">
                          <label className={labelCls}>{l}</label>
                          <input type={type ?? "text"} required={req} value={profileForm[k] ?? ""} onChange={setPF(k)} className={inputCls} />
                        </div>
                      ))}
                    </div>

                    {([
                      { k: "shortBio",    l: "Short Bio *",           req: true, rows: 2 },
                      { k: "biography",   l: "Full Biography",         rows: 5 },
                      { k: "awards",      l: "Awards & Recognitions",  rows: 3 },
                      { k: "exhibitions", l: "Notable Exhibitions",    rows: 3 },
                    ] as { k: string; l: string; req?: boolean; rows: number }[]).map(({ k, l, req, rows }) => (
                      <div key={k} className="flex flex-col gap-1.5">
                        <label className={labelCls}>{l}</label>
                        <textarea required={req} value={profileForm[k] ?? ""} onChange={setPF(k)} rows={rows}
                          className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 resize-none" />
                      </div>
                    ))}

                    <div className="border border-border/60 bg-card/60 p-5 space-y-4">
                      <p className="text-[10px] uppercase tracking-widest text-secondary flex items-center gap-1.5">
                        <span className="text-secondary/60">"</span> Artist's Saying / Quote
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Phrase or Statement</label>
                        <textarea value={profileForm.saying ?? ""} onChange={setPF("saying")} rows={2}
                          placeholder="A phrase that represents your artistic philosophy…"
                          className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 resize-none" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Author / Attribution</label>
                        <input type="text" value={profileForm.sayingAuthor ?? ""} onChange={setPF("sayingAuthor")}
                          placeholder="e.g. — Self, or a poet / philosopher" className={inputCls} />
                      </div>
                    </div>

                    <button type="submit" disabled={profileSaving}
                      className="flex items-center gap-2 bg-primary text-primary-foreground font-display uppercase tracking-widest px-8 py-3 hover:bg-primary/90 transition-colors disabled:opacity-60">
                      {profileSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      {profile ? "Save Changes" : "Create Profile"}
                    </button>
                  </form>
                </div>
              )}

              {/* Add / Edit Artwork */}
              {tab === "add-artwork" && (
                <div className="max-w-2xl">
                  <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist & Gallery Portal</p>
                  <h1 className="font-display text-4xl text-primary mb-2">
                    {editingArtworkId ? "Edit Artwork" : "Submit Artwork"}
                  </h1>
                  <p className="text-foreground/60 italic mb-10 text-sm">
                    {editingArtworkId
                      ? "Editing resets the artwork to pending review."
                      : "Submitted artworks are reviewed by our curators before appearing in the gallery."}
                  </p>

                  <form onSubmit={saveArtwork} className="space-y-5">
                    {/* Image upload */}
                    <div className="bg-card border border-border p-6">
                      {artworkImageUrl && (
                        <div className="mb-4">
                          <img src={artworkImageUrl} alt="Current" className="h-32 object-contain border border-border" />
                        </div>
                      )}
                      <ImageUploader
                        label={editingArtworkId ? "Replace Image" : "Artwork Image *"}
                        onUploadComplete={(p) => setArtworkImageUrl(`/api/storage${p.startsWith("/") ? p : "/" + p}`)}
                      />
                    </div>

                    {/* Title + Tagline */}
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Title *</label>
                        <input type="text" required value={artworkForm.title} onChange={setAF("title")} className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>
                          Tagline <span className="text-foreground/30 normal-case tracking-normal">(optional one-liner)</span>
                        </label>
                        <input type="text" value={artworkForm.tagline} onChange={setAF("tagline")}
                          placeholder="A brief poetic or descriptive phrase…" className={inputCls} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Year</label>
                        <input type="number" value={artworkForm.year} onChange={setAF("year")} className={inputCls} />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Size</label>
                        <select value={artworkForm.sizeId} onChange={setAF("sizeId")} className={selectCls}>
                          <option value="">— Select —</option>
                          {lookupSizes.map((s) => (
                            <option key={s.id} value={String(s.id)}>{s.code} — {s.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Width (cm)</label>
                        <input type="number" min={0} placeholder="e.g. 60" value={artworkForm.widthCm} onChange={setAF("widthCm")} className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Height (cm)</label>
                        <input type="number" min={0} placeholder="e.g. 90" value={artworkForm.heightCm} onChange={setAF("heightCm")} className={inputCls} />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Expected Price (PKR)</label>
                        <input type="number" min={0} placeholder="e.g. 15000" value={artworkForm.expectedPrice} onChange={setAF("expectedPrice")} className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Display Price Preview</label>
                        <div className={`${inputCls} flex items-center gap-2 bg-card/60 cursor-default`}>
                          {artworkForm.expectedPrice && Number(artworkForm.expectedPrice) > 0 ? (
                            <>
                              <span className="font-display text-secondary">
                                {formatMoney(Number(artworkForm.expectedPrice) * (1 + commissionRate / 100))}
                              </span>
                              <span className="text-foreground/30 text-xs">(expected + {commissionRate}% commission)</span>
                            </>
                          ) : (
                            <span className="text-foreground/30 italic">Enter expected price above</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Art Style</label>
                        {/* This dropdown used to write into `artType`, leaving
                            `art_style` empty on every row — which is why the
                            art_type column held a mix of media and styles. */}
                        <select value={artworkForm.artStyleId} onChange={setAF("artStyleId")} className={selectCls}>
                          <option value="">— Select —</option>
                          {lookupArtStyles.map((s) => (
                            <option key={s.id} value={String(s.id)}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Art Category *</label>
                        <select value={artworkForm.artCategoryId} onChange={setAF("artCategoryId")} className={selectCls} required>
                          <option value="">— Select —</option>
                          {lookupArtCategories.map((c) => (
                            <option key={c.id} value={String(c.id)}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Medium</label>
                        <select value={artworkForm.medium} onChange={setAF("medium")} className={selectCls}>
                          <option value="">— Select —</option>
                          {lookupMediums.length > 0
                            ? lookupMediums.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)
                            : ["Oil on Canvas","Watercolor","Acrylic"].map((m) => <option key={m}>{m}</option>)}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Technique</label>
                        <select value={artworkForm.techniqueId} onChange={setAF("techniqueId")} className={selectCls}>
                          <option value="">— Select —</option>
                          {lookupTechniques.map((t) => (
                            <option key={t.id} value={String(t.id)}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className={labelCls}>Theme</label>
                        <select value={artworkForm.theme} onChange={setAF("theme")} className={selectCls}>
                          {THEMES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-col gap-2">
                      <label className={`${labelCls} flex items-center gap-1.5`}>
                        <Tag size={11} />Tags
                      </label>
                      <div className="relative" ref={tagWrapRef}>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => { setTagInput(e.target.value); setTagSuggestOpen(true); }}
                            onFocus={() => setTagSuggestOpen(true)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const suggestions = allTags.filter((t) => {
                                  const q = tagInput.trim().toLowerCase();
                                  return q && t.toLowerCase().includes(q) && !artworkTags.map(normalizeTag).includes(t.toLowerCase());
                                });
                                addTag(suggestions.length > 0 ? suggestions[0] : tagInput);
                              }
                              if (e.key === "Escape") setTagSuggestOpen(false);
                            }}
                            placeholder="Type a tag and press Enter…"
                            className={`flex-1 ${inputCls}`}
                            autoComplete="off"
                          />
                          <button type="button" onClick={() => addTag()}
                            className="px-4 py-2.5 border border-border text-xs uppercase tracking-widest text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors">
                            Add
                          </button>
                        </div>
                        {/* Autocomplete dropdown */}
                        {tagSuggestOpen && tagInput.trim().length > 0 && (() => {
                          const q = tagInput.trim().toLowerCase();
                          const suggestions = allTags.filter(
                            (t) => t.toLowerCase().includes(q) && !artworkTags.map(normalizeTag).includes(t.toLowerCase())
                          );
                          return suggestions.length > 0 ? (
                            <div className="absolute z-50 top-full left-0 right-0 mt-0.5 border border-border bg-background shadow-lg max-h-44 overflow-y-auto">
                              {suggestions.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                                  className="w-full text-left px-3 py-2 text-[11px] uppercase tracking-widest text-foreground/70 hover:bg-primary/5 hover:text-foreground transition-colors"
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      {artworkTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {artworkTags.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-widest border border-secondary/40 text-secondary bg-secondary/5">
                              {tag}
                              <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                                <XIcon size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Frame */}
                    <div className="flex flex-col gap-2 pt-1">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none group w-fit">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={frameIncluded}
                            onChange={(e) => setFrameIncluded(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-4 h-4 border border-border bg-background peer-checked:bg-primary peer-checked:border-primary transition-colors flex items-center justify-center">
                            {frameIncluded && (
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                <path d="M1 3.5L3.2 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-foreground/60 group-hover:text-foreground transition-colors">
                          Include Frame
                        </span>
                      </label>

                      {frameIncluded && (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <label className={labelCls}>Frame Description</label>
                          <textarea
                            value={artworkForm.frameDescription}
                            onChange={setAF("frameDescription")}
                            rows={3}
                            placeholder="Describe the frame — material, colour, finish, dimensions…"
                            className={`${inputCls} resize-none`}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className={labelCls}>Description *</label>
                      <textarea required value={artworkForm.shortDescription} onChange={setAF("shortDescription")} rows={4}
                        placeholder="Describe the work — its meaning, technique, or story…"
                        className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 resize-none" />
                    </div>

                    {/* Add Supplier */}
                    <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
                      <p className={labelCls}>Storage Location</p>

                      <select
                        value={supplierLocId}
                        onChange={(e) => setSupplierLocId(e.target.value === "" ? "" : Number(e.target.value))}
                        className={selectCls}
                      >
                        <option value="">— Select current location of artwork —</option>
                        {storageLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>

                      {/* Company warehouse message */}
                      {supplierLocId !== "" && storageLocations.find((l) => l.id === Number(supplierLocId))?.name.toLowerCase() === "company warehouse" && (
                        <div className="bg-secondary/5 border border-secondary/30 px-4 py-3 text-sm text-foreground/70 leading-relaxed">
                          <p className="font-medium text-foreground/80 mb-0.5">Kindly send your artwork to our office:</p>
                          <p>15/5 Sarwar Road, Lahore Cantt</p>
                          <p className="text-secondary">Phone: 0345-0462952</p>
                        </div>
                      )}

                      {/* Supplier contact form for all other locations */}
                      {supplierLocId !== "" && storageLocations.find((l) => l.id === Number(supplierLocId))?.name.toLowerCase() !== "company warehouse" && (
                        <div className="grid grid-cols-1 gap-3 border border-border/50 p-4 bg-card/50">
                          <p className={`${labelCls} mb-1`}>Holder / Supplier Details</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                              <label className={labelCls}>Contact Person *</label>
                              <input type="text" value={supplierForm.contactPerson}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, contactPerson: e.target.value }))}
                                placeholder="Full name" className={inputCls} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className={labelCls}>City *</label>
                              <input type="text" value={supplierForm.city}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, city: e.target.value }))}
                                placeholder="City" className={inputCls} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                              <label className={labelCls}>Phone 1 *</label>
                              <input type="tel" value={supplierForm.phone1}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, phone1: e.target.value }))}
                                placeholder="+92 3XX XXXXXXX" className={inputCls} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className={labelCls}>Phone 2 <span className="normal-case tracking-normal text-foreground/30">(optional)</span></label>
                              <input type="tel" value={supplierForm.phone2}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, phone2: e.target.value }))}
                                placeholder="+92 3XX XXXXXXX" className={inputCls} />
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Email <span className="normal-case tracking-normal text-foreground/30">(optional)</span></label>
                            <input type="email" value={supplierForm.email}
                              onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))}
                              placeholder="email@example.com" className={inputCls} />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Address *</label>
                            <input type="text" value={supplierForm.address}
                              onChange={(e) => setSupplierForm((f) => ({ ...f, address: e.target.value }))}
                              placeholder="Street address" className={inputCls} />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className={labelCls}>Google Maps Link <span className="normal-case tracking-normal text-foreground/30">(optional)</span></label>
                            <input type="url" value={supplierForm.googleMap}
                              onChange={(e) => setSupplierForm((f) => ({ ...f, googleMap: e.target.value }))}
                              placeholder="https://maps.google.com/..." className={inputCls} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4">
                      {editingArtworkId && (
                        <button type="button" onClick={() => { resetArtworkForm(); setTab("my-artworks"); }}
                          className="border border-border text-foreground/60 font-display uppercase tracking-widest px-6 py-3 hover:border-primary/40 transition-colors text-sm">
                          Cancel Edit
                        </button>
                      )}
                      <button type="submit" disabled={artworkSaving}
                        className="flex items-center gap-2 bg-primary text-primary-foreground font-display uppercase tracking-widest px-8 py-3 hover:bg-primary/90 transition-colors disabled:opacity-60 text-sm">
                        {artworkSaving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {artworkSaving ? "Saving…" : editingArtworkId ? "Update Artwork" : "Submit Artwork"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* My Artworks */}
              {tab === "my-artworks" && (
                <div>
                  <div className="flex items-end justify-between mb-10">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist & Gallery Portal</p>
                      <h1 className="font-display text-4xl text-primary">My Artworks</h1>
                    </div>
                    <button onClick={() => { resetArtworkForm(); setTab("add-artwork"); }}
                      className="flex items-center gap-2 bg-primary text-primary-foreground text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-primary/90 transition-colors">
                      <Plus size={14} />Submit New
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-10">
                    {[
                      { label: "Total Works",  value: artworks.length },
                      { label: "Published",    value: approved.length, color: "text-emerald-700" },
                      { label: "Under Review", value: pending.length,  color: "text-amber-700" },
                    ].map((s) => (
                      <div key={s.label} className="bg-card border border-border p-5 text-center">
                        <p className={`text-3xl font-display mb-1 ${s.color ?? "text-primary"}`}>{s.value}</p>
                        <p className="text-[10px] uppercase tracking-widest text-foreground/50">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {artworksLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary w-10 h-10" /></div>
                  ) : artworks.length === 0 ? (
                    <div className="text-center py-24 border border-border bg-card">
                      <ImageIcon size={40} className="mx-auto mb-4 text-foreground/20" />
                      <p className="font-display text-2xl text-foreground/40 mb-6">No artworks yet.</p>
                      <button onClick={() => { resetArtworkForm(); setTab("add-artwork"); }}
                        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 font-display uppercase tracking-widest hover:bg-primary/90 transition-colors text-sm">
                        <Plus size={16} />Submit Your First Artwork
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {artworks.map((art) => (
                        <div key={art.id} className="bg-card border border-border group">
                          <div className="aspect-square overflow-hidden bg-background relative">
                            <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute top-3 left-3"><StatusPill status={art.status} /></div>
                            {art.status === "approved" && (
                              <Link href={`/art/${art.id}`}
                                className="absolute top-3 right-3 bg-background/80 p-1.5 hover:bg-background transition-colors">
                                <ExternalLink size={13} className="text-foreground/70" />
                              </Link>
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="font-display text-base text-primary truncate mb-1">{art.title}</h3>
                            <p className="text-[10px] text-foreground/50 uppercase tracking-widest mb-1">{[art.artCategory, art.artStyle].filter(Boolean).join(" · ")} · {art.year}</p>
                            {art.tags && art.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {art.tags.slice(0, 3).map((t) => (
                                  <span key={t} className="text-[9px] px-1.5 py-0.5 border border-secondary/30 text-secondary/70 uppercase tracking-widest">{t}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex justify-between items-center mt-2">
                              <button onClick={() => editArtwork(art)}
                                className="text-[10px] uppercase tracking-widest text-foreground/50 hover:text-primary flex items-center gap-1 transition-colors">
                                <Edit2 size={11} />Edit
                              </button>
                              <button onClick={() => deleteArtwork(art.id)}
                                className="text-[10px] uppercase tracking-widest text-foreground/40 hover:text-destructive flex items-center gap-1 transition-colors">
                                <Trash2 size={11} />Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Earnings */}
              {tab === "earnings" && (
                <div className="max-w-4xl">
                  <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist & Gallery Portal</p>
                  <h1 className="font-display text-4xl text-primary mb-2">Earnings & Commission</h1>
                  <p className="text-foreground/60 italic mb-10 text-sm">Your sales history and commission breakdown from the gallery.</p>

                  {earningsLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary w-10 h-10" /></div>
                  ) : earnings ? (
                    <>
                      {/* Portfolio stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        {[
                          { label: "Total Works",    value: earnings.total,        color: "text-primary" },
                          { label: "Published",      value: earnings.published,    color: "text-emerald-700" },
                          { label: "Under Review",   value: earnings.pending,      color: "text-amber-700" },
                          { label: "Enquiries Rec.", value: earnings.enquiryCount, color: "text-secondary" },
                        ].map((s) => (
                          <div key={s.label} className="bg-card border border-border p-5 text-center">
                            <p className={`text-3xl font-display mb-1 ${s.color}`}>{s.value}</p>
                            <p className="text-[10px] uppercase tracking-widest text-foreground/50">{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Agreed commission rate banner */}
                      <div className="flex items-center gap-4 border border-secondary/30 bg-card px-6 py-4 mb-6">
                        <DollarSign size={18} className="text-secondary flex-shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-0.5">Your Gallery Commission Rate</p>
                          <p className="font-display text-2xl text-secondary">{earnings.defaultCommissionRate}%</p>
                        </div>
                        <p className="text-xs text-foreground/40 italic ml-4 leading-relaxed">This is the rate agreed between you and Maktaba Al-Fann. Contact the gallery if you have questions.</p>
                      </div>

                      {/* Financial summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
                        <div className="bg-card border border-border p-6 text-center">
                          <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-2">Total Sales Value</p>
                          <p className="text-3xl font-display text-foreground mb-1">
                            {formatMoney(earnings.totalSalePrice, { currency: earnings.currency })}
                          </p>
                          <p className="text-xs text-foreground/40">{earnings.purchaseCount} sale{earnings.purchaseCount !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="bg-card border border-rose-200/40 p-6 text-center">
                          <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-2">Gallery Commission</p>
                          <p className="text-3xl font-display text-rose-700 mb-1">
                            {formatMoney(earnings.totalCommission, { currency: earnings.currency })}
                          </p>
                          {earnings.commissions.length > 0 && (
                            <p className="text-xs text-foreground/40">
                              avg {Math.round(earnings.commissions.reduce((s, c) => s + c.commissionRate, 0) / earnings.commissions.length)}% rate
                            </p>
                          )}
                        </div>
                        <div className="bg-card border border-primary/30 p-6 text-center">
                          <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-2">Your Earnings</p>
                          <p className="text-3xl font-display text-primary mb-1">
                            {formatMoney(earnings.totalEarning, { currency: earnings.currency })}
                          </p>
                          <p className="text-xs text-foreground/40">after commission</p>
                        </div>
                      </div>

                      {/* Commission records table */}
                      <div className="mb-10">
                        <h3 className="font-display text-xl text-primary mb-4">Commission Breakdown</h3>
                        {earnings.commissions.length === 0 ? (
                          <div className="border border-border bg-card p-10 text-center">
                            <TrendingUp size={32} className="mx-auto mb-3 text-foreground/20" />
                            <p className="text-sm text-foreground/40 italic">No sales recorded yet. Commission details will appear here once a work sells.</p>
                          </div>
                        ) : (
                          <div className="border border-border overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-card border-b border-border">
                                <tr>
                                  {["Artwork", "Sale Price", "Commission %", "Commission Amt", "Your Earning", "Status", "Date"].map((h) => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-foreground/50 font-normal whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {earnings.commissions.map((c, i) => (
                                  <tr key={c.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-card/40"}`}>
                                    <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{c.artworkTitle}</td>
                                    <td className="px-4 py-3 text-foreground/70 whitespace-nowrap">{formatMoney(c.salePrice, { currency: c.currency })}</td>
                                    <td className="px-4 py-3 text-rose-700 whitespace-nowrap font-display">{c.commissionRate}%</td>
                                    <td className="px-4 py-3 text-rose-700/80 whitespace-nowrap">{formatMoney(c.commissionAmount, { currency: c.currency })}</td>
                                    <td className="px-4 py-3 text-primary font-display whitespace-nowrap">{formatMoney(c.artistEarning, { currency: c.currency })}</td>
                                    <td className="px-4 py-3">
                                      <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                                        c.status === "paid"    ? "text-emerald-700 border-emerald-200 bg-emerald-50" :
                                        c.status === "pending" ? "text-amber-700 border-amber-200 bg-amber-50" :
                                                                 "text-foreground/50 border-border bg-card"
                                      }`}>{c.status}</span>
                                    </td>
                                    <td className="px-4 py-3 text-foreground/40 whitespace-nowrap text-xs">
                                      {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                    </td>
                                    {c.notes && (
                                      <td className="px-4 py-3 text-foreground/40 text-xs italic max-w-[140px] truncate">{c.notes}</td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="bg-card border border-border p-6 text-sm text-foreground/60 leading-relaxed">
                        <p className="font-display text-base text-primary mb-2">How it works</p>
                        <p>All transactions are conducted privately between the gallery, the collector, and you. Commission rates are set individually per sale and reflected in the table above. Contact our curators for any queries about a specific transaction.</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-24 border border-border bg-card">
                      <BarChart3 size={40} className="mx-auto mb-4 text-foreground/20" />
                      <p className="font-display text-xl text-foreground/40">No earnings data yet.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Settings */}
              {tab === "settings" && (
                <div className="max-w-lg">
                  <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist & Gallery Portal</p>
                  <h1 className="font-display text-4xl text-primary mb-2">Settings</h1>
                  <p className="text-foreground/60 italic mb-10 text-sm">Manage your account security.</p>

                  {/* Account info */}
                  <div className="bg-card border border-border p-6 mb-6">
                    <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-3">Signed in as</p>
                    <div className="flex items-center gap-3">
                      {user?.imageUrl && <img src={user.imageUrl} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-border" />}
                      <div>
                        <p className="font-display text-base text-primary">{user?.fullName ?? user?.username ?? "—"}</p>
                        <p className="text-xs text-foreground/50">{user?.primaryEmailAddress?.emailAddress ?? "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Change password */}
                  <div className="border border-border bg-card">
                    <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                      <KeyRound size={14} className="text-secondary" />
                      <h3 className="text-xs uppercase tracking-widest text-foreground/70">Change Password</h3>
                    </div>
                    <div className="p-6 space-y-4">
                      {/* Current password */}
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Current Password</label>
                        <div className="relative">
                          <input
                            type={pwShowCurrent ? "text" : "password"}
                            value={pwCurrent}
                            onChange={(e) => setPwCurrent(e.target.value)}
                            placeholder="Your current password"
                            className={`${inputCls} pr-10`}
                          />
                          <button
                            type="button"
                            onClick={() => setPwShowCurrent((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60 transition-colors">
                            {pwShowCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>

                      {/* New password */}
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>New Password</label>
                        <div className="relative">
                          <input
                            type={pwShowNew ? "text" : "password"}
                            value={pwNew}
                            onChange={(e) => setPwNew(e.target.value)}
                            placeholder="At least 8 characters"
                            className={`${inputCls} pr-10`}
                          />
                          <button
                            type="button"
                            onClick={() => setPwShowNew((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60 transition-colors">
                            {pwShowNew ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm new password */}
                      <div className="flex flex-col gap-1.5">
                        <label className={labelCls}>Confirm New Password</label>
                        <div className="relative">
                          <input
                            type={pwShowConfirm ? "text" : "password"}
                            value={pwConfirm}
                            onChange={(e) => setPwConfirm(e.target.value)}
                            placeholder="Repeat new password"
                            className={`${inputCls} pr-10`}
                            onKeyDown={(e) => { if (e.key === "Enter") changePassword(); }}
                          />
                          <button
                            type="button"
                            onClick={() => setPwShowConfirm((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60 transition-colors">
                            {pwShowConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>

                      {/* Strength hint */}
                      {pwNew.length > 0 && pwNew.length < 8 && (
                        <p className="text-[11px] text-amber-700">Password must be at least 8 characters.</p>
                      )}
                      {pwNew.length >= 8 && pwConfirm.length > 0 && pwNew !== pwConfirm && (
                        <p className="text-[11px] text-destructive">Passwords do not match.</p>
                      )}
                      {pwNew.length >= 8 && pwConfirm.length >= 8 && pwNew === pwConfirm && (
                        <p className="text-[11px] text-emerald-700">Passwords match ✓</p>
                      )}

                      <button
                        onClick={changePassword}
                        disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
                        className="flex items-center gap-2 bg-primary text-primary-foreground text-xs uppercase tracking-widest px-6 py-2.5 hover:bg-primary/90 transition-colors disabled:opacity-40">
                        {pwSaving ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                        Update Password
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </main>
          </div>
        )}
      </Show>
    </>
  );
}
