import { open, readFile } from "node:fs/promises";
import path from "node:path";
import fs from "node:fs";

/**
 * Pixel size of an image, read from its file header (PNG, JPEG, WebP, GIF).
 * Results are cached per URL for the life of the process.
 */
export type Size = { width: number; height: number };

const cache = new Map<string, Size | null>();
const HEAD_BYTES = 512 * 1024;

function staticRoots(): string[] {
  const roots = [
    process.env.STATIC_DIR,
    path.resolve(process.cwd(), "..", "art-gallery", "dist", "public"),
    path.resolve(process.cwd(), "..", "art-gallery", "public"),
  ];
  return roots.filter((r): r is string => !!r && fs.existsSync(r));
}

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "..", "uploads"));

async function readHead(file: string, whole = false): Promise<Buffer | null> {
  if (whole) return readFile(file).catch(() => null);
  try {
    const fh = await open(file, "r");
    try {
      const buf = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

/** The image's bytes: the first 512 KB (enough for its size), or the whole file. */
export async function readImage(url: string, whole = false): Promise<Buffer | null> {
  const upload = /storage\/objects\/uploads\/([0-9a-f-]{36})/i.exec(url);
  if (upload) return readHead(path.join(UPLOAD_DIR, "uploads", upload[1]!), whole);

  if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url, {
        headers: whole ? {} : { Range: `bytes=0-${HEAD_BYTES - 1}` },
        signal: AbortSignal.timeout(whole ? 20000 : 5000),
      });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return Buffer.from(whole ? ab : ab.slice(0, HEAD_BYTES));
    } catch {
      return null;
    }
  }

  if (url.startsWith("/")) {
    const clean = decodeURIComponent(url.split(/[?#]/)[0]!);
    for (const root of staticRoots()) {
      const file = path.join(root, clean);
      if (!file.startsWith(root)) continue; // no ../ escapes
      const head = await readHead(file, whole);
      if (head) return head;
    }
  }
  return null;
}

export function parseSize(b: Buffer): Size | null {
  if (b.length < 24) return null;
  // PNG
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  // GIF
  if (b.toString("ascii", 0, 3) === "GIF") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  // WebP
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8 " && b.length >= 30) return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L" && b.length >= 25) {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X" && b.length >= 30) return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    return null;
  }
  // JPEG: walk the markers to the first frame header (SOFn).
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

export async function imageSize(url: string): Promise<Size | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;
  const head = await readImage(url);
  const size = head ? parseSize(head) : null;
  const ok = size && size.width > 0 && size.height > 0 ? size : null;
  // A remote image that failed may just be slow: only remember failures for local files.
  if (ok || !/^https?:\/\//i.test(url)) cache.set(url, ok);
  return ok;
}
