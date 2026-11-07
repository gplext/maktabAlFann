import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { readImage } from "./image-size";

/**
 * 16:9 versions of carousel images.
 *
 * An image that is already 16:9 is only resized; any other shape is cropped to
 * 16:9 around its most interesting part (sharp's "attention" strategy: faces,
 * contrast, saturated colour), never stretched. Results are WebP, at most
 * 1920 × 1080 and never larger than the original, saved under UPLOAD_DIR so
 * each image is made once.
 */
const VERSION = "16x9-v1";
const MAX_W = 1920;
const DIR = path.join(path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "..", "uploads")), "derived", "slides-16x9");

/** Changes whenever the source image URL changes, so browsers can cache a slide forever. */
export const slideHash = (imageUrl: string) => createHash("sha1").update(`${imageUrl}|${VERSION}`).digest("hex").slice(0, 16);

const inFlight = new Map<string, Promise<Buffer | null>>();

async function make(imageUrl: string, file: string): Promise<Buffer | null> {
  const src = await readImage(imageUrl, true);
  if (!src) return null;
  const img = sharp(src, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w0 = meta.autoOrient?.width ?? meta.width;
  const h0 = meta.autoOrient?.height ?? meta.height;
  if (!w0 || !h0) return null;
  const width = Math.max(16, Math.min(MAX_W, w0, Math.floor((h0 * 16) / 9)));
  const height = Math.round((width * 9) / 16);
  const out = await img
    .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 82 })
    .toBuffer();
  await mkdir(DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, out);
  await rename(tmp, file);
  return out;
}

/** The 16:9 WebP for an image, made on first use. null = the source can't be read. */
export async function slide16x9(imageUrl: string): Promise<Buffer | null> {
  const hash = slideHash(imageUrl);
  const file = path.join(DIR, `${hash}.webp`);
  const cached = await readFile(file).catch(() => null);
  if (cached) return cached;
  let job = inFlight.get(hash);
  if (!job) {
    job = make(imageUrl, file).catch(() => null).finally(() => inFlight.delete(hash));
    inFlight.set(hash, job);
  }
  return job;
}

/** Make slides in the background (after a save) so the first visitor doesn't wait. */
export function warmSlides(imageUrls: string[]) {
  void (async () => {
    for (const u of imageUrls) await slide16x9(u);
  })();
}
