/**
 * @workspace/api-zod
 *
 * Runtime request/response contracts shared by the API server.
 * Reconstructed from the shapes the Express routes actually parse and emit.
 * Keep this file as the single source of truth for wire shapes — the React
 * Query hooks in @workspace/api-client-react mirror these types.
 */
import { z } from "zod/v4";

/* ── primitives ─────────────────────────────────────────────────────────── */

/** Query/path params arrive as strings — coerce, then validate. */
const IdParam = z.coerce.number().int().positive();
const OptionalInt = z.coerce.number().int().optional();
const OptionalBool = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => (typeof v === "boolean" ? v : v === "true"))
  .optional();

/** Treat "" from an empty query field the same as an omitted field. */
const OptionalText = z
  .string()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/**
 * A monetary amount in the gallery base currency (PKR).
 *
 * Stored as numeric(12,2). node-postgres returns numeric as a STRING, and the
 * Drizzle `money` type in lib/db converts it back to a number on read — but
 * accept a numeric string here too, so a hand-rolled query or a raw
 * `db.execute` that skips that conversion cannot corrupt a response.
 */
const Money = z.coerce.number().nonnegative();
const OptionalMoney = z.coerce.number().nonnegative().nullish();

/** ISO-4217 currency code. */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);
export const BASE_CURRENCY = "PKR";

/* ── health ─────────────────────────────────────────────────────────────── */

export const HealthCheckResponse = z.object({ status: z.string() });
export type HealthCheckResponse = z.infer<typeof HealthCheckResponse>;

/* ── gallery ────────────────────────────────────────────────────────────── */

export const GalleryTeamMember = z.object({
  name: z.string(),
  role: z.string(),
  bio: z.string().default(""),
  photoUrl: z.string().default(""),
});
export type GalleryTeamMember = z.infer<typeof GalleryTeamMember>;

export const GetGalleryAboutResponse = z.object({
  id: z.number().int(),
  name: z.string(),
  founded: z.number().int(),
  mission: z.string(),
  history: z.string(),
  vision: z.string(),
  team: z.array(GalleryTeamMember).default([]),
});
export type GetGalleryAboutResponse = z.infer<typeof GetGalleryAboutResponse>;

export const GetGalleryStatsResponse = z.object({
  totalArtworks: z.number().int(),
  totalArtists: z.number().int(),
  countriesRepresented: z.number().int(),
  artTypes: z.number().int(),
  featuredCount: z.number().int(),
});
export type GetGalleryStatsResponse = z.infer<typeof GetGalleryStatsResponse>;

/* ── artworks ───────────────────────────────────────────────────────────── */

export const TimelineEvent = z.object({
  year: z.union([z.string(), z.number()]),
  title: z.string(),
  description: z.string(),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

/**
 * Card-level artwork shape returned by list/featured/search endpoints.
 *
 * Classification fields come in pairs: `xxxId` is the foreign key (what forms
 * submit and what filters should use), `xxx` is the resolved display name (what
 * the UI renders). The server joins the lookup tables so the client never has
 * to.
 */
export const ArtworkSummary = z.object({
  id: z.number().int(),
  title: z.string(),
  artistId: z.number().int(),
  artistName: z.string(),
  nationality: z.string(),

  artCategoryId: z.number().int(),
  artCategory: z.string(),
  artStyleId: z.number().int().nullish(),
  artStyle: z.string().nullish(),
  sizeId: z.number().int().nullish(),
  /** Size bucket code — LL / L / M / MS / S. */
  size: z.string().nullish(),
  /** Human label for the bucket, e.g. "Large". */
  sizeLabel: z.string().nullish(),

  /**
   * @deprecated Alias of `artStyle`, kept so any view not yet migrated keeps
   * working. The old `art_type` column held style names by mistake; it was
   * replaced by `art_style_id` in migration-04. Remove after the next release.
   */
  artType: z.string().nullish(),

  theme: z.string(),
  year: z.number().int(),
  imageUrl: z.string(),
  thumbnailUrl: z.string(),
  shortDescription: z.string(),
  isFeatured: z.boolean(),
  /** /artworks/search does not select this — optional so one schema serves both. */
  specialtyType: z.string().nullish(),
  displayPrice: OptionalMoney,
});
export type ArtworkSummary = z.infer<typeof ArtworkSummary>;

export const ListArtworksQueryParams = z.object({
  nationality: OptionalText,
  theme: OptionalText,
  specialtyType: OptionalText,
  artistId: OptionalInt,
  featured: OptionalBool,
  limit: OptionalInt,
  offset: OptionalInt,

  // Filter by lookup id (preferred) or by display name / size code.
  artCategoryId: OptionalInt,
  artCategory: OptionalText,
  artStyleId: OptionalInt,
  artStyle: OptionalText,
  sizeId: OptionalInt,
  size: OptionalText,

  /** @deprecated Alias of `artStyle`. */
  artType: OptionalText,
});
export type ListArtworksQueryParams = z.infer<typeof ListArtworksQueryParams>;

export const ListArtworksResponse = z.array(ArtworkSummary);
export type ListArtworksResponse = z.infer<typeof ListArtworksResponse>;

export const GetFeaturedArtworksResponse = z.array(ArtworkSummary);
export type GetFeaturedArtworksResponse = z.infer<
  typeof GetFeaturedArtworksResponse
>;

/** A selectable filter value: the id to filter by, plus its label. */
export const FilterOption = z.object({
  id: z.number().int(),
  name: z.string(),
  count: z.number().int(),
});
export type FilterOption = z.infer<typeof FilterOption>;

export const GetArtworkFiltersResponse = z.object({
  nationalities: z.array(z.string()),
  themes: z.array(z.string()),
  /** Drawn from art_categories — this is the filter that used to return nothing. */
  categories: z.array(FilterOption),
  styles: z.array(FilterOption),
  /** `id` is the sizes row id; `name` is the code (L, M, ...). */
  sizes: z.array(FilterOption),

  /** @deprecated Style names as plain strings. Use `styles`. */
  artTypes: z.array(z.string()),
});
export type GetArtworkFiltersResponse = z.infer<
  typeof GetArtworkFiltersResponse
>;

export const GetArtworkParams = z.object({ id: IdParam });
export type GetArtworkParams = z.infer<typeof GetArtworkParams>;

export const GetArtworkResponse = z.object({
  id: z.number().int(),
  title: z.string(),
  artistId: z.number().int(),
  artistName: z.string(),
  nationality: z.string(),

  artCategoryId: z.number().int(),
  artCategory: z.string(),
  artStyleId: z.number().int().nullish(),
  artStyle: z.string().nullish(),
  sizeId: z.number().int().nullish(),
  size: z.string().nullish(),
  sizeLabel: z.string().nullish(),
  techniqueId: z.number().int().nullish(),
  technique: z.string().nullish(),
  artSubcategoryId: z.number().int().nullish(),
  artSubcategory: z.string().nullish(),

  /** @deprecated Alias of `artStyle`. */
  artType: z.string().nullish(),

  theme: z.string(),
  year: z.number().int(),
  imageUrl: z.string(),
  thumbnailUrl: z.string(),
  shortDescription: z.string(),
  history: z.string(),
  styleExplanation: z.string(),
  culturalContext: z.string(),
  artistBio: z.string(),
  artistCountry: z.string(),
  artistBirthYear: z.number().int(),
  artistStyle: z.string(),
  artistPhotoUrl: z.string(),
  artistInfluences: z.string(),
  artistAwards: z.string(),
  artistExhibitions: z.string(),
  dimensions: z.string(),
  medium: z.string(),
  widthCm: z.number().int().nullish(),
  heightCm: z.number().int().nullish(),
  tagline: z.string().nullish(),
  frameIncluded: z.boolean(),
  frameDescription: z.string().nullish(),
  displayPrice: OptionalMoney,
  isFeatured: z.boolean(),
  specialtyType: z.string().nullish(),
  timeline: z.array(TimelineEvent).default([]),
  storageLocation: z.string().nullish(),
  supplierName: z.string().nullish(),
  tags: z.array(z.string()).default([]),
});
export type GetArtworkResponse = z.infer<typeof GetArtworkResponse>;

export const SearchArtworksBody = z.object({ query: z.string().min(1) });
export type SearchArtworksBody = z.infer<typeof SearchArtworksBody>;

/* ── artists ────────────────────────────────────────────────────────────── */

export const ArtistSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  country: z.string(),
  birthYear: z.number().int(),
  age: z.coerce.number().int(),
  gender: z.string(),
  style: z.string(),
  photoUrl: z.string(),
  shortBio: z.string(),
  saying: z.string(),
  sayingAuthor: z.string(),
  artworkCount: z.coerce.number().int(),
});
export type ArtistSummary = z.infer<typeof ArtistSummary>;

export const ListArtistsQueryParams = z.object({
  country: OptionalText,
  gender: OptionalText,
  style: OptionalText,
  search: OptionalText,
  minAge: OptionalInt,
  maxAge: OptionalInt,
});
export type ListArtistsQueryParams = z.infer<typeof ListArtistsQueryParams>;

export const ListArtistsResponse = z.array(ArtistSummary);
export type ListArtistsResponse = z.infer<typeof ListArtistsResponse>;

export const GetArtistParams = z.object({ id: IdParam });
export type GetArtistParams = z.infer<typeof GetArtistParams>;

/** Artist detail page nests a slimmer artwork shape than ArtworkSummary. */
export const ArtistArtwork = z.object({
  id: z.number().int(),
  title: z.string(),
  artistId: z.number().int(),
  artistName: z.string(),
  nationality: z.string(),
  artCategory: z.string(),
  artStyle: z.string().nullish(),
  /** @deprecated Alias of `artStyle`. */
  artType: z.string().nullish(),
  theme: z.string(),
  size: z.string().nullish(),
  year: z.number().int(),
  imageUrl: z.string(),
  thumbnailUrl: z.string(),
  shortDescription: z.string(),
  isFeatured: z.boolean(),
});
export type ArtistArtwork = z.infer<typeof ArtistArtwork>;

export const GetArtistResponse = ArtistSummary.extend({
  biography: z.string(),
  influences: z.string(),
  awards: z.string(),
  exhibitions: z.string(),
  artworks: z.array(ArtistArtwork).default([]),
});
export type GetArtistResponse = z.infer<typeof GetArtistResponse>;

export const GetArtistPortfolioResponse = z.object({
  description: z.string().default(""),
  imageUrls: z.array(z.string()).default([]),
  adminItems: z
    .array(z.object({ url: z.string(), label: z.string().optional() }))
    .default([]),
});
export type GetArtistPortfolioResponse = z.infer<
  typeof GetArtistPortfolioResponse
>;

/* ── cart ───────────────────────────────────────────────────────────────── */

export const CartItem = z.object({
  artworkId: z.number().int(),
  title: z.string(),
  artistName: z.string(),
  imageUrl: z.string(),
  /** Size bucket code (L, M, ...). */
  size: z.string().nullish(),
  sizeLabel: z.string().nullish(),
  /** Free-text measurement — drives the 3D frame viewer's aspect ratio. */
  dimensions: z.string().nullish(),
  widthCm: z.number().int().nullish(),
  heightCm: z.number().int().nullish(),
  notes: z.string(),
  addedAt: z.string(),
  displayPrice: OptionalMoney,
  storageLocationName: z.string().nullish(),
});
export type CartItem = z.infer<typeof CartItem>;

export const GetCartQueryParams = z.object({ sessionId: z.string().min(1) });
export type GetCartQueryParams = z.infer<typeof GetCartQueryParams>;

export const GetCartResponse = z.object({
  sessionId: z.string(),
  items: z.array(CartItem),
});
export type GetCartResponse = z.infer<typeof GetCartResponse>;

export const AddToCartBody = z.object({
  artworkId: z.number().int().positive(),
  sessionId: z.string().min(1),
  notes: z.string().optional(),
});
export type AddToCartBody = z.infer<typeof AddToCartBody>;

/**
 * DELETE uses path params only — mixing path + query params here makes Orval
 * emit `RemoveFromCartParams` in two modules and collide (TS2308).
 */
export const RemoveFromCartParams = z.object({
  sessionId: z.string().min(1),
  artworkId: IdParam,
});
export type RemoveFromCartParams = z.infer<typeof RemoveFromCartParams>;

/* ── object storage ─────────────────────────────────────────────────────── */

export const RequestUploadUrlBody = z.object({
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
});
export type RequestUploadUrlBody = z.infer<typeof RequestUploadUrlBody>;

export const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.number().int(),
    contentType: z.string(),
  }),
});
export type RequestUploadUrlResponse = z.infer<
  typeof RequestUploadUrlResponse
>;

/* ── shop ───────────────────────────────────────────────────────────────── */

export const ShopItem = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  imageUrl: z.string(),
  isAddon: z.boolean(),
  compatibleArtCategories: z.array(z.string()).default([]),
  stock: z.number().int(),
  status: z.string(),
  price: Money,
});
export type ShopItem = z.infer<typeof ShopItem>;

export const ListShopItemsQueryParams = z.object({ type: OptionalText });
export type ListShopItemsQueryParams = z.infer<
  typeof ListShopItemsQueryParams
>;

export const ListShopItemsResponse = z.array(ShopItem);
export type ListShopItemsResponse = z.infer<typeof ListShopItemsResponse>;

export const GetArtworkAddonsParams = z.object({ id: IdParam });
export type GetArtworkAddonsParams = z.infer<typeof GetArtworkAddonsParams>;

export const GetArtworkAddonsResponse = z.array(ShopItem);
export type GetArtworkAddonsResponse = z.infer<
  typeof GetArtworkAddonsResponse
>;

export const CreateShopItemBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  imageUrl: z.string().optional(),
  isAddon: z.boolean().optional(),
  compatibleArtCategories: z.array(z.string()).optional(),
  stock: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  price: z.coerce.number().nonnegative().optional(),
});
export type CreateShopItemBody = z.infer<typeof CreateShopItemBody>;

export const UpdateShopItemBody = CreateShopItemBody;
export type UpdateShopItemBody = z.infer<typeof UpdateShopItemBody>;

export const UpdateShopItemParams = z.object({ id: IdParam });
export type UpdateShopItemParams = z.infer<typeof UpdateShopItemParams>;

export const UpdateShopItemResponse = ShopItem;
export type UpdateShopItemResponse = z.infer<typeof UpdateShopItemResponse>;

export const DeleteShopItemParams = z.object({ id: IdParam });
export type DeleteShopItemParams = z.infer<typeof DeleteShopItemParams>;

export const DeleteShopItemResponse = z.object({ success: z.boolean() });
export type DeleteShopItemResponse = z.infer<typeof DeleteShopItemResponse>;

/* ── orders ─────────────────────────────────────────────────────────────── */

/**
 * What the client is allowed to send when placing an order.
 *
 * Note what is NOT here: prices. The old endpoint accepted `unitPrice` and
 * `totalAmount` from the request body and wrote them straight to the database,
 * so anyone could buy a PKR 420,000 painting for 1. The server now looks every
 * price up from `artworks.display_price` / `shop_items.price` and computes the
 * total itself. The client sends only what it wants and how many.
 */
export const CreateOrderItem = z
  .object({
    artworkId: z.number().int().positive().optional(),
    shopItemId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().max(99).default(1),
  })
  .refine((v) => (v.artworkId == null) !== (v.shopItemId == null), {
    message: "Each item must reference exactly one of artworkId or shopItemId",
  });
export type CreateOrderItem = z.infer<typeof CreateOrderItem>;

export const CreateOrderBody = z.object({
  sessionId: z.string().min(1),
  clerkUserId: z.string().nullish(),
  contactName: z.string().max(200).nullish(),
  contactPhone: z.string().max(50).nullish(),
  contactEmail: z.string().max(200).nullish(),
  items: z.array(CreateOrderItem).min(1).max(50),
});
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

export const OrderLineItemResponse = z.object({
  id: z.number().int(),
  orderId: z.number().int(),
  artworkId: z.number().int().nullish(),
  shopItemId: z.number().int().nullish(),
  title: z.string(),
  imageUrl: z.string(),
  unitPrice: Money,
  quantity: z.number().int(),
});
export type OrderLineItemResponse = z.infer<typeof OrderLineItemResponse>;

export const OrderResponse = z.object({
  id: z.number().int(),
  sessionId: z.string(),
  clerkUserId: z.string().nullish(),
  status: z.string(),
  totalAmount: Money,
  currency: CurrencyCode,
  contactName: z.string().nullish(),
  contactPhone: z.string().nullish(),
  contactEmail: z.string().nullish(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  items: z.array(OrderLineItemResponse).default([]),
});
export type OrderResponse = z.infer<typeof OrderResponse>;

export const ListOrdersQueryParams = z
  .object({
    sessionId: OptionalText,
    clerkUserId: OptionalText,
  })
  .refine((v) => v.sessionId != null || v.clerkUserId != null, {
    message: "sessionId or clerkUserId is required",
  });
export type ListOrdersQueryParams = z.infer<typeof ListOrdersQueryParams>;

export const UpdateOrderStatusBody = z.object({
  status: z.enum(["pending_purchase", "paid", "shipped", "delivered", "cancelled"]),
});
export type UpdateOrderStatusBody = z.infer<typeof UpdateOrderStatusBody>;

/* ── artwork submission (artist & gallery portals, admin) ────────────────── */

/**
 * Classification is submitted as lookup ids, never as free text — that is what
 * keeps `art_categories` and friends meaningful. `expectedPrice` is what the
 * artist wants to receive; the server derives `displayPrice` from it using the
 * artist's commission rate and never trusts a client-supplied display price.
 */
export const ArtworkClassificationInput = z.object({
  artCategoryId: z.coerce.number().int().positive(),
  artStyleId: z.coerce.number().int().positive().nullish(),
  sizeId: z.coerce.number().int().positive().nullish(),
  techniqueId: z.coerce.number().int().positive().nullish(),
  artSubcategoryId: z.coerce.number().int().positive().nullish(),
});
export type ArtworkClassificationInput = z.infer<typeof ArtworkClassificationInput>;

export const SubmitArtworkBody = ArtworkClassificationInput.extend({
  title: z.string().min(1).max(300),
  imageUrl: z.string().min(1),
  shortDescription: z.string().min(1),
  theme: z.string().max(200).optional().default(""),
  medium: z.string().max(300).optional().default(""),
  dimensions: z.string().max(120).optional().default(""),
  tagline: z.string().max(300).nullish(),
  year: z.coerce.number().int().min(1000).max(2200).optional(),
  widthCm: z.coerce.number().int().positive().nullish(),
  heightCm: z.coerce.number().int().positive().nullish(),
  frameIncluded: z.coerce.boolean().optional().default(false),
  frameDescription: z.string().max(500).nullish(),
  expectedPrice: z.coerce.number().nonnegative().nullish(),
  tags: z.array(z.string().max(60)).max(30).optional(),
});
export type SubmitArtworkBody = z.infer<typeof SubmitArtworkBody>;

export const UpdateArtworkBody = SubmitArtworkBody.partial();
export type UpdateArtworkBody = z.infer<typeof UpdateArtworkBody>;

/** Admin sets the public price directly, overriding the derived value. */
export const SetArtworkPriceBody = z.object({
  displayPrice: z.coerce.number().nonnegative().nullable(),
});
export type SetArtworkPriceBody = z.infer<typeof SetArtworkPriceBody>;
