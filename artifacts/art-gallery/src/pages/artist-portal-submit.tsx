import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/image-uploader";

const THEMES = ["Landscape", "Portrait", "Abstract", "Cultural Heritage", "Sufism", "Mughal", "Folk Art", "Contemporary", "Still Life", "Geometric"];

type LookupOption = { id: number; name: string };
type SizeOption = { id: number; code: string; label: string };

export default function ArtistPortalSubmit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "", theme: "Cultural Heritage",
    year: String(new Date().getFullYear()),
    shortDescription: "", medium: "", dimensions: "",
    // Classification travels as lookup ids so it lands in art_categories /
    // art_styles rather than as free text nothing can filter on.
    artCategoryId: "", artStyleId: "", sizeId: "",
  });
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [styles, setStyles] = useState<LookupOption[]>([]);
  const [sizes, setSizes] = useState<SizeOption[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/lookup/art-categories").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/lookup/art-styles").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/lookup/sizes").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([c, st, si]) => { setCategories(c); setStyles(st); setSizes(si); })
      .catch(() => { /* dropdowns stay empty */ });
  }, []);

  const handleImageUpload = (objectPath: string) => {
    setImageUrl(`/api/storage${objectPath.startsWith("/") ? objectPath : "/" + objectPath}`);
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) {
      toast({ title: "Please upload an image first.", variant: "destructive" }); return;
    }
    if (!form.artCategoryId) {
      toast({ title: "Please choose an art category.", variant: "destructive" }); return;
    }
    setSaving(true);
    const num = (v: string) => (v === "" ? null : Number(v));
    const res = await fetch("/api/artist-portal/artworks", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        theme: form.theme,
        medium: form.medium,
        dimensions: form.dimensions,
        shortDescription: form.shortDescription,
        imageUrl,
        year: Number(form.year),
        artCategoryId: Number(form.artCategoryId),
        artStyleId: num(form.artStyleId),
        sizeId: num(form.sizeId),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Artwork submitted!", description: "It will appear in the gallery once approved." });
      setLocation("/artist-portal");
    } else {
      const data = await res.json();
      toast({ title: "Error", description: data.error ?? "Submission failed", variant: "destructive" });
    }
  };

  return (
    <div className="pt-32 pb-24 px-6 min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-secondary mb-2">Artist Portal</p>
        <h1 className="font-display text-4xl text-primary mb-2">Submit Artwork</h1>
        <p className="text-foreground/60 italic mb-12">
          Your work will be reviewed by our curators. Once approved, it will appear in the public collection.
        </p>

        <form onSubmit={submit} className="space-y-6">
          <div className="bg-card border border-border p-6">
            <ImageUploader
              label="Artwork Image *"
              onUploadComplete={handleImageUpload}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { key: "title",       label: "Title",   placeholder: "Artwork title",   required: true, full: true },
              { key: "year",        label: "Year",    placeholder: "2024", type: "number" },
              { key: "medium",      label: "Medium",  placeholder: "e.g. Oil on canvas" },
              { key: "dimensions",  label: "Dimensions", placeholder: "e.g. 24 × 36 in" },
            ].map(({ key, label, placeholder, type, required, full }) => (
              <div key={key} className={`flex flex-col gap-2 ${full ? "sm:col-span-2" : ""}`}>
                <label className="text-xs uppercase tracking-widest text-foreground/60">
                  {label}
                </label>
                <input
                  type={type ?? "text"} placeholder={placeholder} required={required}
                  value={(form as any)[key]}
                  onChange={set(key)}
                  className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60"
                />
              </div>
            ))}

            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-foreground/60">Art Style</label>
              <select value={form.artStyleId} onChange={set("artStyleId")}
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60">
                <option value="">— Select —</option>
                {styles.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-foreground/60">Theme</label>
              <select value={form.theme} onChange={set("theme")}
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60">
                {THEMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-foreground/60">
                Art Category <span className="text-secondary">*</span>
              </label>
              <select value={form.artCategoryId} onChange={set("artCategoryId")} required
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60">
                <option value="">— Select —</option>
                {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
              <p className="text-[10px] text-foreground/40 uppercase tracking-widest">Determines where the work appears in the collection</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest text-foreground/60">Size</label>
              <select value={form.sizeId} onChange={set("sizeId")}
                className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60">
                <option value="">— Select —</option>
                {sizes.map((s) => <option key={s.id} value={String(s.id)}>{s.code} — {s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-widest text-foreground/60">
              Description <span className="text-secondary">*</span>
            </label>
            <textarea
              required placeholder="Describe the work — its meaning, technique, or story…"
              value={form.shortDescription} onChange={set("shortDescription")}
              rows={5}
              className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 resize-none"
            />
          </div>

          <div className="flex gap-4">
            <button type="button" onClick={() => setLocation("/artist-portal")}
              className="flex-1 border border-border text-foreground/60 font-display uppercase tracking-widest py-4 hover:text-foreground hover:border-primary/40 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-primary text-primary-foreground font-display uppercase tracking-widest py-4 hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-3">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              {saving ? "Submitting…" : "Submit Artwork"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
