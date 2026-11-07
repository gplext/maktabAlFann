import { useQuery } from "@tanstack/react-query";

export type Contact = { whatsapp: string; email: string; city: string };

/** Gallery contact details (WhatsApp number and email come from the server's settings). */
export function useContact() {
  return useQuery<Contact>({
    queryKey: ["/gallery/contact"],
    queryFn: async () => {
      const res = await fetch("/api/gallery/contact");
      if (!res.ok) return { whatsapp: "", email: "", city: "Lahore, Pakistan" };
      return res.json();
    },
    staleTime: 60 * 60_000,
  });
}

export const whatsappLink = (number: string, text?: string) =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** +923001234567 → +92 300 1234567 */
export const prettyPhone = (n: string) =>
  n.startsWith("92") && n.length === 12 ? `+92 ${n.slice(2, 5)} ${n.slice(5)}` : `+${n}`;
