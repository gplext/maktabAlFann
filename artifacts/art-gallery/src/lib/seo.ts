import { useEffect } from "react";

/**
 * Keeps the page title, description, canonical URL and share tags in step with
 * the page shown. The server already sends the right tags on the first load;
 * this updates them when the visitor moves around inside the app.
 */
export const SITE_NAME = "Maktaba Al-Fann";
export const DEFAULT_TITLE = "Maktaba Al-Fann — Online Gallery of Pakistani Art";
export const DEFAULT_DESC =
  "Maktaba Al-Fann is an exclusive online gallery of paintings, drawings, sculpture and printmaking by Pakistani artists — each work presented with its style, technique and the story of its maker.";

export const clip = (s: string, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
};

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

export function applyPageMeta({ title, description = DEFAULT_DESC, image, noindex = false }: { title: string; description?: string; image?: string | null; noindex?: boolean }) {
  const path = window.location.pathname.replace(/\/+$/, "");
  const url = window.location.origin + (path || "/");
  document.title = title;
  setMeta("name", "description", description);
  setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow, max-image-preview:large");
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  if (image) {
    const abs = /^https?:\/\//.test(image) ? image : window.location.origin + image;
    setMeta("property", "og:image", abs);
    setMeta("name", "twitter:image", abs);
  }
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (noindex) {
    link?.remove();
  } else {
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;
  }
}

/** Use in a page: usePageMeta({ title, description }). Pass null while data is loading. */
export function usePageMeta(meta: { title: string; description?: string; image?: string | null; noindex?: boolean } | null) {
  const key = meta ? `${meta.title}|${meta.description}|${meta.image}|${meta.noindex}` : "";
  useEffect(() => {
    if (meta) applyPageMeta(meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
