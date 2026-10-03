/** Free-form category name. New names typed in Admin auto-create
 *  a new tab in the Collections page. */
export type Category = string;

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // in INR
  /** Sale price in INR. Absent, zero or not below `price` means no discount. */
  discountPrice?: number;
  category: Category;
  /** Cover photo (first gallery image). Kept for backwards compat. */
  image: string;
  /** Full gallery in display order (cover first). Max 5 (backend limit). */
  images: string[];
  /** Stock on hand (backend `quantity`). Absent = unknown/unlimited. */
  quantity?: number;
  /** Colour string (backend `color`). */
  colour?: string;
  isNew: boolean;
  isBestSeller: boolean;
  createdAt: number;
}

/** Seed / fallback categories shown before the backend responds. */
export const DEFAULT_CATEGORIES: Category[] = ["Abayas", "Premium Collection"];

/** Backwards-compatible alias (was a fixed union, now dynamic). */
export const CATEGORIES: Category[] = DEFAULT_CATEGORIES;

/** Collapse whitespace; empty stays empty (caller decides the fallback). */
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Unique category names across products. Defaults come first (in declared
 * order) so the shop never looks empty; the rest are alphabetical.
 */
export function getCategories(products: Product[]): string[] {
  const seen = new Map<string, string>(); // lower -> display
  for (const p of products) {
    const cleaned = normalizeCategoryName(p.category || "");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) seen.set(key, cleaned);
  }
  for (const d of DEFAULT_CATEGORIES) {
    const key = d.toLowerCase();
    if (!seen.has(key)) seen.set(key, d);
  }
  const defaults = DEFAULT_CATEGORIES.filter((d) =>
    seen.has(d.toLowerCase())
  );
  const rest = [...seen.values()]
    .filter((c) => !defaults.includes(c))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  // If products introduced different casing for a default (e.g. "abayas"),
  // prefer the product's own casing for that entry.
  const merged = [...defaults, ...rest];
  return merged.map((c) => seen.get(c.toLowerCase()) ?? c);
}

/** Merge registry list + product-derived list, deduped case-insensitively. */
export function mergeCategories(
  ...lists: Array<string[] | undefined | null>
): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list ?? []) {
      const cleaned = normalizeCategoryName(raw || "");
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (!seen.has(key)) seen.set(key, cleaned);
    }
  }
  for (const d of DEFAULT_CATEGORIES) {
    const key = d.toLowerCase();
    if (!seen.has(key)) seen.set(key, d);
  }
  const defaults = DEFAULT_CATEGORIES.filter((d) =>
    seen.has(d.toLowerCase())
  ).map((d) => seen.get(d.toLowerCase()) ?? d);
  const rest = [...seen.values()]
    .filter(
      (c) => !defaults.some((x) => x.toLowerCase() === c.toLowerCase())
    )
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return [...defaults, ...rest];
}

/**
 * One of the four stacked collection cards on the home page. Photo and copy
 * are set independently of the catalogue; `productId` is the piece the card
 * opens and is what keeps the collection present in the Explore edit.
 */
export interface CollectionSlot {
  name: string;
  image: string;
  alt: string;
  desc: string;
  productId: string;
}

export const COLLECTION_SLOT_COUNT = 4;

// Every piece is cut to the buyer's measurements, so no size is picked in
// the UI; the bag and the WhatsApp order still carry a size string.
export const MADE_TO_MEASURE = "Made to measure";

type SeedInput = Omit<Product, "images"> & { images?: string[] };

const SEED_RAW: SeedInput[] = [
  {
    id: "salma-leaf",
    name: "Salma Leaf-Embroidered Abaya",
    description:
      "Deep cocoa crepe with hand-stitched gold leaf motifs on the sleeves and a clean column collar — the piece that opens our story.",
    price: 3299,
    category: "Premium Collection",
    image: "/brown-abaya.png",
    isNew: true,
    isBestSeller: true,
    createdAt: 1758000000000,
  },
  {
    id: "velvet-zari",
    name: "Velvet Zari Occasion Abaya",
    description:
      "Fluid velvet worked with fine zari trim, cut for evenings that ask for a little more quiet drama.",
    price: 5420,
    category: "Premium Collection",
    image: "/c7444d7e-59dd-420c-b872-d0034bb735df.jpg",
    isNew: false,
    isBestSeller: true,
    createdAt: 1757500000000,
  },
  {
    id: "layla-kaftan",
    name: "Layla Embroidered Kaftan",
    description:
      "A dusty-rose kaftan in matte satin and silk, embroidered at the cuff in old-gold thread.",
    price: 4340,
    category: "Premium Collection",
    image: "/94ab9240-bcc5-4d4e-9158-3ab38763c2cb.jpg",
    isNew: true,
    isBestSeller: false,
    createdAt: 1757000000000,
  },
  {
    id: "noor-batwing",
    name: "Noor Batwing Abaya",
    description:
      "Featherweight crepe with a sculptural batwing drape — the quiet uniform for every ordinary, sacred day.",
    price: 2760,
    category: "Abayas",
    image: "/29841407-fbf1-4dbf-b871-edae385fd647.jpg",
    isNew: false,
    isBestSeller: false,
    createdAt: 1756500000000,
  },
  {
    id: "hana-open",
    name: "Hana Open-Front Abaya",
    description:
      "An open-front layer in soft ivory crepe, designed to move over everything and compete with nothing.",
    price: 3150,
    category: "Abayas",
    image: "/15483af7-bc75-4e08-9658-218e4c66fce8.jpg",
    isNew: false,
    isBestSeller: true,
    createdAt: 1756000000000,
  },
  {
    id: "zari-trim",
    name: "Zari Trim Everyday Abaya",
    description:
      "Our house abaya, finished with a single hairline of gold zari along the placket.",
    price: 2499,
    category: "Abayas",
    image: "/4ef76c0c-9264-45dd-9b36-340e82a5e4ad.jpg",
    isNew: true,
    isBestSeller: false,
    createdAt: 1755500000000,
  },
  {
    id: "nadja-pleated",
    name: "Nadja Pleated Abaya",
    description:
      "Fine knife pleats fall from the shoulder for a column of gentle, light-catching movement.",
    price: 3860,
    category: "Premium Collection",
    image: "/b5fe8ee5-50e9-45a2-a07e-7e69cc3e0bde.jpg",
    isNew: false,
    isBestSeller: false,
    createdAt: 1755000000000,
  },
  {
    id: "rania-silk",
    name: "Rania Silk-Crepe Abaya",
    description:
      "Matte crepe faced with a whisper of silk — understated sheen, maximum ease.",
    price: 2980,
    category: "Abayas",
    image: "/45456844-bebf-4bf0-97ae-60a075ca50a8.jpg",
    isNew: false,
    isBestSeller: true,
    createdAt: 1754500000000,
  },
  {
    id: "amara-occasion",
    name: "Amara Occasion Abaya",
    description:
      "Structured shoulders and a sweeping hem for the occasions that deserve a entrance.",
    price: 4720,
    category: "Premium Collection",
    image: "/d43366d1-ebbc-486c-aa97-9e399bf79548.jpg",
    isNew: true,
    isBestSeller: false,
    createdAt: 1754000000000,
  },
];

const SEED: Product[] = SEED_RAW.map((p) => ({
  ...p,
  images: p.images?.length ? [...p.images] : p.image ? [p.image] : [],
}));

/** Gallery in display order (cover first). Falls back to cover for old rows. */
export function galleryImages(p: Product): string[] {
  if (p.images?.length) return p.images;
  return p.image ? [p.image] : [];
}

/** Max photos per product (mirrors backend MAX_IMAGES). */
export const MAX_PRODUCT_IMAGES = 5;

const KEY = "zari.catalog.v2";

/**
 * Storage adapter. Swap the bodies of loadProducts/saveProducts for async
 * API calls to move onto a real database without touching any UI code.
 */
export function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Product[];
      if (Array.isArray(parsed) && parsed.length) {
        // Backfill gallery for rows saved before multi-image support.
        return parsed.map((p) => ({
          ...p,
          images: p.images?.length ? p.images : p.image ? [p.image] : [],
        }));
      }
    }
  } catch {
    /* fall through to seed */
  }
  return SEED;
}

export function saveProducts(products: Product[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(products));
  } catch {
    /* quota — keep the in-memory state authoritative for this session */
  }
}

const SEED_COLLECTIONS: CollectionSlot[] = [
  {
    productId: "velvet-zari",
    name: "The Burgundy Edit",
    image: "/c7444d7e-59dd-420c-b872-d0034bb735df.jpg",
    alt: "Burgundy velvet occasion abaya with gold embroidered cuffs and hem",
    desc: "Velvet occasion abayas with hand-worked zari hems — the house's most ceremonial drape, dyed the colour of old burgundy wine.",
  },
  {
    productId: "noor-batwing",
    name: "Everyday Crepe",
    image: "/29841407-fbf1-4dbf-b871-edae385fd647.jpg",
    alt: "Cream batwing-sleeve crepe abaya",
    desc: "Featherweight crepe cut for motion — the quiet uniform for every ordinary, sacred day.",
  },
  {
    productId: "layla-kaftan",
    name: "Silk Occasion",
    image: "/94ab9240-bcc5-4d4e-9158-3ab38763c2cb.jpg",
    alt: "Dusty rose silk kaftan with embroidered sleeves",
    desc: "Matte satin and silk in dusty rose and old gold, made for evenings that matter.",
  },
  {
    productId: "nadja-pleated",
    name: "Midnight Pleats",
    image: "/b5fe8ee5-50e9-45a2-a07e-7e69cc3e0bde.jpg",
    alt: "Navy pleated abaya with fluted sleeves",
    desc: "Deep navy crepe with column pleating and fluted cuffs — structure, softened.",
  },
];

const COLLECTIONS_KEY = "zari.collections.v1";

export function loadCollections(): CollectionSlot[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CollectionSlot[];
      if (Array.isArray(parsed) && parsed.length === COLLECTION_SLOT_COUNT)
        return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  return SEED_COLLECTIONS;
}

export function saveCollections(slots: CollectionSlot[]): void {
  try {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(slots));
  } catch {
    /* quota — keep the in-memory state authoritative for this session */
  }
}

export function clearCollections(): void {
  try {
    localStorage.removeItem(COLLECTIONS_KEY);
  } catch {
    /* ignore */
  }
}

export function formatINR(paise: number): string {
  return "₹" + paise.toLocaleString("en-IN");
}

/** The price a shopper actually pays — the discount only counts when it is a
 *  real reduction, so a blank or too-high entry falls back to the list price. */
export function effectivePrice(product: Product): number {
  const discounted = product.discountPrice;
  return discounted && discounted > 0 && discounted < product.price
    ? discounted
    : product.price;
}

export function discountPercent(product: Product): number {
  const discounted = product.discountPrice;
  if (!discounted || discounted <= 0 || discounted >= product.price) return 0;
  return Math.round(((product.price - discounted) / product.price) * 100);
}

// ---------------------------------------------------------------------------
// Explore Collections — product-pinned home cards (matches Admin screenshots)
// ---------------------------------------------------------------------------
// The four stacked cards on the home page are always a product's own
// name/photo/description. A product is either Auto (not pinned) or pinned to
// slots 1-4. Pins are frontend-only (localStorage) so they work whether the
// catalog comes from the backend or the local seed. Unpinned slots are
// auto-filled: Best Sellers, New Arrivals, budget finds (under ₹3000) and
// premium picks (above ₹4500).

export type ExploreSlotNumber = 1 | 2 | 3 | 4;
export type ExploreSlot = ExploreSlotNumber | null; // null = Auto

const EXPLORE_PINS_KEY = "zari.explorePins.v1";

export function loadExplorePins(): Record<string, ExploreSlotNumber> {
  try {
    const raw = localStorage.getItem(EXPLORE_PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed === "object") {
        const clean: Record<string, ExploreSlotNumber> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v === 1 || v === 2 || v === 3 || v === 4) clean[k] = v;
        }
        return clean;
      }
    }
  } catch {
    /* fall through */
  }
  return {};
}

export function saveExplorePins(pins: Record<string, ExploreSlotNumber>): void {
  try {
    localStorage.setItem(EXPLORE_PINS_KEY, JSON.stringify(pins));
  } catch {
    /* quota — keep in-memory authoritative */
  }
}

export function getExploreSlot(
  pins: Record<string, ExploreSlotNumber>,
  productId: string
): ExploreSlot {
  return pins[productId] ?? null;
}

export function firstFreeExploreSlot(
  pins: Record<string, ExploreSlotNumber>,
  ignoreProductId?: string
): ExploreSlotNumber | null {
  const taken = new Set<number>();
  for (const [pid, slot] of Object.entries(pins)) {
    if (pid === ignoreProductId) continue;
    taken.add(slot);
  }
  for (const s of [1, 2, 3, 4] as ExploreSlotNumber[]) {
    if (!taken.has(s)) return s;
  }
  return null;
}

/** A product is only showcase-ready with a real name. Image-less or
 *  untitled rows (test drafts, half-saved pieces) are skipped by auto-fill
 *  so the home stack never shows junk like "jbehb" / "product 1". */
export function isShowcaseReady(p: Product): boolean {
  const name = (p.name || "").trim();
  if (name.length < 2) return false;
  if (name.toLowerCase() === "untitled piece") return false;
  return true;
}

/** Rank auto candidates: complete, flagged, well-described pieces first. */
function showcaseScore(p: Product): number {
  let s = 0;
  if (p.image && p.image.trim()) s += 3;
  if (p.isBestSeller) s += 2;
  if (p.isNew) s += 2;
  if ((p.description || "").trim().length >= 20) s += 2;
  if ((p.name || "").trim().length >= 10) s += 1;
  if (p.price > 0) s += 1;
  return s;
}

/** Drop pins that point at deleted ids or invalid slots. */
export function pruneExplorePins(
  pins: Record<string, ExploreSlotNumber>,
  products: Product[]
): Record<string, ExploreSlotNumber> {
  if (!Object.keys(pins).length) return pins;
  const ids = new Set(products.map((p) => p.id));
  const clean: Record<string, ExploreSlotNumber> = {};
  for (const [pid, slot] of Object.entries(pins)) {
    if (ids.has(pid) && slot >= 1 && slot <= 4) clean[pid] = slot;
  }
  return clean;
}

/** Four products for the home stack: pinned first, auto-fill the rest. */
export function getExploreCards(
  products: Product[],
  pins: Record<string, ExploreSlotNumber>
): Product[] {
  if (!products.length) return [];
  const ready = products.filter(isShowcaseReady);
  // If nothing is showcase-ready yet, fall back to raw products rather
  // than rendering an empty section.
  const pool = ready.length ? ready : products;
  const byIdAll = new Map(products.map((p) => [p.id, p]));
  const used = new Set<string>();
  const cards: (Product | null)[] = [null, null, null, null];

  // Pinned slots win — admin's explicit choice is always honoured,
  // even for a work-in-progress piece.
  for (const [pid, slot] of Object.entries(pins)) {
    const p = byIdAll.get(pid);
    if (p && slot >= 1 && slot <= 4 && !used.has(pid)) {
      cards[slot - 1] = p;
      used.add(pid);
    }
  }

  // Auto candidates ranked by completeness so test drafts sink.
  const ranked = [...pool]
    .filter((p) => !used.has(p.id))
    .sort(
      (a, b) => showcaseScore(b) - showcaseScore(a) || b.createdAt - a.createdAt
    );

  const pick = (pred: (p: Product) => boolean): Product | null => {
    for (const p of ranked) {
      if (!used.has(p.id) && pred(p)) {
        used.add(p.id);
        return p;
      }
    }
    return null;
  };
  const pickAny = (): Product | null => {
    for (const p of ranked) {
      if (!used.has(p.id)) {
        used.add(p.id);
        return p;
      }
    }
    return null;
  };

  // Auto order: Best Seller → New Arrival → budget (<3000) → premium (>4500).
  const autoPickers: Array<(p: Product) => boolean> = [
    (p) => p.isBestSeller,
    (p) => p.isNew,
    (p) => effectivePrice(p) < 3000,
    (p) => effectivePrice(p) > 4500,
  ];

  for (let i = 0; i < 4; i++) {
    if (cards[i]) continue;
    const autoIdx = i; // slot N auto-fills from picker N
    const pred = autoPickers[autoIdx] ?? (() => true);
    cards[i] = pick(pred) ?? pickAny();
  }

  return cards.filter((c): c is Product => c !== null);
}
