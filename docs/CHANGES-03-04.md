# Maktaba Al-Fann — Pricing, Currency and Lookup Tables

**Date:** 15 August 2026 · 37 source files changed, 4 new, 2 new migrations

Three problems fixed, with the database, the API and the frontend moved together
so nothing is left half-migrated.

---

## 1. Order prices are now computed on the server

**Was:** `POST /api/orders` took `unitPrice` and `totalAmount` from the request
body and wrote them to the database. No auth, no price lookup.

**Now:** the client sends only ids and quantities. The server reads every price
from `artworks.display_price` / `shop_items.price` and sums the total itself.

```jsonc
// what the browser sends now
{ "sessionId": "…", "items": [ { "artworkId": 45, "quantity": 1 },
                               { "shopItemId": 3, "quantity": 2 } ] }
```

Proven against a live PostgreSQL instance:

```
POST /orders  {"artworkId":45,"unitPrice":1,"totalAmount":1}
  → order total charged: 55555.25 PKR      (the forged 1 was ignored)
```

Also closed while I was in there:

| Check | Behaviour |
| --- | --- |
| Artwork that isn't approved, or whose artist isn't approved | rejected — *"…is not currently available"* |
| Artwork with no display price | rejected — *"…is price-on-request, please enquire instead"* |
| Out-of-stock or inactive add-on | rejected, naming the item and the stock left |
| Same original artwork twice in one order | rejected |
| Quantity > 1 on an original | rejected |
| `clerkUserId` supplied in the body | **ignored** — identity comes from the Clerk session, so an order can't be filed against someone else's account |
| `GET /orders?clerkUserId=someone-else` | `403 Forbidden` |

**Add-ons are now line items.** The old checkout added add-on prices into
`totalAmount` but never recorded them, which is why your order #46 totals 97,015
against 97,000 of line items. Every add-on now gets its own row with its
`shop_item_id`, so an order's total always equals the sum of its lines.

Guest checkout still works exactly as before: the order is stored anonymously
against the browser session, and `GET /orders` claims it for the account the
first time that person signs in.

---

## 2. Money is decimal, and PKR is written down

`migration-03-money.sql`

- Every amount became `numeric(12,2)` — `expected_price`, `display_price`,
  `total_amount`, `unit_price`, `shop_items.price`, `shop_item_types.base_price`,
  and the three `gallery_commission` columns.
- `orders.currency` added, `char(3)`, default `PKR`, frozen at time of sale.
- `gallery_commission.currency` default changed **AED → PKR**, resolving the
  disagreement between the column default and `routes/gallery-commission.ts`.
- CHECK constraints: no negative amounts, currency must be three capitals, and
  `commission_amount + artist_earning` must equal `sale_price` to within half a
  rupee.
- Column comments recorded in the database itself, so the next person doesn't
  have to guess the currency.

### The trap this could have set

PostgreSQL hands `numeric` back to node-postgres as a **string**. Left alone,
`displayPrice` would have arrived in the browser as `"55555.25"` and
`price + addonPrice` would have produced `"55555.2513"`.

`lib/db/src/schema/_money.ts` is a Drizzle custom type that converts on read and
writes a fixed two-decimal string on the way back:

```
GET /artworks/6  displayPrice = 1234.56  (type: number)
order total = 1273.56                    (1234.56 + 13 × 3)
stored in postgres: 1273.56 PKR
```

Verified end to end. A new `formatMoney()` helper replaced 31 hand-written
`Rs. {x.toLocaleString()}` renders across cart, admin, collector portal and
artist portal — `toLocaleString()` alone prints `68000.5` for eight rupees
fifty.

**Deploy the code and migration-03 together.** Old code against the new column
types will render prices as strings.

---

## 3. The lookup tables are real, so the category filter works

`migration-04-lookup-fks.sql`

`artworks.art_category` held `Handicraft`, `AI Art`, `Sculpture Work`,
`painting`, `''` and `NULL` — none of which exist in `art_categories`. That is
why filtering by "Paintings" returned nothing.

Four columns became foreign keys:

| Was (free text) | Now |
| --- | --- |
| `art_category` | `art_category_id` → `art_categories` — **NOT NULL** |
| `art_type` *and* `art_style` | `art_style_id` → `art_styles` |
| `size` | `size_id` → `sizes` |
| `technique` | `technique_id` → `techniques` |

`medium` and `theme` stay free text on purpose — `medium` holds descriptive
prose like *"Watercolor and gold leaf on paper"* that no lookup list can
express, and it is shown verbatim on the artwork page.

### The art_type / art_style bug

The artist portal's **"Art Style"** dropdown was wired to `artType`. That is why
`art_type` held a mix of media (`waterpaint`, `oil painting`) and styles
(`Realism`, `Folk Art`), and why `art_style` was empty on all 86 rows. The
dropdown now writes to `art_style_id`, and the migration moves existing values
into the column they belong in.

### Mapping applied

Editable at the top of the migration — change any row before running.

```
Handicraft     → Paintings      classic              → Realism
AI Art         → AI Assisted    modern, acrylic      → Contemporary
Sculpture Work → Sculptures     historic-culture     → Folk Art
painting       → Paintings      gothic               → Expressionism
(blank / null) → Paintings      splatter             → Abstract
                                sketch with 2 colors → Minimalism
                                waterpaint           → Impressionism
```

`24" x 36"` and `30" x 40"` are converted to cm and bucketed by longest side —
both land in **L** (80–120 cm). Artwork 88 "Theme park" had no category at all
but `art_type = 'Sculpture'`, so the migration reads that as a hint and files it
under Sculptures.

**Nothing is lost.** Every old value is copied to
`artworks_lookup_migration_audit` before the columns are dropped. Review it,
correct anything in the admin console, then drop that table.

### Result, measured on the migrated database

```
Paintings=8, Sculptures=4, Drawings=1, Printmaking=1, Photography=0, AI Assisted=1
artCategoryId=1 → 8 artworks    artCategoryId=2 → 4 artworks
```

The `/art` sidebar now offers **Category** and **Style** as separate filters with
a live count beside each, and greys out an option with none rather than offering
a filter that returns nothing. It used to be built from `SELECT DISTINCT` on the
free-text column, which is how `waterpaint` and `sketch with 2 colors` ended up
presented as curated categories.

### Where `dimensions` went

`size` is a bucket code now (`L`), so it can no longer carry a measurement. The
migration copies any measurement out of `size` into `dimensions` first, and the
3D frame viewer reads `dimensions` (or `width_cm × height_cm`) for its aspect
ratio. Without that it would have rendered every frame square.

---

## What changed in the code

**New files**

| File | Purpose |
| --- | --- |
| `lib/db/src/schema/_money.ts` | The `money` Drizzle type, `BASE_CURRENCY`, `toMoney()` |
| `artifacts/api-server/src/lib/classification.ts` | Validates lookup ids; `deriveDisplayPrice()` — the single place a public price is produced |
| `artifacts/api-server/src/lib/validation.ts` | Turns Zod failures into one readable sentence instead of a JSON dump |
| `artifacts/art-gallery/src/lib/money.ts` | `formatMoney()`, `sumMoney()` |

**Schema** — `artworks`, `orders`, `shop_items`, `shop-item-types`,
`gallery-commission` rewritten; foreign keys added to `cart`, `tags`,
`suppliers`, `lookup-tables`, `subcategory-compatibility` and
`artists.clerk_user_id` so `drizzle-kit push` stops trying to remove the
constraints migration-01 added.

**API** — 11 routes updated. All artwork queries now join the lookup tables and
return each field as a pair: `artCategoryId` for filtering and forms,
`artCategory` for display.

**Frontend** — 8 pages. Both artist portals and the gallery portal submit lookup
ids; `/art` filters by id; prices render through `formatMoney`.

### Backwards compatibility

Responses still include `artType` as a deprecated alias of `artStyle`, so any
view not yet migrated keeps rendering. It is marked `@deprecated` in `api-zod`
and can be removed once you're satisfied. `GET /artworks?artType=Realism` also
still works alongside the new `?artStyle=` and `?artCategoryId=`.

---

## Verification

- **All four packages typecheck at zero errors** — `lib/db`, `lib/api-zod`,
  `lib/api-client-react`, `artifacts/api-server`, `artifacts/art-gallery`.
  (The only remaining messages are `import.meta.env` in `App.tsx`, which
  resolves under the project's own `vite/client` types, and the untouched
  `components/ui/` files.)
- **Both migrations run clean** against PostgreSQL 16 loaded with your data's
  exact shape, including the artworks that carry `Handicraft`, `Sculpture Work`
  and blank categories.
- **The API was built and run for real** against that migrated database — the
  forged-price attack, the category filter, guest checkout, order claiming,
  add-ons as line items, decimal round-tripping, artist submission with lookup
  ids, and admin price setting were all exercised over HTTP.

## Run order

```bash
pg_dump "$DATABASE_URL" --format=plain --no-owner --no-acl --file=backup.sql

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migrations/migration-02-image-paths.sql
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migrations/migration-01-integrity.sql  # after choosing Section 0
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migrations/migration-03-money.sql
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f migrations/migration-04-lookup-fks.sql

pnpm install && pnpm run typecheck && pnpm run build
```

03 and 04 are independent of each other; both need 01's foreign keys to make
sense, and 02 should go first because it is the least entangled.

## Still open

- **`supplier.ts` leaks PII** — any signed-in user can read and overwrite any
  artwork's supplier name, phones, email and address. Two handlers need the
  ownership check that `artist-portal.ts` already uses. This is now the most
  serious thing left.
- `POST /api/storage/uploads/request-url` and `POST /api/collector/account` are
  both unauthenticated.
- `app.ts` sets the session cookie with `secure: false` unconditionally.
- `shop_items.compatible_art_categories` still holds *medium* names in a JSON
  array and never matches a category; `routes/cart.ts` works around it by
  treating every `Frames` item as universal. Replacing it with the
  `subcategory_compatibility` table is a separate job.
