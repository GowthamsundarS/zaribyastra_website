import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useCatalog } from "./CatalogContext";

export interface BagItem {
  productId: string;
  size: string;
  quantity: number;
}

interface BagContextValue {
  items: BagItem[];
  count: number;
  addToBag: (productId: string, size: string, quantity?: number) => void;
  setQuantity: (productId: string, size: string, quantity: number) => void;
  removeFromBag: (productId: string, size: string) => void;
  clearBag: () => void;
}

const BagContext = createContext<BagContextValue | null>(null);
const KEY = "zari.bag.v1";

function load(): BagItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as BagItem[];
  } catch {
    /* ignore */
  }
  return [];
}

export function BagProvider({ children }: { children: React.ReactNode }) {
  const { products, loading } = useCatalog();
  const [items, setItems] = useState<BagItem[]>(load);

  // The header badge counts bag rows, so a piece deleted from the catalog has
  // to leave the bag too — otherwise the storefront advertises an item nobody
  // can buy. Skipped until the catalog has resolved: on first paint the
  // product list is still loading (possibly empty), and pruning against an
  // unresolved list would silently empty a returning shopper's bag.
  useEffect(() => {
    if (loading || !products.length) return;
    setItems((prev) => {
      const alive = prev.filter((i) =>
        products.some((p) => p.id === i.productId)
      );
      return alive.length === prev.length ? prev : alive;
    });
  }, [products, loading]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const addToBag = useCallback(
    (productId: string, size: string, quantity = 1) => {
      setItems((prev) => {
        const idx = prev.findIndex(
          (i) => i.productId === productId && i.size === size
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
          return next;
        }
        return [...prev, { productId, size, quantity }];
      });
    },
    []
  );

  const setQuantity = useCallback((productId: string, size: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => !(i.productId === productId && i.size === size))
        : prev.map((i) =>
            i.productId === productId && i.size === size ? { ...i, quantity } : i
          )
    );
  }, []);

  const removeFromBag = useCallback((productId: string, size: string) => {
    setItems((prev) => prev.filter((i) => !(i.productId === productId && i.size === size)));
  }, []);

  const clearBag = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((n, i) => n + i.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, count, addToBag, setQuantity, removeFromBag, clearBag }),
    [items, count, addToBag, setQuantity, removeFromBag, clearBag]
  );
  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

export function useBag(): BagContextValue {
  const ctx = useContext(BagContext);
  if (!ctx) throw new Error("useBag must be used within BagProvider");
  return ctx;
}
