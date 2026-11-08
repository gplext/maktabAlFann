import { useCallback, useEffect, useState } from "react";
import { Loader2, Copy, Check, EyeOff, Upload } from "lucide-react";
import { ImageUploader } from "@/components/image-uploader";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin → Artworks → Duplicates: artworks that share one picture, a button to hide
 * the copies, and for each hidden copy a picture prompt and an upload box.
 */
type Card = {
  id: number; title: string; imageUrl: string; status: string; shortDescription: string;
  theme: string; medium: string; year: number; artistName: string; artCategory: string; artStyle: string | null;
};
type Data = { groups: { keep: Card; copies: Card[] }[]; waiting: Card[] };

const small = "text-[10px] uppercase tracking-widest text-foreground/50";

/** Medium in painter's vocabulary, read from the title / description first, then the style. */
function mediumOf(a: Card): { medium: string; texture: string } {
  const t = `${a.title} ${a.shortDescription} ${a.medium}`.toLowerCase();
  if (/sketch with 2 colou?rs|two[- ]colou?r sketch/.test(t))
    return { medium: "two-colour sketch in black charcoal and red sanguine chalk on cream, deckle-edged paper", texture: "loose hatching, smudged charcoal and the grain of the paper showing through" };
  if (/water ?paint|watercolou?r/.test(t))
    return { medium: "watercolour painting on cold-pressed paper", texture: "soft wet-in-wet washes, granulating pigment and crisp white paper highlights" };
  if (/oil/.test(t))
    return { medium: "oil painting on canvas", texture: "thick impasto brushstrokes and visible canvas weave" };
  if (/acrylic/.test(t))
    return { medium: "acrylic painting on canvas", texture: "bold, layered brushwork with matte acrylic colour" };
  if (/splatter|drip/.test(t))
    return { medium: "abstract splatter painting", texture: "flicked, dripped and poured paint layered over expressive brushstrokes" };
  if (/classic/.test(t))
    return { medium: "classical oil painting in the tradition of 19th-century realism", texture: "smooth glazed layers, rich shadows and fine detail" };
  if (/modern/.test(t))
    return { medium: "modern painting built from bold faceted shapes and flat planes of colour", texture: "crisp palette-knife edges and graphic contrast" };
  const byStyle: Record<string, { medium: string; texture: string }> = {
    Realism: { medium: "realist oil painting on canvas", texture: "naturalistic detail and controlled brushwork" },
    Impressionism: { medium: "impressionist oil painting", texture: "broken, dappled brushstrokes that capture light" },
    Expressionism: { medium: "expressionist painting", texture: "vigorous strokes and heightened, emotional colour" },
    Abstract: { medium: "abstract painting", texture: "layered gestural marks and fields of colour" },
    Minimalism: { medium: "minimalist painting", texture: "calm, sparse forms and generous negative space" },
    "Folk Art": { medium: "South Asian folk-art painting", texture: "flat decorative colour and patterned borders" },
    Contemporary: { medium: "contemporary painting on canvas", texture: "confident mixed-media brushwork" },
  };
  return byStyle[a.artStyle ?? ""] ?? { medium: "painting on canvas", texture: "visible, hand-made brushwork" };
}

/** Each copy shares its subject with other artworks, so each gets its own viewpoint and light. */
const VIEWS = [
  "a wide panoramic view of the whole scene",
  "a closer view that focuses on one telling detail of the scene",
  "a view from a high vantage point looking down across the scene",
  "the scene at golden hour, with warm low sunlight and long shadows",
  "the scene at dusk under a deep blue sky with the first lights appearing",
  "the scene on a misty morning, softened by haze",
];
const MOODS: [RegExp, string][] = [
  [/^study of/i, "It reads as an artist's study: fresh, direct and slightly unfinished at the edges."],
  [/^reflections on/i, "The mood is quiet and contemplative."],
  [/expression of/i, "The mood is bold and expressive."],
];

/**
 * A prose prompt for an image generator (ChatGPT, Gemini, Imagen, Midjourney…):
 * subject → setting → composition → light/mood → medium and texture → hard exclusions → aspect ratio.
 * Built from the artwork's own title, subject, style and description.
 */
export function picturePrompt(a: Card) {
  const { medium, texture } = mediumOf(a);
  const subject = (a.theme || a.title).trim();
  const view = VIEWS[a.id % VIEWS.length];
  const mood = MOODS.find(([re]) => re.test(a.title))?.[1] ?? "The mood matches the subject.";
  const desc = a.shortDescription && !/executed with custom textures|created under the artist profile|hand-painted under the name/i.test(a.shortDescription)
    ? ` ${a.shortDescription.trim()}`
    : "";
  return [
    `An original ${medium} depicting ${subject}, titled "${a.title}".${desc}`,
    `Composition: ${view}, seen straight on, with the painted image filling the entire frame edge to edge.`,
    mood,
    `Surface: ${texture}.`,
    "Landscape format, 16:9. No frame, no wall or room, no signature, no text, no watermark.",
  ].join(" ");
}

export function AdminDuplicates() {
  const { toast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [hiding, setHiding] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/artworks/duplicates", { credentials: "include" });
    if (res.ok) setData(await res.json());
    else toast({ title: "Could not load duplicates", variant: "destructive" });
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const hide = async () => {
    const n = data?.groups.reduce((s, g) => s + g.copies.length, 0) ?? 0;
    if (!window.confirm(`Hide ${n} copies from the website? Nothing is deleted — each comes back when you upload a new picture for it.`)) return;
    setHiding(true);
    try {
      const res = await fetch("/api/admin/artworks/duplicates/hide", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({ error: `The server answered ${res.status}. Restart the API server and try again.` }));
      if (!res.ok) throw new Error(body.error ?? "Could not hide them.");
      toast({ title: `${body.hidden} copies hidden`, description: "They are listed below, waiting for new pictures." });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setHiding(false);
    }
  };

  const copy = async (a: Card) => {
    await navigator.clipboard.writeText(picturePrompt(a));
    setCopied(a.id);
    setTimeout(() => setCopied((c) => (c === a.id ? null : c)), 1500);
  };

  const save = async (a: Card, publish: boolean) => {
    const imageUrl = uploaded[a.id];
    if (!imageUrl) return;
    setSaving(a.id);
    try {
      const res = await fetch(`/api/admin/artworks/${a.id}/image`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, publish }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      toast({ title: publish ? "Picture saved — artwork is live again" : "Picture saved" });
      setUploaded(({ [a.id]: _, ...rest }) => rest);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (!data) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;
  const copies = data.groups.reduce((s, g) => s + g.copies.length, 0);

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <p className={small}>Artworks sharing one picture</p>
            <p className="text-sm text-foreground/70 mt-1">
              {copies === 0 ? "No duplicates on the website." : `${data.groups.length} pictures are used by more than one artwork: ${copies} copies.`}
              {copies > 0 && " The oldest artwork in each group keeps the picture."}
            </p>
          </div>
          {copies > 0 && (
            <button onClick={() => void hide()} disabled={hiding}
              className="px-5 py-2.5 bg-primary text-primary-foreground text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-60">
              {hiding ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />} Hide the {copies} copies
            </button>
          )}
        </div>
        <div className="space-y-3">
          {data.groups.map((g) => (
            <div key={g.keep.id} className="border border-border bg-card p-3 flex gap-4 items-start">
              <img src={g.keep.imageUrl} alt="" className="w-20 h-20 object-cover shrink-0" loading="lazy" />
              <div className="text-xs leading-relaxed min-w-0">
                <p><span className="text-emerald-700">Keeps:</span> #{g.keep.id} {g.keep.title} — {g.keep.artistName}</p>
                {g.copies.map((c) => (
                  <p key={c.id} className="text-foreground/60"><span className="text-amber-700">Copy:</span> #{c.id} {c.title} — {c.artistName}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className={`${small} mb-1`}>Hidden — waiting for a new picture ({data.waiting.length})</p>
        <p className="text-sm text-foreground/60 mb-5">
          Copy the prompt into an image generator (ChatGPT, Gemini, Bing Image Creator, Firefly…), download the picture, upload it here and press Publish.
        </p>
        {data.waiting.length === 0 ? (
          <p className="text-sm text-foreground/50 border border-dashed border-border p-6 text-center">Nothing waiting.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {data.waiting.map((a) => (
              <div key={a.id} className="border border-border bg-card p-4">
                <div className="flex gap-3 mb-3">
                  <img src={uploaded[a.id] ?? a.imageUrl} alt="" className={`w-20 h-20 object-cover shrink-0 ${uploaded[a.id] ? "" : "opacity-40 grayscale"}`} />
                  <div className="min-w-0">
                    <p className="font-display text-base text-foreground leading-snug">#{a.id} {a.title}</p>
                    <p className="text-xs text-foreground/60">{a.artistName} · {a.artStyle ?? a.artCategory} · {a.year}</p>
                    <p className="text-xs text-foreground/60 mt-1 line-clamp-2">{a.shortDescription}</p>
                  </div>
                </div>
                <div className="bg-foreground/5 border border-border p-2 text-[11px] leading-relaxed text-foreground/70 mb-2">{picturePrompt(a)}</div>
                <button onClick={() => void copy(a)} className="text-xs uppercase tracking-widest text-secondary hover:text-primary flex items-center gap-1.5 mb-3">
                  {copied === a.id ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy prompt</>}
                </button>
                <ImageUploader label="Upload the new picture"
                  onUploadComplete={(p) => setUploaded((u) => ({ ...u, [a.id]: `/api/storage${p.startsWith("/") ? p : "/" + p}` }))} />
                {uploaded[a.id] && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => void save(a, true)} disabled={saving === a.id}
                      className="flex-1 px-4 py-2 bg-primary text-primary-foreground text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60">
                      {saving === a.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Publish
                    </button>
                    <button onClick={() => void save(a, false)} disabled={saving === a.id}
                      className="px-4 py-2 border border-border text-xs uppercase tracking-widest disabled:opacity-60">Save, keep hidden</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
