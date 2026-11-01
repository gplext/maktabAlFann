import express, { Router, type IRouter, type Request, type Response, type RequestHandler } from "express";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile, stat } from "fs/promises";
import path from "path";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { getUserId } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Local disk storage. The cloud storage above only works inside Replit (it talks to a Replit-only
 * helper on 127.0.0.1:1106). On any other machine — your PC, a VPS — PRIVATE_OBJECT_DIR is not set,
 * so uploaded images are saved in a folder instead: UPLOAD_DIR, or "uploads" in the project root.
 */
const USE_LOCAL = process.env.STORAGE_DRIVER === "local" || !process.env.PRIVATE_OBJECT_DIR;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "..", "uploads"));
const MAX_BYTES = 20 * 1024 * 1024;
/** Upload slots handed out by request-url, waiting for their PUT (10 minutes). */
const pending = new Map<string, { owner: string; expires: number }>();
const ownerOf = (req: Request) => (req.session?.isAdmin ? "admin" : getUserId(req) ?? "");
const SAFE_ID = /^[0-9a-f-]{36}$/;

/**
 * Only somebody with an account may mint an upload URL.
 *
 * This endpoint used to be completely open: anyone could POST to it in a loop
 * and fill the object-storage bucket with whatever they liked, at your cost.
 * A presigned PUT URL is a write credential — it must not be handed to an
 * anonymous caller.
 *
 * Either identity is accepted, because both legitimately upload images:
 *   - a signed-in session (artist or gallery uploading artwork and profile photos,
 *     including during registration, before their artist record exists), or
 *   - the admin session (admin console).
 */
const requireUploader: RequestHandler = (req, res, next) => {
  if (req.session?.isAdmin === true) return next();
  const userId = getUserId(req);
  if (userId) return next();
  res.status(401).json({ error: "Unauthorized" });
};

/** A generous ceiling — enough for a bulk upload, not enough to abuse. */
const uploadRateLimit = rateLimit({
  name: "upload-url",
  limit: 60,
  windowMs: 10 * 60_000,
  message: "Too many upload requests. Please wait a few minutes and try again.",
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireUploader, uploadRateLimit, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    if (USE_LOCAL) {
      if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Only image files are allowed." }); return; }
      if (size > MAX_BYTES) { res.status(400).json({ error: "Image must be under 20 MB." }); return; }
      const id = randomUUID();
      for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
      pending.set(id, { owner: ownerOf(req), expires: Date.now() + 10 * 60_000 });
      res.json(RequestUploadUrlResponse.parse({
        uploadURL: `/api/storage/local-upload/${id}`,
        objectPath: `/objects/uploads/${id}`,
        metadata: { name, size, contentType },
      }));
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/** PUT /storage/local-upload/:id — receives the image bytes for a slot from request-url (local storage only). */
router.put("/storage/local-upload/:id", requireUploader, express.raw({ type: () => true, limit: MAX_BYTES }), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const slot = pending.get(id);
  if (!USE_LOCAL || !SAFE_ID.test(id) || !slot || slot.expires < Date.now() || slot.owner !== ownerOf(req)) {
    res.status(403).json({ error: "Upload link expired or invalid. Please try again." });
    return;
  }
  const contentType = String(req.headers["content-type"] ?? "");
  const body = req.body as Buffer;
  if (!contentType.startsWith("image/") || !Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Only image files are allowed." });
    return;
  }
  try {
    const dir = path.join(UPLOAD_DIR, "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, id), body);
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ contentType, size: body.length, uploadedAt: new Date().toISOString() }));
    pending.delete(id);
    res.status(200).json({ ok: true });
  } catch (error) {
    req.log.error({ err: error, dir: UPLOAD_DIR }, "Could not save uploaded image");
    res.status(500).json({ error: "Could not save the image on the server." });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    if (USE_LOCAL) {
      const m = /^uploads\/([0-9a-f-]{36})$/.exec(wildcardPath);
      if (!m) { res.status(404).json({ error: "Object not found" }); return; }
      const file = path.join(UPLOAD_DIR, "uploads", m[1]!);
      try {
        await stat(file);
      } catch {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      const meta = await readFile(`${file}.json`, "utf8").then((t) => JSON.parse(t)).catch(() => ({}));
      res.setHeader("Content-Type", meta.contentType ?? "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(await readFile(file));
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
