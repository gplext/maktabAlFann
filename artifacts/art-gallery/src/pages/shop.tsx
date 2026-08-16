import { useListShopItems } from "@workspace/api-client-react";
import type { ShopItem } from "@workspace/api-client-react";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2, Package } from "lucide-react";

const TYPES = ["All", "Stationary", "Frames", "Hanging Support"] as const;
type FilterType = (typeof TYPES)[number];

export default function Shop() {
  const [activeType, setActiveType] = useState<FilterType>("All");

  const { data: allItems, isLoading } = useListShopItems(
    activeType === "All" ? {} : { type: activeType }
  );

  const grouped = useMemo<[string, ShopItem[]][]>(() => {
    if (!allItems || activeType !== "All") return [];
    const map = new Map<string, ShopItem[]>();
    for (const item of allItems) {
      if (!map.has(item.type)) map.set(item.type, []);
      map.get(item.type)!.push(item);
    }
    return [...map.entries()];
  }, [allItems, activeType]);

  return (
    <div className="bg-background min-h-screen text-foreground pt-28 pb-24">
      <div className="container mx-auto max-w-7xl px-6 md:px-12">

        <header className="mb-12 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-[0.3em] text-secondary mb-3"
          >
            The Gallery Store
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-6xl font-display text-primary mb-6"
          >
            Shop
          </motion.h1>
          <div className="w-24 h-[1px] bg-secondary mx-auto mb-8" />
          <p className="text-base text-foreground/60 max-w-2xl mx-auto italic">
            Fine accessories and enhancements for your collection — frames, stationery, and more.
          </p>
        </header>

        <div className="flex items-center justify-center gap-2 mb-12 flex-wrap">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`px-5 py-2 text-[10px] uppercase tracking-[0.2em] font-display border transition-all duration-200 ${
                activeType === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-foreground/55 hover:text-primary hover:border-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-32">
            <Loader2 className="animate-spin text-primary w-12 h-12" />
          </div>
        ) : !allItems || allItems.length === 0 ? (
          <div className="text-center py-32 border border-border bg-card">
            <Package size={40} className="mx-auto mb-4 text-foreground/20" />
            <p className="text-xl text-foreground/50 font-display">
              {activeType === "All" ? "No items in the shop yet." : `No ${activeType} items available.`}
            </p>
          </div>
        ) : activeType === "All" ? (
          <div className="space-y-20">
            {grouped.map(([type, items], idx) => (
              <motion.section
                key={type}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: idx * 0.05 }}
              >
                <div className="flex items-baseline gap-6 mb-8 border-b border-border pb-4">
                  <h2 className="font-display text-2xl md:text-3xl text-primary">{type}</h2>
                  <span className="text-xs uppercase tracking-widest text-secondary">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                  <div className="flex-1 h-[1px] bg-border hidden sm:block" />
                </div>
                <ItemGrid items={items} />
              </motion.section>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <ItemGrid items={allItems} />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ItemGrid({ items }: { items: ShopItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.5 }}
        >
          <ShopCard item={item} />
        </motion.div>
      ))}
    </div>
  );
}

function ShopCard({ item }: { item: ShopItem }) {
  return (
    <div className="group bg-card border border-border flex flex-col hover:border-primary/40 transition-colors duration-300">
      <div className="aspect-square overflow-hidden bg-background relative">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={40} className="text-foreground/15" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] bg-background/90 backdrop-blur-sm border border-border/60 text-secondary">
            {item.type}
          </span>
        </div>
        {item.isAddon && (
          <div className="absolute top-3 right-3">
            <span className="px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] bg-secondary/90 text-secondary-foreground">
              Add-on
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-display text-sm text-primary mb-1 group-hover:text-secondary transition-colors leading-tight">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-xs text-foreground/55 italic line-clamp-2 mb-4 flex-1 leading-relaxed">
            {item.description}
          </p>
        )}
        <button className="mt-auto w-full py-2.5 border border-primary text-primary text-[9px] uppercase tracking-[0.25em] font-display hover:bg-primary hover:text-primary-foreground transition-all duration-200">
          Enquire
        </button>
      </div>
    </div>
  );
}
