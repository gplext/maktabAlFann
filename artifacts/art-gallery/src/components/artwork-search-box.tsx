import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, Loader2, X, User, Palette, Shapes } from "lucide-react";

export type Suggestions = {
  artworks: { id: number; title: string; artistName: string; imageUrl: string; artStyle: string | null }[];
  artists: { id: number; name: string; photoUrl: string }[];
  styles: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  didYouMean: string | null;
};

/** Suggestions for a phrase (also used for "Did you mean…" under empty results). */
export function useSuggestions(q: string, enabled = true) {
  const term = q.trim();
  return useQuery<Suggestions>({
    queryKey: ["/artworks/suggest", term],
    queryFn: async () => {
      const res = await fetch(`/api/artworks/suggest?q=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error("suggest failed");
      return res.json();
    },
    enabled: enabled && term.length >= 2,
    staleTime: 60_000,
  });
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * The /art search box. Typing shows suggestions (artworks, artists, styles, art
 * types); Enter or "Search" runs the full search on the page.
 */
export function ArtworkSearchBox({
  value, onChange, onSubmit, onPickStyle, onPickCategory,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (q: string) => void;
  onPickStyle: (id: number, name: string) => void;
  onPickCategory: (id: number, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const typed = useDebounced(value, 200);
  const { data, isFetching } = useSuggestions(typed, open);

  // Close when clicking outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const submit = (q: string) => { setOpen(false); onSubmit(q.trim()); };
  const hasAny = !!data && (data.artworks.length + data.artists.length + data.styles.length + data.categories.length > 0);
  const showPanel = open && typed.trim().length >= 2 && !!data;
  const heading = "px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.25em] text-secondary";
  const row = "flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-foreground/5 w-full text-left";

  return (
    <div ref={box} className="relative">
      <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) submit(value); }} className="relative flex" role="search">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          placeholder="Search by title, artist, subject, style or medium…"
          aria-label="Search artworks"
          aria-expanded={showPanel}
          className="flex-1 pl-11 pr-10 py-4 bg-card border border-border text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-secondary transition-colors font-serif [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} aria-label="Clear the search box"
            className="absolute right-[6.5rem] top-1/2 -translate-y-1/2 p-1 text-foreground/50 hover:text-foreground">
            <X size={15} />
          </button>
        )}
        <button type="submit"
          className="px-6 bg-primary text-primary-foreground text-[11px] uppercase tracking-[0.2em] font-display hover:bg-secondary transition-colors flex items-center gap-2">
          Search
        </button>
      </form>

      {showPanel && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border shadow-lg max-h-[70vh] overflow-y-auto">
          {isFetching && !hasAny && (
            <div className="px-4 py-4 text-sm text-foreground/60 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Searching…</div>
          )}

          {data!.artworks.length > 0 && (
            <div>
              <p className={heading}>Artworks</p>
              {data!.artworks.map((a) => (
                <Link key={a.id} href={`/art/${a.id}`} onClick={() => setOpen(false)} className={row}>
                  <img src={a.imageUrl} alt="" className="w-10 h-10 object-cover shrink-0 border border-border" loading="lazy" />
                  <span className="min-w-0">
                    <span className="block truncate">{a.title}</span>
                    <span className="block text-xs text-foreground/60 truncate">{a.artistName}{a.artStyle ? ` · ${a.artStyle}` : ""}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {data!.artists.length > 0 && (
            <div>
              <p className={heading}>Artists</p>
              {data!.artists.map((a) => (
                <Link key={a.id} href={`/artists/${a.id}`} onClick={() => setOpen(false)} className={row}>
                  <User size={15} className="text-foreground/50 shrink-0" /> {a.name}
                </Link>
              ))}
            </div>
          )}

          {(data!.styles.length > 0 || data!.categories.length > 0) && (
            <div>
              <p className={heading}>Filter by</p>
              {data!.styles.map((s) => (
                <button key={`s${s.id}`} onClick={() => { setOpen(false); onPickStyle(s.id, s.name); }} className={row}>
                  <Palette size={15} className="text-foreground/50 shrink-0" /> Style: {s.name}
                </button>
              ))}
              {data!.categories.map((c) => (
                <button key={`c${c.id}`} onClick={() => { setOpen(false); onPickCategory(c.id, c.name); }} className={row}>
                  <Shapes size={15} className="text-foreground/50 shrink-0" /> Art type: {c.name}
                </button>
              ))}
            </div>
          )}

          {!hasAny && !isFetching && (
            <div className="px-4 py-4 text-sm text-foreground/70">
              No matches for “{typed.trim()}”.
              {data!.didYouMean && (
                <> Did you mean{" "}
                  <button onClick={() => { onChange(data!.didYouMean!); submit(data!.didYouMean!); }} className="text-primary underline font-medium">
                    {data!.didYouMean}
                  </button>?
                </>
              )}
            </div>
          )}

          {hasAny && (
            <button onClick={() => submit(value)}
              className="w-full text-left px-4 py-3 border-t border-border text-xs uppercase tracking-widest text-primary hover:bg-foreground/5">
              See all results for “{value.trim()}” →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

