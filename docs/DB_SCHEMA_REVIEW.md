# Maktaba Al-Fann — Database Schema Review

**Reviewed:** 15 August 2026 · PostgreSQL 16 dump (`maktaba-alfann-db.sql`) + Drizzle schema in `lib/db/src/schema/`

---

## 1. What your database actually is

**27 tables**, 4 real foreign-key relationships, **zero indexes** beyond primary keys and unique
constraints. It divides into six groups:

### Core catalogue (the gallery itself)

| Table | Rows | Purpose |
| --- | ---: | --- |
| `artists` | 43 | Artist records — bio, country, style, contact, verification status, commission rate |
| `artworks` | 86 | The art. Title, image, medium, technique, price, approval status |
| `portfolio` | 1 | Extra images per artist, shown when an artist has no approved artworks |
| `tags` / `artwork_tags` | 20 / 12 | Free-form keyword tagging, many-to-many |

### Reference / lookup tables (dropdown values)

`art_categories` (6) · `art_subcategories` (2) · `art_styles` (10) · `artwork_types` (13) ·
`mediums` (11) · `techniques` (8) · `sizes` (5) · `storage_locations` (6)

### Identity & roles

| Table | Rows | Purpose |
| --- | ---: | --- |
| `users` | 3 | Mirror of Clerk accounts + a `role` column |
| `galleries` | 2 | Gallery accounts awaiting/holding admin approval |
| `gallery_artists` / `gallery_artworks` | 2 / 1 | Which gallery owns which artist / artwork |
| `artist_claims` | 0 | An artist claiming an existing artist record |
| `artist_merge_requests` | 3 | Request to merge duplicate artist records |

### Commerce

| Table | Rows | Purpose |
| --- | ---: | --- |
| `cart_items` | 11 | Session-scoped cart (no login needed) |
| `orders` / `order_line_items` | 9 / 11 | Placed orders and their lines |
| `enquiries` | 11 | The older "enquire, don't buy" flow — a JSON blob of items |
| `shop_items` | 3 | Frames, hanging hardware and other add-ons |
| `shop_item_types` | 3 | Categories of add-on, with base price and size support |
| `subcategory_compatibility` | 1 | Which add-on types fit which art subcategory |
| `gallery_commission` | 0 | Commission split per sale |
| `suppliers` | 2 | Where a physical artwork is stored, and who to contact |

### Site content

`gallery_about` (1 row) — the About page, with the team list stored as JSON.

---

## 2. The relationships

```
                            ┌──────────┐
                            │  users   │  (mirror of Clerk; role: collector/admin)
                            └────┬─────┘
                        clerk_user_id (text, NOT a FK anywhere)
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
  ┌─────▼──────┐          ┌──────▼──────┐          ┌──────▼──────┐
  │  artists   │          │  galleries  │          │   orders    │
  └─────┬──────┘          └──────┬──────┘          └──────┬──────┘
        │                        │                        │
        │ FK  ┌──────────────────┼──────────────┐         │ ✗ no FK
        │     │                  │              │         │
  ┌─────▼─────▼──┐      ┌────────▼───────┐  ┌───▼─────────▼──────┐
  │ artist_claims│      │gallery_artists │  │ order_line_items   │
  │ merge_reqs   │      │gallery_artworks│  └───┬────────────┬───┘
  │ portfolio    │      └────────┬───────┘      │ ✗ no FK    │ ✗ no FK
  └──────────────┘               │              │            │
                                 │        ┌─────▼─────┐  ┌───▼────────┐
        artist_id ✗ NO FK ───────┴───────►│ artworks  │  │ shop_items │
                                          └─────┬─────┘  └─────┬──────┘
                     ┌────────────────┬─────────┼──────────┐   │
                     │ ✗ no FK        │ ✗ no FK │ ✗ no FK  │   │ ✗ no FK
              ┌──────▼──────┐  ┌──────▼─────┐ ┌─▼────────┐ │ ┌─▼──────────────┐
              │ cart_items  │  │artwork_tags│ │suppliers │ │ │shop_item_types │
              └─────────────┘  └─────┬──────┘ └────┬─────┘ │ └────────────────┘
                                     │ ✗ no FK     │ ✗ no FK
                                 ┌───▼──┐    ┌─────▼───────────┐
                                 │ tags │    │storage_locations│
                                 └──────┘    └─────────────────┘

  Legend:  ──►  real FOREIGN KEY constraint (only 4 exist)
           ✗    relationship exists in application logic only — the database
                will happily accept a row pointing at nothing
```

**The four real foreign keys you have:** `artist_claims → artists`,
`artist_merge_requests → artists`, `portfolio → artists`, and the four
`gallery_artists`/`gallery_artworks` links.

**Everything else is unenforced.** That is the single biggest problem in this schema, and it has
already caused live data corruption — see below.

---

## 3. Faults, most damaging first

### 🔴 A. Broken references already in your live data

`artworks.artist_id` has no foreign key, and artists have been deleted without their artworks:

| Artwork | Title | points at artist | which… |
| --- | --- | ---: | --- |
| 13 | Oil Painting expression of The plains of scotland | **7** | does not exist |
| 14 | Reflections on Golden city of Beijing | **7** | does not exist |
| 85 | makatba all fann | **42** | does not exist |
| 86 | cheema | **42** | does not exist |
| 87 | The road in kashmir | **42** | does not exist |

This is not cosmetic. Every listing endpoint does an `INNER JOIN` on artists
(`artifacts/api-server/src/routes/artworks.ts`), so **these five artworks are invisible on your
site right now** — they don't appear in `/artworks`, in search, in featured, or in the cart. Artwork
85 and 86 are ones you uploaded yourself ("makatba all fann", "cheema"). They are in the database
and simply do not render.

`cart_items` row 6 also points at artwork 82, which no longer exists.

**Fix:** repoint or remove the orphans, then add the foreign keys so it can never recur.

### 🔴 B. Order prices are supplied by the browser

`POST /api/orders` takes `unitPrice` and `totalAmount` straight from the request body and writes
them to the database, with no auth and no server-side price lookup. Anyone can place an order for a
PKR 420,000 painting at a price of 1. Your `orders` table has no defence — `total_amount` is just an
integer column with no relationship to `artworks.display_price`.

**Fix:** the server should read prices from `artworks`/`shop_items` and compute the total itself.
The client should send only artwork IDs and quantities.

### 🔴 C. Money has no currency and no decimals

- `artworks.expected_price` / `display_price`, `orders.total_amount`,
  `order_line_items.unit_price`, `shop_items.price` are all bare `integer`.
- There is **no currency column** on any of them.
- `gallery_commission.currency` defaults to `'AED'` in the database but the API route that inserts
  rows defaults it to `'PKR'` (`routes/gallery-commission.ts`). Those disagree.

You are selling Pakistani art into the Gulf. Prices in the data range from `13` to `420000` —
artwork 83 is priced at **13**, which is either PKR 13 or a placeholder someone typed. You cannot
tell from the schema which currency any row is in.

**Fix:** `numeric(12,2)` for amounts plus an explicit `currency char(3)` column, defaulted once and
enforced with a CHECK.

### 🟠 D. Your lookup tables are decorative

You built proper reference tables — `art_categories`, `art_styles`, `mediums`, `techniques`,
`sizes` — and then stored free text in `artworks` anyway:

| Column | Should reference | Actual values in your data |
| --- | --- | --- |
| `artworks.art_category` | `art_categories` (Paintings, Sculptures, Drawings, Printmaking, Photography, AI Assisted) | `Handicraft`, `AI Art`, `Sculpture Work`, `Paintings`, `painting`, `Printmaking`, `Drawings`, `''`, `NULL` |
| `artworks.art_type` | `artwork_types` | `classic`, `waterpaint`, `oil painting`, `Realism`, `Folk Art`, `Sculpture`, `Contemporary`, `''` |
| `artworks.size` | `sizes` (LL/L/M/MS/S) | `24" x 36"`, `30" x 40"`, `M`, `L`, `LL`, `Medium`, `''` |
| `artworks.technique` | `techniques` | mostly `''`, some `Glazing`, `Pointillism` |
| `artists.style` | `art_styles` | `mughal`, `anime`, `freehand`, `mordern` *(typo)*, `minature` *(typo)* |

Only `art_subcategory_id` is a real (unenforced) ID column, and **it is NULL on all 86 artworks**.

The consequence is visible on your own site: **your category filter cannot work.** A visitor filters
by "Paintings" and gets nothing, because the artworks are tagged `Handicraft` and `AI Art` —
categories that don't exist in `art_categories`. The `/artworks/filters` endpoint sidesteps this by
building the filter list from `SELECT DISTINCT` on the free-text columns, which means your filter
dropdown shows `classic`, `waterpaint` and `sketch with 2 colors` as if they were curated
categories.

**Fix:** convert each to a proper `*_id integer REFERENCES` column, migrate the existing strings
with a mapping table, then drop the text columns.

### 🟠 E. Three overlapping ways to describe a size

`artworks` carries `size` (text: `24" x 36"` or `M`), `dimensions` (text: `12x16inch`, mostly empty)
**and** `width_cm` / `height_cm` (integers, mostly NULL — and where set they're nonsense: artwork 86
is `2 × 3`, artwork 85 is `5 × 9`). Nothing keeps them consistent. Pick one: `width_cm`/`height_cm`
as the truth, with a generated display string.

### 🟠 F. Two competing add-on compatibility systems

- `shop_items.compatible_art_categories` — a JSON array of strings. In your data it holds *medium*
  names (`"Oil on Canvas"`, `"Watercolor"`, `"Sculpture"`), not category names.
- `subcategory_compatibility` — a proper relational table linking category → subcategory → item type.
  It has **one row**.

The cart code (`routes/cart.ts`) has already given up on both and hardcodes
`item.type === "Frames"` to mean "applies to everything". Choose the relational table and delete the
JSON column.

### 🟠 G. `cart_items.notes` is a text column doing three jobs

It stores a free-text note *and* JSON add-on selections — in **two incompatible shapes**:

```
row 10:  {"addons":[{"id":1,"name":"Aligator skin brown wide frame"}]}
row 81:  {"selectedAddons":[{"shopItemId":3,"name":"Black frame","price":13,"type":"Frames"}]}
```

`artwork-detail.tsx` writes the first shape; `PATCH /cart/:sessionId/items/:artworkId/addons` writes
the second. Whichever reader you use, half the rows fail to parse.

**Fix:** a `cart_item_addons` table (`cart_item_id`, `shop_item_id`, `quantity`) and keep `notes`
for actual notes.

### 🟠 H. No indexes at all

Every query outside a primary-key lookup is a sequential scan. At 86 artworks nobody notices; at
5,000 with real traffic the artwork list, the cart, and the artist page all degrade together. The
columns you join and filter on daily and have no index for:

`artworks.artist_id`, `artworks.status`, `artworks.is_featured`, `artworks.art_category`,
`cart_items.session_id`, `orders.session_id`, `orders.clerk_user_id`,
`order_line_items.order_id`, `artwork_tags.tag_id`, `artists.clerk_user_id`,
`artists.is_verified`, `enquiries.clerk_user_id`, `gallery_artists.artist_id`,
`suppliers.artwork_id`.

### 🟡 I. `artists.clerk_user_id` is not unique

`galleries.clerk_user_id` has a UNIQUE constraint. `artists.clerk_user_id` does not — so one Clerk
account can end up attached to two artist records, which is exactly the situation
`artist_merge_requests` exists to clean up after. Add the constraint and the merge queue mostly
stops filling.

### 🟡 J. Status columns are free text

`artworks.status`, `artists.is_verified`, `galleries.status`, `orders.status`,
`enquiries.status`, `artist_claims.status`, `gallery_commission.status` are all `text` with no
CHECK. A typo in one route (`"aproved"`) silently hides a record forever. The allowed values are
already documented in comments in your Drizzle files — turn them into CHECK constraints or enums.

### 🟡 K. `artists` forces fake data on registration

`birth_year`, `gender`, `style`, `photo_url`, `short_bio`, `biography`, `influences` are all
`NOT NULL` with no default. Your own newest artists show the result: artist 45 has
`gender=''`, `photo_url=''`, `biography=''`, `style='mordern'`. The constraint isn't protecting
anything — it's just pushing empty strings in instead of NULLs, which is worse because
`WHERE photo_url IS NULL` no longer finds them. Make the genuinely optional ones nullable.

### 🟡 L. `timestamp without time zone` everywhere

Every timestamp column is naive. You are in Karachi (UTC+5) selling to Dubai (UTC+4) and Riyadh
(UTC+3). `created_at` on an order is ambiguous. Use `timestamptz`.

### 🟡 M. Two parallel purchase paths

`enquiries` (JSON blob of items, 11 rows, tied to Clerk) and `orders` + `order_line_items`
(relational, 9 rows, tied to session) do overlapping jobs. The `enquiries.items` JSON has already
drifted from reality — enquiry 1 records artwork 4 as *"The Flower Vendor of Empress Market"*, but
artwork 4 is now *"Reflections on hot water springs in Iceland"*. That's the classic JSON-snapshot
problem: it's fine as a historical record, dangerous as a live reference. Decide whether enquiries
are an archive (keep the snapshot, add a note saying so) or a live flow (make them relational).

### 🟡 N. Denormalised copies with no FK

`gallery_commission` stores `artwork_title` and `artist_name` alongside `artwork_id`/`artist_id`,
and `order_line_items` stores `title` and `image_url`. For orders this is *correct* — you want the
price and title as sold, frozen. But there's no FK on the ID columns to go with it, so you get the
downsides of both approaches. Keep the snapshot, add the FK.

### ⚪ O. Smaller things

- `gallery_about` is a settings singleton with a `serial` PK — nothing stops a second row. Add
  `CHECK (id = 1)`.
- `portfolio` has both `image_urls` (jsonb) and `admin_items` (jsonb) holding the same kind of thing.
- `storage_locations_id_seq` is at **528** with 6 rows; `gallery_commission_id_seq` is at 11 with 0
  rows. Someone has been repeatedly inserting and deleting — worth understanding why.
- `order_line_items` allows both `artwork_id` and `shop_item_id` to be NULL, or both set. Add a
  CHECK that exactly one is present.
- No `updated_at` on `artworks`, `artists`, `galleries` — you cannot tell when a record last changed.
- `artists.saying` / `saying_author` (a quote) sit in the artist table but are really presentation
  content.

---

## 4. So — is it a good schema?

**It is a reasonable schema that has been let go.** The shape is right: the entities are the correct
entities, the many-to-many joins (`artwork_tags`, `gallery_artists`, `gallery_artworks`) are modelled
properly, and separating `orders` from `order_line_items` was the right call. Somebody knew what they
were doing.

What went wrong is that it grew by addition — every new feature bolted a column onto `artworks`
(which now has 34 columns) or added a parallel mechanism next to an existing one, and constraints
were never added because Drizzle's `push` makes it easy to skip them. The result is a schema where
**the database enforces almost nothing and the application is expected to get everything right** —
and it demonstrably hasn't, since you have five artworks that are invisible on your own site.

You do not need to redesign it. You need to:

1. Repair the five orphaned artworks and the one orphaned cart row.
2. Add the ~20 missing foreign keys so it can't happen again.
3. Add indexes.
4. Convert the free-text category/type/size/style columns to real references — this is what will
   make your filters actually work.
5. Fix money (currency + decimals) and compute order totals server-side.

Steps 1–3 are mechanical and safe; I've written them for you. Step 4 needs your decisions about
which category each existing artwork belongs to. Step 5 is a code change, not just a schema change.

---

## 5. What I've prepared

`migration-01-integrity.sql` — repairs the orphans, adds every missing foreign key, adds indexes,
adds status CHECK constraints, makes `artists.clerk_user_id` unique, adds `updated_at`, and
constrains `gallery_about` to one row. It runs in a transaction and **stops rather than corrupt
anything** if the orphan repair hasn't been decided.

Read the header of that file before running it — the first section requires a choice from you about
what to do with artworks 13, 14, 85, 86 and 87.
