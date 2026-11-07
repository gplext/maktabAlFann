import { useQuery } from "@tanstack/react-query";

/** What Admin → Carousels saved for a carousel. `configured: false` = use the page's built-in choice. */
export type CarouselItem = {
  id: number; title: string; subtitle: string; imageUrl: string;
  /** The 16:9 version shown in the carousel. */
  slideUrl?: string;
  theme?: string | null; artStyle?: string | null;
};
export type CarouselData = { key: string; configured: boolean; items: CarouselItem[] };

export function useCarousel(key: string) {
  return useQuery<CarouselData>({
    queryKey: ["/carousels", key],
    queryFn: async () => {
      const res = await fetch(`/api/carousels/${key}`);
      if (!res.ok) return { key, configured: false, items: [] };
      return res.json();
    },
    staleTime: 0,
    retry: false,
  });
}
