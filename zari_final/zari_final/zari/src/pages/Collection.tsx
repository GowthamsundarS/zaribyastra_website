import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useCatalog } from "../contexts/CatalogContext";
import { effectivePrice } from "../data/catalog";
import { ProductCard } from "../components/ProductCard";
import { BackButton } from "../components/BackButton";
import { Seo } from "../components/Seo";
import { haptic } from "../utils/haptics";

const SPECIAL_FILTERS = ["New Arrivals", "Best Sellers"] as const;

const SORTS = {
  newest: "Newest",
  low: "Price: Low to High",
  high: "Price: High to Low",
} as const;
type Sort = keyof typeof SORTS;

export function Collection() {
  // One tab per category (dynamic) + All + specials. A category typed in
  // Admin spawns its own tab here as soon as its product exists.
  const { products, categories, loading } = useCatalog();
  const [filter, setFilter] = useState<string>("All");
  const [sort, setSort] = useState<Sort>("newest");

  const filters = useMemo(
    () => ["All", ...categories, ...SPECIAL_FILTERS],
    [categories]
  );

  // If the active tab vanished (e.g. its last product was deleted),
  // fall back to All instead of showing an empty orphan tab.
  useEffect(() => {
    if (filter !== "All" && !(SPECIAL_FILTERS as readonly string[]).includes(filter) && !categories.includes(filter)) {
      setFilter("All");
    }
  }, [categories, filter]);

  const visible = useMemo(() => {
    let list = products.filter((p) => {
      if (filter === "New Arrivals") return p.isNew;
      if (filter === "Best Sellers") return p.isBestSeller;
      if (filter === "All") return true;
      // Dynamic category tab — exact match on the product's category.
      return p.category === filter;
    });
    list = [...list].sort((a, b) =>
      sort === "low"
        ? effectivePrice(a) - effectivePrice(b)
        : sort === "high"
        ? effectivePrice(b) - effectivePrice(a)
        : b.createdAt - a.createdAt
    );
    return list;
  }, [products, filter, sort]);

  return (
    <main id="main-content" className="bg-ivory px-6 pb-28 pt-32 sm:px-10 lg:px-16">
      <Seo
        title="Explore the Collection — Luxury Abayas | ZARI by Astra"
        description="Browse every ZARI abaya — new arrivals, best sellers and hand-finished modest luxury in warm earth tones."
        path="/collection"
      />
      <div className="mx-auto max-w-6xl">
        <BackButton />
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.14, 1, 0.34, 1] }}
          className="font-sans text-[10px] uppercase tracking-[0.5em] text-maroon"
        >
          The Edit
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.08, ease: [0.14, 1, 0.34, 1] }}
          className="mt-5 font-display text-5xl leading-[1.05] text-maroon-ink sm:text-6xl"
        >
          Explore the Collection
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.25 }}
          className="mt-6 max-w-xl font-sans text-sm leading-7 text-maroon-ink/65"
        >
          Every abaya is cut for movement, dyed in warm earth tones and finished by hand.
          Browse the full house edit below.
        </motion.p>

        <div className="mt-14 flex flex-col gap-6 border-b border-maroon/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-7 gap-y-3">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  haptic(10);
                  setFilter(f);
                }}
                className={
                  "border-b pb-1 font-sans text-[10px] uppercase tracking-[0.3em] transition-colors " +
                  (filter === f
                    ? "border-maroon text-maroon"
                    : "border-transparent text-maroon-ink/50 hover:text-maroon-ink")
                }
              >
                {f}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-maroon-ink/50">
              Sort
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="border border-maroon/20 bg-transparent px-3 py-2 font-sans text-xs text-maroon-ink focus:border-maroon focus:outline-none"
            >
              {Object.entries(SORTS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="py-24 text-center font-display text-2xl italic text-maroon-ink/40">
            {loading
              ? "Unveiling the edit…"
              : "Nothing in this edit yet — something beautiful is coming."}
          </p>
        ) : (
          <div className="mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
