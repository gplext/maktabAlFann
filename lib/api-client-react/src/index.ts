/**
 * @workspace/api-client-react
 *
 * React Query hooks over the Maktaba Al-Fann API, shaped to match the Orval
 * output the frontend was written against: every query hook takes an optional
 * `{ query: UseQueryOptions }` bag, and every endpoint exposes a
 * `getXxxQueryKey(...)` helper so callers can invalidate or seed the cache.
 */
import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  AddToCartBody,
  FilterOption,
  ArtistSummary,
  ArtworkSummary,
  GetArtistPortfolioResponse,
  GetArtistResponse,
  GetArtworkFiltersResponse,
  GetArtworkResponse,
  GetCartResponse,
  GetGalleryAboutResponse,
  GetGalleryStatsResponse,
  RemoveFromCartParams,
  SearchArtworksBody,
  ShopItem as ShopItemType,
  TimelineEvent as TimelineEventType,
} from "@workspace/api-zod";
import {
  apiDelete,
  apiGet,
  apiPost,
  toSearchParams,
  type QueryParams,
} from "./fetcher";

export { ApiError, API_BASE } from "./fetcher";

/* -- public type aliases (what the frontend imports) ---------------------- */

export type Artwork = ArtworkSummary;
export type ArtworkDetail = GetArtworkResponse;
export type Artist = ArtistSummary;
export type ArtistDetail = GetArtistResponse;
export type ShopItem = ShopItemType;
export type TimelineEvent = TimelineEventType;
export type Cart = GetCartResponse;
export type GalleryAbout = GetGalleryAboutResponse;
export type GalleryStats = GetGalleryStatsResponse;
export type ArtistPortfolio = GetArtistPortfolioResponse;

export type {
  AddToCartBody,
  GetArtworkFiltersResponse,
  RemoveFromCartParams,
  SearchArtworksBody,
};

export type {
  CreateOrderBody,
  CreateOrderItem,
  FilterOption,
  OrderLineItemResponse,
  OrderResponse,
  SetArtworkPriceBody,
  SubmitArtworkBody,
  UpdateArtworkBody,
} from "@workspace/api-zod";

/* -- option bags ---------------------------------------------------------- */

type QueryHookOptions<TData> = {
  query?: Partial<UseQueryOptions<TData, Error, TData, readonly unknown[]>>;
};

type MutationHookOptions<TData, TVariables> = {
  mutation?: UseMutationOptions<TData, Error, TVariables>;
};

function runQuery<TData>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<TData>,
  options?: QueryHookOptions<TData>,
): UseQueryResult<TData, Error> {
  return useQuery<TData, Error, TData, readonly unknown[]>({
    queryKey,
    queryFn,
    ...options?.query,
  });
}

/* -- artworks ------------------------------------------------------------- */

export type ListArtworksParams = {
  nationality?: string;
  theme?: string;
  specialtyType?: string;
  artistId?: number;
  featured?: boolean;
  limit?: number;
  offset?: number;

  // Classification filters. Prefer the ids — they are what the lookup tables
  // key on. The name variants exist for links and bookmarks.
  artCategoryId?: number;
  artCategory?: string;
  artStyleId?: number;
  artStyle?: string;
  sizeId?: number;
  size?: string;

  /** @deprecated Alias of `artStyle`. */
  artType?: string;
};

export const getListArtworksQueryKey = (params?: ListArtworksParams) =>
  ["/artworks", params ?? {}] as const;

export function useListArtworks(
  params?: ListArtworksParams,
  options?: QueryHookOptions<Artwork[]>,
): UseQueryResult<Artwork[], Error> {
  return runQuery(
    getListArtworksQueryKey(params),
    () => apiGet<Artwork[]>(`/artworks${toSearchParams(params as QueryParams)}`),
    options,
  );
}

export const getGetFeaturedArtworksQueryKey = () =>
  ["/artworks/featured"] as const;

export function useGetFeaturedArtworks(
  options?: QueryHookOptions<Artwork[]>,
): UseQueryResult<Artwork[], Error> {
  return runQuery(
    getGetFeaturedArtworksQueryKey(),
    () => apiGet<Artwork[]>("/artworks/featured"),
    options,
  );
}

export const getGetArtworkFiltersQueryKey = () =>
  ["/artworks/filters"] as const;

export function useGetArtworkFilters(
  options?: QueryHookOptions<GetArtworkFiltersResponse>,
): UseQueryResult<GetArtworkFiltersResponse, Error> {
  return runQuery(
    getGetArtworkFiltersQueryKey(),
    () => apiGet<GetArtworkFiltersResponse>("/artworks/filters"),
    options,
  );
}

export const getGetArtworkQueryKey = (id: number) =>
  ["/artworks", id] as const;

export function useGetArtwork(
  id: number,
  options?: QueryHookOptions<ArtworkDetail>,
): UseQueryResult<ArtworkDetail, Error> {
  return runQuery(
    getGetArtworkQueryKey(id),
    () => apiGet<ArtworkDetail>(`/artworks/${id}`),
    options,
  );
}

export function useSearchArtworks(
  options?: MutationHookOptions<Artwork[], { data: SearchArtworksBody }>,
): UseMutationResult<Artwork[], Error, { data: SearchArtworksBody }> {
  return useMutation<Artwork[], Error, { data: SearchArtworksBody }>({
    mutationFn: ({ data }) => apiPost<Artwork[]>("/artworks/search", data),
    ...options?.mutation,
  });
}

/* -- artists -------------------------------------------------------------- */

export type ListArtistsParams = {
  country?: string;
  gender?: string;
  style?: string;
  search?: string;
  minAge?: number;
  maxAge?: number;
};

export const getListArtistsQueryKey = (params?: ListArtistsParams) =>
  ["/artists", params ?? {}] as const;

export function useListArtists(
  params?: ListArtistsParams,
  options?: QueryHookOptions<Artist[]>,
): UseQueryResult<Artist[], Error> {
  return runQuery(
    getListArtistsQueryKey(params),
    () => apiGet<Artist[]>(`/artists${toSearchParams(params as QueryParams)}`),
    options,
  );
}

export const getGetArtistQueryKey = (id: number) => ["/artists", id] as const;

export function useGetArtist(
  id: number,
  options?: QueryHookOptions<ArtistDetail>,
): UseQueryResult<ArtistDetail, Error> {
  return runQuery(
    getGetArtistQueryKey(id),
    () => apiGet<ArtistDetail>(`/artists/${id}`),
    options,
  );
}

export const getGetArtistPortfolioQueryKey = (id: number) =>
  ["/artists", id, "portfolio"] as const;

export function useGetArtistPortfolio(
  id: number,
  options?: QueryHookOptions<ArtistPortfolio>,
): UseQueryResult<ArtistPortfolio, Error> {
  return runQuery(
    getGetArtistPortfolioQueryKey(id),
    () => apiGet<ArtistPortfolio>(`/artists/${id}/portfolio`),
    options,
  );
}

/* -- gallery -------------------------------------------------------------- */

export const getGetGalleryAboutQueryKey = () => ["/gallery/about"] as const;

export function useGetGalleryAbout(
  options?: QueryHookOptions<GalleryAbout>,
): UseQueryResult<GalleryAbout, Error> {
  return runQuery(
    getGetGalleryAboutQueryKey(),
    () => apiGet<GalleryAbout>("/gallery/about"),
    options,
  );
}

export const getGetGalleryStatsQueryKey = () => ["/gallery/stats"] as const;

export function useGetGalleryStats(
  options?: QueryHookOptions<GalleryStats>,
): UseQueryResult<GalleryStats, Error> {
  return runQuery(
    getGetGalleryStatsQueryKey(),
    () => apiGet<GalleryStats>("/gallery/stats"),
    options,
  );
}

/* -- cart ----------------------------------------------------------------- */

export const getGetCartQueryKey = (params: { sessionId: string }) =>
  ["/cart", params.sessionId] as const;

export function useGetCart(
  params: { sessionId: string },
  options?: QueryHookOptions<Cart>,
): UseQueryResult<Cart, Error> {
  return runQuery(
    getGetCartQueryKey(params),
    () => apiGet<Cart>(`/cart${toSearchParams(params)}`),
    options,
  );
}

export function useAddToCart(
  options?: MutationHookOptions<Cart, { data: AddToCartBody }>,
): UseMutationResult<Cart, Error, { data: AddToCartBody }> {
  return useMutation<Cart, Error, { data: AddToCartBody }>({
    mutationFn: ({ data }) => apiPost<Cart>("/cart/items", data),
    ...options?.mutation,
  });
}

export function useRemoveFromCart(
  options?: MutationHookOptions<Cart, RemoveFromCartParams>,
): UseMutationResult<Cart, Error, RemoveFromCartParams> {
  return useMutation<Cart, Error, RemoveFromCartParams>({
    mutationFn: ({ sessionId, artworkId }) =>
      apiDelete<Cart>(
        `/cart/${encodeURIComponent(sessionId)}/items/${artworkId}`,
      ),
    ...options?.mutation,
  });
}

/* -- shop ----------------------------------------------------------------- */

export type ListShopItemsParams = { type?: string };

export const getListShopItemsQueryKey = (params?: ListShopItemsParams) =>
  ["/shop/items", params ?? {}] as const;

export function useListShopItems(
  params?: ListShopItemsParams,
  options?: QueryHookOptions<ShopItem[]>,
): UseQueryResult<ShopItem[], Error> {
  return runQuery(
    getListShopItemsQueryKey(params),
    () =>
      apiGet<ShopItem[]>(`/shop/items${toSearchParams(params as QueryParams)}`),
    options,
  );
}

export const getGetArtworkAddonsQueryKey = (id: number) =>
  ["/artworks", id, "addons"] as const;

export function useGetArtworkAddons(
  id: number,
  options?: QueryHookOptions<ShopItem[]>,
): UseQueryResult<ShopItem[], Error> {
  return runQuery(
    getGetArtworkAddonsQueryKey(id),
    () => apiGet<ShopItem[]>(`/artworks/${id}/addons`),
    options,
  );
}
