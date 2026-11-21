# Data intake fields

Generated from `fields.mjs`. **Required** = row is rejected without it. **DB needs** = the site's database expects it (row imports, but is reported).
In CSV, put several values in one cell separated by ` | `. True/false: `true` or `false`.

## Artists — `artists.json` / `artists.csv`

| Field | Type | Need | Notes |
|---|---|---|---|
| `key` | key | **Required** | Unique id: lowercase letters, digits and dashes. Never change it once used. |
| `name` | string | **Required** | Name as shown on the site. |
| `otherNames` | list |  | Other spellings, used to catch duplicates. |
| `country` | string | **Required** |  |
| `basedIn` | string |  | City the artist lives or works in. |
| `birthYear` | year | DB needs |  |
| `deathYear` | year |  | Empty for living artists. |
| `birthPlace` | string |  |  |
| `gender` | male / female / other | DB needs |  |
| `style` | string | DB needs | Main style. Should match a style on the site. Site values: Impressionism, Cubism, Realism, Abstract, Expressionism, Surrealism, Minimalism, Contemporary, Mughal Miniature, Folk Art |
| `level` | master / emerging / student | DB needs | master = established, well-known artist; emerging = practising artist building a career; student = art student (e.g. undergraduate) or no experience yet. Filters the Artists page. Empty imports as emerging. |
| `shortBio` | text | DB needs | One or two sentences. |
| `biography` | text | DB needs |  |
| `influences` | text | DB needs |  |
| `education` | text |  |  |
| `awards` | text |  |  |
| `exhibitions` | text |  |  |
| `websiteUrl` | url |  |  |
| `contactEmail` | email |  | Only with the artist's permission. |
| `photoUrl` | url | DB needs | Portrait. Must be ours, licensed or permitted. |
| `photoCredit` | string |  |  |
| `photoLicense` | permission / public-domain / CC0 / CC BY / CC BY-SA / own |  | Required when photoUrl is set. |
| `galleryKeys` | list of galleries keys |  | Galleries that represent the artist (keys from galleries). |
| `dataSource` | web / partner-gallery / artist / staff | **Required** | Where this row came from. |
| `sources` | list |  | Links that back up the facts. |
| `verified` | bool |  | true once the artist or gallery confirmed the details. |
| `notes` | text |  |  |
| `madeUpFields` | list |  | Fields holding INVENTED test values (not real data). The importer refuses to load these into any database other than the local one. Replace them with real data and empty this list before going live. |

## Gallerys — `galleries.json` / `galleries.csv`

| Field | Type | Need | Notes |
|---|---|---|---|
| `key` | key | **Required** |  |
| `name` | string | **Required** |  |
| `city` | string | **Required** |  |
| `country` | string | **Required** |  |
| `address` | text |  |  |
| `description` | text | DB needs |  |
| `foundedYear` | year |  |  |
| `websiteUrl` | url |  |  |
| `email` | email |  |  |
| `phone` | string |  |  |
| `logoUrl` | url |  |  |
| `isPartner` | bool |  | true when the gallery has agreed to list with us. |
| `dataSource` | web / partner-gallery / staff | **Required** |  |
| `sources` | list |  |  |
| `verified` | bool |  |  |
| `notes` | text |  |  |
| `madeUpFields` | list |  | Fields holding INVENTED test values (not real data). The importer refuses to load these into any database other than the local one. Replace them with real data and empty this list before going live. |

## Artworks — `artworks.json` / `artworks.csv`

| Field | Type | Need | Notes |
|---|---|---|---|
| `key` | key | **Required** |  |
| `artistKey` | key of artists | **Required** |  |
| `galleryKey` | key of galleries |  | Gallery offering or holding it, if any. |
| `title` | string | **Required** |  |
| `year` | year | DB needs |  |
| `yearIsApprox` | bool |  | true for 'circa' dates. |
| `category` | string | **Required** | Site values: Paintings, Sculptures, Drawings, Printmaking, Photography, AI Assisted |
| `style` | string |  | Empty = artist's style. Site values: Impressionism, Cubism, Realism, Abstract, Expressionism, Surrealism, Minimalism, Contemporary, Mughal Miniature, Folk Art |
| `medium` | string |  | Free text as written by the gallery. |
| `paintMaterial` | string |  | Site values: Oil, Acrylic, Watercolour, Gouache, Ink, Charcoal, Pastel, Tempera, Gold Leaf, Natural Pigments, Mixed Media, Bronze, Marble, Wood, Resin, Ceramic, Steel |
| `baseType` | string |  | Site values: Canvas, Stretched canvas, Gallery-wrap canvas, Linen, Paper, Canvas board / panel, Wasli Paper, Rolled canvas, Wood Panel, Board, Wasli, Glass, Metal, Stone, Hardboard / MDF, Clay, Fabric, Wall / Plaster |
| `theme` | string | DB needs | Subject in a few words. |
| `shortDescription` | text | DB needs |  |
| `longDescription` | text |  | A few paragraphs about the artwork (blank line between paragraphs). Shown on the artwork page; the first lines appear on the home page. |
| `widthCm` | number |  |  |
| `heightCm` | number |  |  |
| `depthCm` | number |  |  |
| `framed` | bool |  |  |
| `availability` | for-sale / on-request / sold / not-for-sale | **Required** |  |
| `price` | number |  | Asking price, numbers only. |
| `currency` | PKR / USD / GBP / AED / EUR |  |  |
| `featured` | bool |  | true for the best pictures: shown in Stories from Pakistan and as the artist's picture. |
| `artistSlide` | bool |  | true = the picture used for this artist in the Artists page carousel (a landscape painting). Those artists are shown first. |
| `heldBy` | string |  | Museum or collection that owns it. |
| `imageUrl` | url |  |  |
| `imageCredit` | string |  |  |
| `imageLicense` | permission / public-domain / CC0 / CC BY / CC BY-SA / own |  | Required when imageUrl is set. |
| `dataSource` | web / partner-gallery / artist / staff | **Required** |  |
| `sources` | list |  |  |
| `verified` | bool |  |  |
| `notes` | text |  |  |
| `madeUpFields` | list |  | Fields holding INVENTED test values (not real data). The importer refuses to load these into any database other than the local one. Replace them with real data and empty this list before going live. |
