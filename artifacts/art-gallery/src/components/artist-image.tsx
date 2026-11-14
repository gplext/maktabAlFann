import { useEffect, useMemo, useState } from "react";

/**
 * An artist's picture that never shows as a broken image.
 *
 * Order: a real portrait → the artist's best artwork → their initials.
 * Stock placeholders (picsum.photos, placehold.co) are not real portraits and
 * are skipped; any picture that fails to load moves on to the next choice.
 */
const PLACEHOLDER = /picsum\.photos|placehold\.co|via\.placeholder|placeholder\.com/i;

export function realPortrait(url?: string | null): string | null {
  return url && url.trim() && !PLACEHOLDER.test(url) ? url : null;
}

export function initials(name: string) {
  return name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function ArtistImage({
  name, photoUrl, coverImageUrl, className = "", imgClassName = "", alt, eager = false,
}: {
  name: string;
  photoUrl?: string | null;
  coverImageUrl?: string | null;
  className?: string;
  imgClassName?: string;
  alt?: string;
  eager?: boolean;
}) {
  const sources = useMemo(
    () => [realPortrait(photoUrl), coverImageUrl && !PLACEHOLDER.test(coverImageUrl) ? coverImageUrl : null]
      .filter((s, i, a): s is string => !!s && a.indexOf(s) === i),
    [photoUrl, coverImageUrl],
  );
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [sources]);
  const src = sources[i];

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-primary/15 via-secondary/10 to-background ${className}`}
        role="img" aria-label={alt ?? name}>
        <span className="font-display text-primary/70 text-[clamp(1.5rem,6cqw,6rem)] tracking-widest select-none">{initials(name)}</span>
      </div>
    );
  }
  return (
    <img src={src} alt={alt ?? name} loading={eager ? "eager" : "lazy"} decoding="async"
      onError={() => setI((n) => n + 1)}
      className={`${className} ${imgClassName}`} />
  );
}
