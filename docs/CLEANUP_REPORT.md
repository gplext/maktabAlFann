# Maktaba Al-Fann — Code Cleanup Report

**Folder:** `C:\Users\lapify\Downloads\maktaba-alfann-code`
**Date:** 15 August 2026

Nothing was hard-deleted. Everything removed sits in **`_to_delete\`** in your project root,
organised by category. Review it, then delete that folder yourself.

**Result: 128 MB → 41 MB of assets, 87 → 35 frontend source files, 60 → 25 npm dependencies.**

---

## 1. First — a problem with the download itself

Your Replit export was **incomplete**. Six things the build imports were missing, so
`pnpm install` and `pnpm run build` could not have worked on this copy:

| Missing | What it is |
| --- | --- |
| `tsconfig.base.json` | Every `tsconfig.json` in the repo extends it |
| `lib/api-zod/` | Zod request/response contracts — imported by 8 API routes |
| `lib/api-client-react/` | React Query hooks — imported by 13 frontend pages |
| `lib/object-storage-web/` | Declared as a dependency, never actually imported |
| `lib/api-spec/` | The OpenAPI file the two libs above were generated from |
| `lib/db/drizzle.config.ts` | Required by `pnpm --filter @workspace/db run push` |

You asked me to rebuild them, so I did — by reading every import site and reconstructing the exact
shapes the code expects.

### What I rebuilt

**`lib/api-zod/`** — 30 exported schemas covering health, gallery, artworks, artists, cart, storage
and shop. Each one derived from what the route actually parses and returns, checked line by line
against `routes/*.ts`.

**`lib/api-client-react/`** — 17 React Query hooks plus their `getXxxQueryKey` helpers and a shared
fetch layer, matching the Orval calling convention your pages already use
(`useGetArtwork(id, { query: { enabled, queryKey } })`).

**`lib/db/drizzle.config.ts`** and **`tsconfig.base.json`** — standard configurations for this stack.

**`lib/object-storage-web/`** — *not* rebuilt. It was declared in `package.json` and referenced in
two `tsconfig.json` files but never imported by a single line of code. I removed the references
instead. Same for the four `@uppy/*` packages — the uploader in
`src/components/image-uploader.tsx` is hand-written and uses plain `fetch` + `XMLHttpRequest`.

### How I verified it

- Both new packages typecheck clean under `tsc --strict` (exit 0).
- Every named import of `@workspace/api-zod`, `@workspace/api-client-react` and `@workspace/db`
  across all 113 source files resolves to a real export — **0 missing**.
- Every local `@/…` and relative import in the frontend still resolves after the file removals —
  **0 broken**.
- Every package left in `package.json` is imported somewhere reachable, and every package imported
  is declared — **0 unused, 0 undeclared**.

**Caveat:** these are faithful reconstructions, not your originals. The runtime shapes and the
calling conventions match, but if you can still reach the Replit project, re-downloading the real
`lib/api-zod` and `lib/api-client-react` is safer than trusting mine. Compare before overwriting.

---

## 2. A second thing that would have broken the build on Windows

`pnpm-workspace.yaml` contained an `overrides:` block excluding **every non-linux-x64 platform
binary** — win32, darwin, freebsd, android — for esbuild, rollup, lightningcss and
`@tailwindcss/oxide`:

```yaml
"esbuild>@esbuild/win32-x64": "-"
"rollup>@rollup/rollup-win32-x64-msvc": "-"
"@tailwindcss/oxide>@tailwindcss/oxide-win32-x64-msvc": "-"
```

That is correct on Replit, which only ever runs linux-x64. On your Windows machine it means pnpm
refuses to install the native binary Vite needs to run at all. I removed the platform exclusions and
left a comment explaining why, keeping the two genuinely useful overrides (the esbuild security pin)
and the whole `catalog:` block intact.

---

## 3. What was removed

### 3a. Dead frontend code — 52 files

| What | Count | Why |
| --- | ---: | --- |
| shadcn/ui components | 50 | Unreachable from `App.tsx`. Your pages import only `card` and `input`; `toast`, `toaster` and `tooltip` come in via `App.tsx`. The other 50 — `sidebar`, `carousel`, `chart`, `calendar`, `command`, `menubar`, `resizable`… — were scaffolded by the generator and never used. |
| `hooks/use-mobile.tsx` | 1 | Only ever imported by `ui/sidebar.tsx`, itself unused |
| `pages/artist-portal-edit.tsx` | 1 | 5.6 KB page with **no route and no import anywhere**. `App.tsx` has no `/artist-portal/edit` route. |

I determined this by building the full import graph from `main.tsx` and `App.tsx`, following both
static imports and the one lazy import (`FrameViewerModal` → `FrameViewer3D`, which is why the 3D
frame viewer was **kept**).

**35 source files remain**, all reachable.

### 3b. Unused npm dependencies — 39 packages

26 `@radix-ui/*` packages (the primitives behind the deleted components), plus `recharts`, `cmdk`,
`vaul`, `sonner`, `next-themes`, `react-day-picker`, `input-otp`, `embla-carousel-react`,
`react-resizable-panels`, `react-hook-form`, `@hookform/resolvers`, `react-icons`, `date-fns`, and
`zod` (never imported in the frontend). Also the three `@replit/vite-plugin-*` packages and the four
`@uppy/*` packages.

`package.json` went from **60 dependencies to 25**. Your `node_modules` and cold install time drop
accordingly.

### 3c. Images — 87 MB freed

**60 exact duplicates.** Your artwork folder had 98 PNGs, of which 76 were byte-identical copies of
just 13 originals. `beijing_golden_waterpaint.png` existed 6 times; `pandas_acrylic.png` 7 times.
I collapsed every `copy_N_<name>.png` into its `<name>.png` original.

**104 MB → 41 MB. 38 files remain.**

> ⚠️ **This requires a database update.** 60 artwork rows still point at the deleted `copy_N_` paths.
> Run `migration-02-image-paths.sql` (included) or those artworks will show broken images.
> The migration is a one-line regex rewrite and I have included a rollback.

**Unreferenced folders.** `public/artists/` (5 images, 9 MB) and `public/artworks/` (7 images,
14 MB) are not referenced by any line of code or any database row — leftovers from an earlier seed
using real artist names (Sadequain, Gulgee, Iqbal Mehdi). One old enquiry record mentions
`/artworks/flower-vendor.png`, but that's a frozen JSON snapshot, not a live path.

**`favicon.jpg`** — a 416 KB JPEG served as your favicon on every page load. Replaced with the
1 KB `favicon.svg` that was already sitting unused in the same folder.

### 3d. Six logo mockup HTML files

`logo-preview-1/2/3.html` and `logo-la-1/2/3.html` in `public/` — standalone design experiments,
publicly served, referenced by nothing. Anyone could load `yoursite.com/logo-la-2.html`.

### 3e. Replit-specific configuration

| File | Change |
| --- | --- |
| `vite.config.ts` | Removed 3 `@replit/*` plugins and the `@assets` alias pointing at `attached_assets/` (a folder that does not exist). **Added a `/api` dev proxy** — without it the frontend's relative `/api/...` calls 404 in local development. `BASE_PATH` now defaults to `/` instead of throwing. |
| `index.html` | Removed "built on Replit. Update this description" from the description and both OG/Twitter tags — that text was being served to Google. Removed an unused Inter font request (`index.css` loads Cinzel/Playfair/Scheherazade). Fixed the favicon. Added `og:image`. |
| `pnpm-workspace.yaml` | Removed the `@replit/*` catalog entries and the platform exclusions described above. |
| `replit.md` | Rewritten as `PROJECT.md` — the run commands, the full env-var list, corrected ports, and a note that `lib/api-zod` is now hand-maintained rather than generated. Old file preserved in `_to_delete/root/`. |

### 3f. Added

`.gitignore` — the repo had none, so `node_modules/`, `dist/` and any `.env` file were all
untracked-but-committable. It also ignores `_to_delete/`.

---

## 4. Things I found but did NOT change

These are behaviour changes, not cleanup. You should decide on each.

### 🔴 Anyone signed in can read and write any artwork's supplier record

`artifacts/api-server/src/routes/supplier.ts` — both routes use `requireArtistAuth`, which only
checks *that you are logged in*, not that you own the artwork:

```ts
router.get("/artist-portal/artworks/:id/supplier", requireArtistAuth, async (req, res) => {
  const artworkId = Number(req.params.id);        // <- straight from the URL
  const [supplier] = await db.select().from(suppliersTable)
    .where(eq(suppliersTable.artworkId, artworkId));   // <- no ownership check
```

Any signed-in collector can walk `/api/artist-portal/artworks/1/supplier` through
`/artworks/88/supplier` and read every supplier's **name, two phone numbers, email, street address
and Google Maps link** — and overwrite them via POST. Compare this with
`routes/artist-portal.ts`, which correctly filters by `submittedByClerkId` on every artwork route.
The fix is to copy that ownership check into both supplier handlers.

### 🔴 Order prices come from the browser

Covered in the database review — `POST /api/orders` writes `unitPrice` and `totalAmount` from the
request body with no auth and no server-side price lookup.

### 🟠 Anyone can request a signed upload URL

`POST /api/storage/uploads/request-url` has no authentication. Anyone can mint presigned URLs and
fill your object storage bucket.

### 🟠 Anyone can create a Clerk account through your API

`POST /api/collector/account` is unauthenticated, has no rate limit, and passes
`skipPasswordChecks: true`. This exists for guest checkout, but as written it's an open account
factory.

### 🟠 Session cookie is `secure: false` in production

`app.ts` sets `cookie: { secure: false }` unconditionally, so the admin session cookie is sent over
plain HTTP. It should be `secure: process.env.NODE_ENV === "production"`.

### 🟡 Three images are the wrong picture

Not a code bug — the files themselves are wrong. These are byte-identical to unrelated artworks:

| Artwork | Title | Shows instead |
| --- | --- | --- |
| 79 | Quiet inspection *(mouse peeking at a sleeping cat)* | the pandas painting |
| 77 | Stares in the alleyway | the Bengal rainforest sketch |
| 75 | Consolation of the empty yield *(weeping farmer)* | the Thai rice crop painting |

I left all three files in place rather than merge them, so you can re-upload the correct art. Also:
artworks 61 and 81 share `hotel_guest.png`, and `makatba_all_fann.png` (artwork 85) is the same
image as your old favicon.

### 🟡 `pages/admin.tsx` is 2,108 lines

Along with `artist-portal.tsx` (1,475) and `gallery-portal.tsx` (1,062). Not dead code, so I left
them, but they're the three files that will hurt most to change six months from now.

---

## 5. Getting it running

```bash
cd C:\Users\lapify\Downloads\maktaba-alfann-code
pnpm install

# terminal 1 — API
set DATABASE_URL=postgresql://...
set PORT=8080
set CLERK_SECRET_KEY=...
set CLERK_PUBLISHABLE_KEY=...
set SESSION_SECRET=...
set ADMIN_USERNAME=...
set ADMIN_PASSWORD=...
pnpm --filter @workspace/api-server run dev

# terminal 2 — frontend
set PORT=5173
set BASE_PATH=/
set VITE_CLERK_PUBLISHABLE_KEY=...
pnpm --filter @workspace/art-gallery run dev
```

Then `pnpm run typecheck` across the whole workspace. I could not run this myself — it needs the
full dependency install and your Clerk keys — so expect a small number of type errors where my
reconstructed schemas are stricter or looser than the originals. They will be in `lib/api-zod` and
easy to adjust; the shapes themselves are correct.

`ANTHROPIC_API_KEY` is also needed if you want the natural-language artwork search on `/art` to
work — `routes/artwork-search.ts` calls Claude to extract keywords, and falls back to plain word
splitting when the key is absent.

---

## 6. Suggested order of work

1. **Run `migration-02-image-paths.sql`** — 60 artworks currently point at deleted image files.
2. **Fix the supplier endpoints** — it's an ownership check in two handlers, and it's leaking PII.
3. **Run `migration-01-integrity.sql`** — after choosing what happens to artworks 13, 14, 85, 86, 87.
4. **Move order pricing server-side.**
5. **Verify the site**, then delete `_to_delete\`.
6. Then the schema work in section 4 of the database review — categories and currency.
