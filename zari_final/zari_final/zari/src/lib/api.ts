import type { Category, Product } from "../data/catalog";

// Base URL of the FastAPI backend. Override with VITE_API_URL in root .env
// (already set to http://localhost:8000).
const API_BASE = (
  (import.meta as unknown as { env: Record<string, string | undefined> }).env
    ?.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export const usingApi = () => true;

// ---------------------------------------------------------------------------
// Admin session (backend-issued bearer token, 12h expiry)
// ---------------------------------------------------------------------------

const TOKEN_KEY = "zari.admin.token";
const USER_KEY = "zari.admin.user";

export function adminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function adminUser(): string | null {
  try {
    return sessionStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function isAdminAuthed(): boolean {
  return adminToken() !== null;
}

function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
} 



// ---------------------------------------------------------------------------
// Backend <-> frontend field mapping
// ---------------------------------------------------------------------------
// backend products row: id(uuid) product_name description price offer_price
// quantity color category is_new is_best_seller created_at updated_at
// backend product_images row: id product_id image_url public_id ...

interface BackendImage {
  id: string;
  product_id: string;
  image_url: string;
  public_id: string;
  created_at?: string;
}

interface BackendProduct {
  id: string;
  product_name?: string;
  description?: string | null;
  price?: number;
  offer_price?: number | null;
  quantity?: number | null;
  color?: string | null;
  category?: string | null;
  is_new?: boolean | null;
  is_best_seller?: boolean | null;
  created_at?: string;
  images?: BackendImage[];
}

export function normalizeCategory(raw: unknown): Category {
  const cleaned =
    typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  return cleaned || "Abayas";
}

export function toFrontend(row: BackendProduct): Product {
  const images = row.images ?? [];
  const price = Number(row.price ?? 0);
  const offer =
    row.offer_price == null ? undefined : Number(row.offer_price);
  // Free-form: any non-empty backend value is kept, so new categories
  // created in Admin survive the round-trip and get their own tab.
  const cat = normalizeCategory(row.category);
  const gallery = images.map((i) => i.image_url).filter(Boolean);
  return {
    id: String(row.id),
    name: row.product_name || "Untitled piece",
    description: row.description ?? "",
    price,
    // A discount only counts when it is a real reduction (same rule as
    // effectivePrice in data/catalog).
    ...(offer && offer > 0 && offer < price ? { discountPrice: offer } : {}),
    category: cat,
    // First image is the storefront cover (matches Admin's cover concept).
    image: gallery[0] ?? "",
    images: gallery,
    quantity: row.quantity ?? 0,
    colour: row.color ?? "",
    isNew: !!row.is_new,
    isBestSeller: !!row.is_best_seller,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Request helper (throws Error with the backend's detail message)
// ---------------------------------------------------------------------------

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  // Attach the admin session token when present — public reads ignore
  // it, protected mutations require it.
  const token = adminToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    res = await fetch(API_BASE + path, { ...init, headers });
  } catch {
    throw new Error(
      "Couldn't reach the backend — is it running on " + API_BASE + "?"
    );
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === "string" ? detail : `Request failed (${res.status})`;
    if (res.status === 401 && token) {
      // Session rejected (expired/invalid) — drop it so the Admin page
      // falls back to the sign-in screen instead of retrying blindly.
      clearAdminSession();
    }
    throw new Error(message);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Product form + image selections (what the Admin page passes in)
// ---------------------------------------------------------------------------

export interface ProductForm {
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  category: Category;
  quantity: number;
  colour: string;
  isNew: boolean;
  isBestSeller: boolean;
}

/** One gallery slot: a freshly cropped File, or an existing URL to keep. */
export interface ImageSelection {
  file?: File;
  url?: string;
}

/** Turn a kept URL (remote https, site asset or data-URL) into upload bytes. */
async function selectionToFile(sel: ImageSelection, index: number): Promise<File> {
  if (sel.file) return sel.file;
  if (sel.url) {
    const res = await fetch(sel.url);
    if (!res.ok) throw new Error(`Could not read image ${index + 1}.`);
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
    return new File([blob], `image-${index + 1}.${ext}`, {
      type: blob.type || "image/jpeg",
    });
  }
  throw new Error(`Image ${index + 1} has no file.`);
}

function fieldsToFormData(f: ProductForm): FormData {
  const fd = new FormData();
  fd.append("product_name", f.name);
  fd.append("description", f.description);
  fd.append("price", String(f.price));
  if (
    f.discountPrice !== undefined &&
    f.discountPrice > 0 &&
    f.discountPrice < f.price
  ) {
    fd.append("offer_price", String(f.discountPrice));
  }
  fd.append("quantity", String(f.quantity));
  fd.append("color", f.colour);
  fd.append("category", f.category);
  fd.append("is_new", String(f.isNew));
  fd.append("is_best_seller", String(f.isBestSeller));
  return fd;
}

// ---------------------------------------------------------------------------
// Products API (mirrors the FastAPI routes in zari_backend/main.py)
// ---------------------------------------------------------------------------

export const api = {
  base: API_BASE,

  listProducts: async (): Promise<Product[]> => {
    const data = (await request("/products")) as {
      products: BackendProduct[];
    };
    return (data.products ?? []).map(toFrontend);
  },

  /** Registry of known categories (falls back to [] when backend is old). */
  listCategories: async (): Promise<string[]> => {
    try {
      const data = (await request("/categories")) as {
        categories?: unknown;
      };
      const raw = Array.isArray(data.categories) ? data.categories : [];
      const clean = raw
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().replace(/\s+/g, " "))
        .filter(Boolean);
      return [...new Set(clean)];
    } catch {
      return [];
    }
  },

  /** Pre-register a category name (also auto-registers on product save). */
  createCategory: async (name: string): Promise<string> => {
    const fd = new FormData();
    fd.append("name", name.trim());
    const data = (await request("/categories", {
      method: "POST",
      body: fd,
    })) as { category?: string; categories?: string[] };
    return (data.category ?? name).trim() || name.trim();
  },

  getProduct: async (id: string): Promise<Product> => {
    const row = (await request(`/products/${id}`)) as BackendProduct;
    return toFrontend(row);
  },

  createProduct: async (
    form: ProductForm,
    selections: ImageSelection[]
  ): Promise<Product> => {
    const files = await Promise.all(selections.map(selectionToFile));
    if (!files.length) throw new Error("Add at least one product image.");
    const fd = fieldsToFormData(form);
    files.forEach((file) => fd.append("images", file));
    const data = (await request("/products", {
      method: "POST",
      body: fd,
    })) as { product: BackendProduct; images: BackendImage[] };
    return toFrontend({ ...data.product, images: data.images });
  },

  /**
   * Update fields (PUT). When `selections` is a non-empty array the gallery
   * is synced too: new Files are uploaded first, then rows whose URL is not
   * kept are deleted (the backend refuses to delete the last image, and we
   * never ask it to — a new cover is always uploaded before pruning).
   */
  updateProduct: async (
    id: string,
    form: ProductForm,
    selections?: ImageSelection[]
  ): Promise<Product> => {
    await request(`/products/${id}`, {
      method: "PUT",
      body: fieldsToFormData(form),
    });

    if (selections && selections.length > 0) {
      const fresh = (await request(`/products/${id}`)) as BackendProduct;
      const rows = fresh.images ?? [];

      const newFiles = selections
        .filter((s) => s.file)
        .map((s) => s.file as File);
      const keepUrls = new Set(
        selections.filter((s) => !s.file && s.url).map((s) => s.url as string)
      );

      const addedIds = new Set<string>();
      if (newFiles.length > 0) {
        const fd = new FormData();
        newFiles.forEach((file) => fd.append("images", file));
        const added = (await request(`/products/${id}/images`, {
          method: "POST",
          body: fd,
        })) as { images: BackendImage[] };
        added.images.forEach((img) => addedIds.add(String(img.id)));
      }

      const victims = rows.filter(
        (r) => !addedIds.has(String(r.id)) && !keepUrls.has(r.image_url)
      );
      // Keep at least one image overall: survivors are the kept rows plus
      // the freshly uploaded ones (the old code ignored the uploads, so
      // replacing the only photo could never delete the original).
      const survivors = rows.length - victims.length + addedIds.size;
      const deletable =
        survivors >= 1
          ? victims
          : victims.slice(0, Math.max(0, survivors - 1));
      for (const v of deletable) {
        await request(`/product-images/${v.id}`, { method: "DELETE" });
      }
    }

    const done = (await request(`/products/${id}`)) as BackendProduct;
    const mapped = toFrontend(done);

    // Persist gallery order (cover first) when the backend supports it.
    // Best-effort: older backends 404 here and the DB order is kept.
    if (selections && selections.length > 1 && done.images?.length) {
      const keepUrls = new Set(
        selections.filter((s) => !s.file && s.url).map((s) => s.url as string)
      );
      const keptByUrl = new Map<string, string>();
      const addedIds: string[] = [];
      for (const r of done.images ?? []) {
        if (keepUrls.has(r.image_url) && !keptByUrl.has(r.image_url)) {
          keptByUrl.set(r.image_url, String(r.id));
        } else {
          addedIds.push(String(r.id));
        }
      }
      const order: string[] = [];
      const used = new Set<string>();
      let freshIdx = 0;
      for (const s of selections) {
        if (s.file) {
          if (freshIdx < addedIds.length) {
            used.add(addedIds[freshIdx]);
            order.push(addedIds[freshIdx]);
            freshIdx += 1;
          }
        } else if (s.url && keptByUrl.has(s.url)) {
          const imgId = keptByUrl.get(s.url) as string;
          if (!used.has(imgId)) {
            used.add(imgId);
            order.push(imgId);
          }
        }
      }
      for (const r of done.images ?? []) {
        const imgId = String(r.id);
        if (!used.has(imgId)) {
          used.add(imgId);
          order.push(imgId);
        }
      }
      if (order.length > 1) {
        try {
          const reordered = (await request(`/products/${id}/images/order`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_ids: order }),
          })) as { images: BackendImage[] };
          if (Array.isArray(reordered.images) && reordered.images.length) {
            return toFrontend({ ...done, images: reordered.images });
          }
        } catch {
          /* backend without reorder support — keep DB order */
        }
      }
    }
    return mapped;
  },

  /** Persist gallery order (cover first). No-op on older backends. */
  reorderImages: async (id: string, imageIds: string[]): Promise<void> => {
    await request(`/products/${id}/images/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: imageIds }),
    });
  },

  deleteProduct: async (id: string): Promise<void> => {
    await request(`/products/${id}`, { method: "DELETE" });
  },

  /** Verify the admin password against the DB hash; stores the token. */
  adminLogin: async (password: string, username = "admin"): Promise<string> => {
    const fd = new FormData();
    fd.append("username", username);
    fd.append("password", password);
    const data = (await request("/admin/login", {
      method: "POST",
      body: fd,
    })) as { token?: string; username?: string };
    if (!data.token) throw new Error("Login failed — no session issued.");
    try {
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(USER_KEY, data.username ?? username);
    } catch {
      /* storage blocked — token still returned for this call */
    }
    return data.token;
  },

  adminLogout: (): void => {
    clearAdminSession();
  },

  /** Change password (requires a valid session — enforced server-side). */
  adminChangePassword: async (newPassword: string): Promise<void> => {
    const fd = new FormData();
    fd.append("new_password", newPassword);
    await request("/admin/change-password", { method: "POST", body: fd });
  },
};
