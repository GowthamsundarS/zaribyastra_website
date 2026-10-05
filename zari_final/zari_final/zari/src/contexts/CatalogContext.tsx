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
  /** False when the backend was unreachable (local seed is shown). */
  online: boolean;
  refreshCategories: () => Promise<void>;
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

// Catalog backed by the FastAPI backend. Collections stay in localStorage
// (they are storefront dressing, not products). If the backend is
// unreachable at load, the local seed is shown instead and `online` is false.
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  // Perf: render the local seed instantly so home cards paint on first
  // pass (no skeleton stall); backend revalidates in the background.
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
    const list = await api.listProducts();
    setProducts(list);
    saveProducts(list);
    await refreshCategories();
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
        }
      } catch {
        if (!cancelled) {
          // Backend down — fall back to the local copy so the shop still renders.
          setProducts(loadProducts());
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
      localStorage.removeItem("zari.catalog.v2");
    } catch {
      /* ignore */
    }
    clearCollections();
    setCollections(loadCollections());
    void refresh().catch(() => setProducts(loadProducts()));
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
