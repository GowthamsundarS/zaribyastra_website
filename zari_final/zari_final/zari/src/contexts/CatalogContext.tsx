import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  api,
  type ImageSelection,
  type ProductForm,
} from "../lib/api";
import { cloudinarySrc } from "../utils/cloudinary";
import {
  clearCollections,
  DEFAULT_CATEGORIES,
  firstFreeExploreSlot,
  getCategories,
  getExploreCards,
  getExploreSlot as getExploreSlotFromPins,
  loadCollections,
  loadExplorePins,
  loadProducts,
  mergeCategories,
  pruneExplorePins,
  saveCollections,
  saveExplorePins,
  saveProducts,
  type CollectionSlot,
  type ExploreSlot,
  type ExploreSlotNumber,
  type Product,
} from "../data/catalog";

interface CatalogContextValue {
  products: Product[];
  /** Every known category — one tab per entry in the Collections page. */
  categories: string[];
  collections: CollectionSlot[];
  explorePins: Record<string, ExploreSlotNumber>;
  exploreCards: Product[];
  /** True while the first backend fetch is in flight. */
  loading: boolean;
  /** False when the backend was unreachable (cached data or skeleton shown). */
  online: boolean;
  refreshCategories: () => Promise<void>;
  /** Re-run the initial backend fetch (used by empty-state retry buttons). */
  retry: () => Promise<void>;
  getProduct: (id: string) => Product | undefined;
  getExploreSlot: (productId: string) => ExploreSlot;
  setExploreSlot: (productId: string, slot: ExploreSlot) => void;
  firstFreeSlot: (ignoreProductId?: string) => ExploreSlotNumber | null;
  addProduct: (
    input: ProductForm,
    images: ImageSelection[]
  ) => Promise<Product>;
  updateProduct: (
    id: string,
    patch: Partial<ProductForm>,
    opts?: { images?: ImageSelection[] }
  ) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateCollection: (index: number, patch: Partial<CollectionSlot>) => Promise<void>;
  resetCollections: () => void;
  resetCatalog: () => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

const FULL_FORM = (p: Product): ProductForm => ({
  name: p.name,
  description: p.description,
  price: p.price,
  discountPrice: p.discountPrice,
  category: p.category,
  quantity: p.quantity ?? 0,
  colour: p.colour ?? "",
  isNew: p.isNew,
  isBestSeller: p.isBestSeller,
});

// ---------------------------------------------------------------------------
// HOME CACHE WARM (prefetch during the loading state)
// ---------------------------------------------------------------------------
// The home stack renders up to four explore cards. While `loading` is
// still true (after the catalog JSON arrives), their cover images are
// fetched and decoded here so the moment the skeleton is replaced the
// finished layout paints from cache — no mid-scroll image pop-in on
// slow networks. Kept deliberately small:
//   * only the Cloudinary covers Home actually shows (<= 4 files),
//   * one right-sized rung per viewport (matches the srcSet pick the
//     <img> will make, so it is a cache hit, not a second download),
//   * hard 1.2s budget — the loading state never stretches beyond it,
//     stragglers keep filling the HTTP cache in the background,
//   * skipped entirely when the user has Data Saver on.

const HOME_WARM_BUDGET_MS = 1200;

function homeWarmWidth(): number {
  const vw = window.innerWidth;
  if (vw <= 640) return 480;
  if (vw <= 1240) return 640;
  return 800;
}

function isDataSaver(): boolean {
  const conn = (
    navigator as unknown as { connection?: { saveData?: boolean } }
  ).connection;
  return Boolean(conn?.saveData);
}

async function warmHomeCache(products: Product[]): Promise<void> {
  if (typeof window === "undefined" || isDataSaver()) return;
  const cards = getExploreCards(products, loadExplorePins());
  const width = homeWarmWidth();
  const urls = cards
    .map((p) => cloudinarySrc(p.image?.trim() || "", width))
    .filter((u) => Boolean(u) && u.includes("res.cloudinary.com"));
  if (!urls.length) return;
  const loads = urls.map((url) => {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    return img.decode().catch(() => undefined);
  });
  await Promise.race([
    Promise.allSettled(loads),
    new Promise((resolve) => setTimeout(resolve, HOME_WARM_BUDGET_MS)),
  ]);
}

// Catalog backed by the FastAPI backend. Collections stay in localStorage
// (they are storefront dressing, not products). The initial state is the
// last good backend response if one is cached, else EMPTY — the UI shows a
// loading skeleton until the backend responds. Hardcoded design-phase
// products are never rendered, so a first-time visitor can never see
// outdated images that later "correct" themselves.
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  // Real cached data paints instantly when present (proper
  // stale-while-revalidate); otherwise the first paint is a skeleton.
  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [collections, setCollections] = useState<CollectionSlot[]>(() =>
    loadCollections()
  );
  const [explorePins, setExplorePins] = useState<
    Record<string, ExploreSlotNumber>
  >(() => loadExplorePins());
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  const exploreCards = useMemo(
    () => getExploreCards(products, explorePins),
    [products, explorePins]
  );

  // Drop pins for deleted products so a removed piece can never
  // leave a ghost card (or block its slot) on the home stack.
  useEffect(() => {
    if (!products.length) return;
    setExplorePins((prev) => {
      const pruned = pruneExplorePins(prev, products);
      if (Object.keys(pruned).length === Object.keys(prev).length) {
        return prev;
      }
      saveExplorePins(pruned);
      return pruned;
    });
  }, [products]);

  const getExploreSlot = useCallback(
    (productId: string): ExploreSlot =>
      getExploreSlotFromPins(explorePins, productId),
    [explorePins]
  );

  const setExploreSlot = useCallback(
    (productId: string, slot: ExploreSlot) => {
      setExplorePins((prev) => {
        const next = { ...prev };
        if (slot == null) {
          delete next[productId];
        } else {
          // One product per slot — evict whoever held it.
          for (const [pid, s] of Object.entries(next)) {
            if (s === slot && pid !== productId) delete next[pid];
          }
          next[productId] = slot;
        }
        saveExplorePins(next);
        return next;
      });
    },
    []
  );

  const firstFreeSlot = useCallback(
    (ignoreProductId?: string) =>
      firstFreeExploreSlot(explorePins, ignoreProductId),
    [explorePins]
  );

  const [registryCategories, setRegistryCategories] = useState<string[]>([
    ...DEFAULT_CATEGORIES,
  ]);

  // Union of backend registry + categories actually used by products.
  // A brand-new category typed in Admin appears here as soon as its
  // product lands, which is what spawns the new Collections tab.
  const categories = useMemo(
    () => mergeCategories(registryCategories, getCategories(products)),
    [registryCategories, products]
  );

  const refreshCategories = useCallback(async () => {
    try {
      const list = await api.listCategories();
      if (list.length) setRegistryCategories(list);
    } catch {
      /* backend without /categories — product-derived list still works */
    }
  }, []);

  const refresh = useCallback(async () => {
    // Parallel: one round trip instead of two sequential ones on slow mobile.
    const [list] = await Promise.all([
      api.listProducts(),
      refreshCategories(),
    ]);
    setProducts(list);
    saveProducts(list);
    return list;
  }, [refreshCategories]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list] = await Promise.all([
          api.listProducts(),
          api.listCategories().then((cats) => {
            if (!cancelled && cats.length) setRegistryCategories(cats);
          }),
        ]);
        if (!cancelled) {
          setProducts(list);
          saveProducts(list);
          setOnline(true);
          await warmHomeCache(list);
        }
      } catch {
        if (!cancelled) {
          // Backend unreachable (cold start, offline, timeout) — keep the
          // last good cache (possibly empty) so the UI shows either real
          // data or a skeleton with a retry affordance. Never substitute
          // hardcoded/placeholder products here.
          setOnline(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const list = await refresh();
      setOnline(true);
      await warmHomeCache(list);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const getProduct = useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products]
  );

  const addProduct = useCallback(
    async (input: ProductForm, images: ImageSelection[]) => {
      const created = await api.createProduct(input, images);
      setProducts((prev) => {
        const next = [created, ...prev.filter((p) => p.id !== created.id)];
        saveProducts(next);
        return next;
      });
      // Optimistic: the new category's tab appears instantly.
      if (created.category?.trim()) {
        setRegistryCategories((prev) =>
          mergeCategories(prev, [created.category])
        );
      }
      return created;
    },
    []
  );

  const updateProduct = useCallback(
    async (
      id: string,
      patch: Partial<ProductForm>,
      opts?: { images?: ImageSelection[] }
    ) => {
      const current = products.find((p) => p.id === id);
      if (!current) throw new Error("Product not found.");
      // PUT needs the full field set, so merge the patch over current state.
      const merged = { ...FULL_FORM(current), ...patch };
      const saved = await api.updateProduct(id, merged, opts?.images);
      setProducts((prev) => {
        const next = prev.map((p) => (p.id === id ? saved : p));
        saveProducts(next);
        return next;
      });
    },
    [products]
  );

  const deleteProduct = useCallback(async (id: string) => {
    await api.deleteProduct(id);
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveProducts(next);
      return next;
    });
    // A deleted piece vacates its home card slot.
    setExplorePins((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      saveExplorePins(next);
      return next;
    });
  }, []);

  const updateCollection = useCallback(
    async (index: number, patch: Partial<CollectionSlot>) => {
      setCollections((prev) => {
        const next = prev.map((slot, i) =>
          i === index ? { ...slot, ...patch } : slot
        );
        saveCollections(next);
        return next;
      });
    },
    []
  );

  const resetCollections = useCallback(() => {
    clearCollections();
    setCollections(loadCollections());
  }, []);

  const resetCatalog = useCallback(() => {
    try {
      // Current key plus any pre-fix key that may hold seed rows.
      localStorage.removeItem("zari.catalog.v3");
      localStorage.removeItem("zari.catalog.v2");
    } catch {
      /* ignore */
    }
    clearCollections();
    setCollections(loadCollections());
    void refresh().catch(() => {
      /* keep current in-memory state — never restore seed rows */
    });
  }, [refresh]);

  const value = useMemo(
    () => ({
      products,
      categories,
      collections,
      explorePins,
      exploreCards,
      loading,
      online,
      refreshCategories,
      retry,
      getProduct,
      getExploreSlot,
      setExploreSlot,
      firstFreeSlot,
      addProduct,
      updateProduct,
      deleteProduct,
      updateCollection,
      resetCollections,
      resetCatalog,
    }),
    [
      products,
      categories,
      collections,
      explorePins,
      exploreCards,
      loading,
      online,
      refreshCategories,
      retry,
      getProduct,
      getExploreSlot,
      setExploreSlot,
      firstFreeSlot,
      addProduct,
      updateProduct,
      deleteProduct,
      updateCollection,
      resetCollections,
      resetCatalog,
    ]
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
