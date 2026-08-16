import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Loader2, User, AlertTriangle, Link as LinkIcon, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/image-uploader";

type Field = { key: string; label: string; placeholder: string; type?: string; textarea?: boolean; required?: boolean };

const FIELDS: Field[] = [
  { key: "name",        label: "Full Name",        placeholder: "Your full name", required: true },
  { key: "style",       label: "Artistic Style",   placeholder: "e.g. Miniature, Contemporary, Calligraphy", required: true },
  { key: "country",     label: "Country",          placeholder: "Pakistan" },
  { key: "birthYear",   label: "Year of Birth",    placeholder: "e.g. 1985", type: "number" },
  { key: "gender",      label: "Gender",           placeholder: "e.g. Male / Female / Prefer not to say" },
  { key: "shortBio",    label: "Short Bio",        placeholder: "One sentence about your art", required: true, textarea: true },
  { key: "biography",   label: "Full Biography",   placeholder: "Your story, background, and artistic journey…", textarea: true },
  { key: "influences",  label: "Influences",       placeholder: "Artists, movements, or traditions that shaped you" },
  { key: "websiteUrl",  label: "Website / Social", placeholder: "https://…" },
  { key: "contactEmail", label: "Contact Email",   placeholder: "public@email.com", type: "email" },
];

type NameCheckResult = {
  match: boolean;
  artistId: number | null;
  requiresPhoneVerification: boolean;
};

export default function ArtistPortalRegister() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({
    name: user?.fullName ?? "",
    contactEmail: user?.primaryEmailAddress?.emailAddress ?? "",
  });
  const [photoUrl, setPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [claimSubmitted, setClaimSubmitted] = useState(false);

  // Name-match state
  const [nameCheck, setNameCheck] = useState<NameCheckResult | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const [phone, setPhone] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePhotoUpload = (objectPath: string) => {
    setPhotoUrl(`/api${objectPath.startsWith("/") ? objectPath : "/" + objectPath}`);
  };

  const checkName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { setNameCheck(null); return; }
    setCheckingName(true);
    try {
      const res = await fetch("/api/artist-portal/check-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const data: NameCheckResult = await res.json();
        setNameCheck(data);
      }
    } catch {
      // silently ignore check errors
    } finally {
      setCheckingName(false);
    }
  };

  const handleNameChange = (value: string) => {
    setForm((f) => ({ ...f, name: value }));
    setNameCheck(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkName(value), 600);
  };

  const handleNameBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    checkName(form.name ?? "");
  };

  const isMatch = nameCheck?.match === true;
  const buttonLabel = isMatch ? "Request Approval" : "Create Artist Profile";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (isMatch && nameCheck?.artistId) {
      // Claim flow — do NOT register; submit a claim request instead
      const res = await fetch("/api/artist-portal/claim-request", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingArtistId: nameCheck.artistId, phone, message: "" }),
      });
      setSaving(false);
      if (res.ok) {
        setClaimSubmitted(true);
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error ?? "Could not submit request", variant: "destructive" });
      }
      return;
    }

    // Normal registration flow
    const res = await fetch("/api/artist-portal/register", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, photoUrl }),
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Profile created!", description: "Welcome to Maktaba Al-Fann." });
      setLocation("/artist-portal");
    } else {
      const data = await res.json();
      toast({ title: "Error", description: data.error ?? "Could not create profile", variant: "destructive" });
    }
  };

  if (claimSubmitted) {
    return (
      <div className="pt-32 pb-24 px-6 min-h-screen bg-background flex items-start justify-center">
        <div className="max-w-lg w-full text-center">
          <Clock size={40} className="text-amber-500 mx-auto mb-6" />
          <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist & Gallery Portal</p>
          <h1 className="font-display text-4xl text-primary mb-4">Request Submitted</h1>
          <p className="text-foreground/60 italic leading-relaxed mb-8">
            Your claim request is now awaiting review by our curators. We'll link your account to
            the existing artist record once we verify your identity. This usually takes 1–2 business days.
          </p>
          <button
            onClick={() => setLocation("/artist-portal")}
            className="font-display uppercase tracking-widest px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
          >
            Go to Artist & Gallery Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 px-6 min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist & Gallery Portal</p>
        <h1 className="font-display text-4xl text-primary mb-2">Create Your Profile</h1>
        <p className="text-foreground/60 italic mb-12">
          Tell us about yourself and your work. Your profile will be reviewed by our curators before being published.
        </p>

        <form onSubmit={submit} className="space-y-6">
          <div className="bg-card border border-border p-6">
            <ImageUploader
              label="Profile Photo"
              onUploadComplete={handlePhotoUpload}
            />
          </div>

          {/* Name field — special: triggers name-match check */}
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-foreground/60">
              Full Name<span className="text-secondary ml-1">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Your full name"
                required
                value={form.name ?? ""}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={handleNameBlur}
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60"
              />
              {checkingName && (
                <Loader2 size={14} className="absolute right-3 top-3.5 text-foreground/30 animate-spin" />
              )}
            </div>
          </div>

          {/* Name-match warning panel */}
          {isMatch && (
            <div className="border border-amber-300 bg-amber-50 p-5 space-y-4">
              <div className="flex gap-3 items-start">
                <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-display text-amber-800 mb-1">An artist with this name already exists in our gallery.</p>
                  <p className="text-sm text-amber-700 leading-relaxed">
                    If this is you, enter the phone number you gave the gallery to link your account.
                    Your request will be reviewed by our curators before your profile is activated.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-widest text-amber-700/80">
                  Phone number on file with the gallery
                  {nameCheck?.requiresPhoneVerification && <span className="ml-1 text-amber-600">*</span>}
                </label>
                <input
                  type="tel"
                  placeholder="+92 300 000 0000"
                  required={nameCheck?.requiresPhoneVerification}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white border border-amber-300 px-4 py-3 text-sm text-foreground placeholder:text-amber-300 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Remaining fields (skip name — already rendered above) */}
          {FIELDS.filter((f) => f.key !== "name").map(({ key, label, placeholder, type, textarea, required }) => (
            <div key={key} className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-foreground/60">
                {label}{required && <span className="text-secondary ml-1">*</span>}
              </label>
              {textarea ? (
                <textarea
                  placeholder={placeholder} required={required}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  rows={4}
                  className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 resize-none"
                />
              ) : (
                <input
                  type={type ?? "text"} placeholder={placeholder} required={required}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60"
                />
              )}
            </div>
          ))}

          <button type="submit" disabled={saving}
            className={`w-full font-display uppercase tracking-widest py-4 transition-colors disabled:opacity-60 flex items-center justify-center gap-3 ${
              isMatch
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}>
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : isMatch ? (
              <LinkIcon size={18} />
            ) : (
              <User size={18} />
            )}
            {saving ? (isMatch ? "Submitting Request…" : "Creating Profile…") : buttonLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
