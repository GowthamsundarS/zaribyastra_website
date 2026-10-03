import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useCatalog } from "../contexts/CatalogContext";
import { api, isAdminAuthed } from "../lib/api";
import type { ImageSelection } from "../lib/api";
import {
  formatINR,
  effectivePrice,
  discountPercent,
  normalizeCategoryName,
  galleryImages,
  MAX_PRODUCT_IMAGES,
  type Category,
  type ExploreSlot,
  type ExploreSlotNumber,
  type Product,
} from "../data/catalog";
import { orderCount } from "../utils/whatsapp";
import { ImageCropModal } from "../components/ImageCropModal";
import { validateImageFile } from "../utils/cropImage";

const SESSION_KEY = "zari.admin";

const easeEditorial: [number, number, number, number] = [0.14, 1, 0.34, 1];

interface Draft {
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  category: Category;
  isNew: boolean;
  isBestSeller: boolean;
}

const emptyDraft: Draft = {
  name: "",
  description: "",
  price: "",
  discountPrice: "",
  category: "Abayas",
  isNew: false,
  isBestSeller: false,
};

function toDraft(p: Product): Draft {
  return {
    name: p.name,
    description: p.description,
    price: String(p.price),
    discountPrice: p.discountPrice ? String(p.discountPrice) : "",
    category: p.category,
    isNew: p.isNew,
    isBestSeller: p.isBestSeller,
  };
}

const isBlobUrl = (u: string) => u.startsWith("blob:");
const revokeQuiet = (u: string) => {
  if (isBlobUrl(u)) {
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  }
};

export function Admin() {
  // A valid backend session token is the only gate — the old local
  // passcode check (and its VITE_ADMIN_PASSCODE secret in the bundle)
  // is gone. Passwords are verified against the DB hash via /admin/login.
  const [authed, setAuthed] = useState(() => isAdminAuthed());
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  // Carries e.g. "Session expired" from the dashboard across sign-out.
  const [notice] = useState<string | null>(() => {
    try {
      const n = sessionStorage.getItem("zari.admin.note");
      sessionStorage.removeItem("zari.admin.note");
      return n;
    } catch {
      return null;
    }
  });

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 pt-32">
        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeEditorial }}
          onSubmit={(e) => {
            e.preventDefault();
            if (signingIn) return;
            setSigningIn(true);
            setPassError(null);
            api
              .adminLogin(pass, user.trim() || "admin")
              .then(() => {
                try {
                  sessionStorage.setItem(SESSION_KEY, "1");
                } catch {
                  /* ignore */
                }
                setAuthed(true);
              })
              .catch((err) => {
                setPassError(
                  err instanceof Error ? err.message : "Sign-in failed."
                );
              })
              .finally(() => setSigningIn(false));
          }}
          className="w-full max-w-sm rounded-2xl border border-maroon/10 bg-white/80 p-8 text-center shadow-[0_18px_45px_rgba(31,5,9,0.08)]"
        >
          <p className="font-sans text-[11px] uppercase tracking-[0.3em] text-maroon/60">
            ZARI
          </p>
          <h1 className="mt-2 font-display text-3xl text-maroon-ink">Atelier Access</h1>
          <p className="mt-3 font-sans text-sm text-maroon-ink/60">
            Sign in to manage the boutique.
          </p>
          <input
            type="text"
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              setPassError(null);
            }}
            placeholder="Username (admin)"
            autoComplete="username"
            className="mt-6 w-full rounded-xl border border-maroon/20 bg-ivory/60 px-4 py-3 text-center font-sans text-sm text-maroon-ink outline-none focus:border-maroon/50"
          />
          <input
            type="password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setPassError(null);
            }}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            className="mt-3 w-full rounded-xl border border-maroon/20 bg-ivory/60 px-4 py-3 text-center font-sans text-sm tracking-[0.2em] text-maroon-ink outline-none focus:border-maroon/50"
          />
          {notice && !passError && (
            <p className="mt-2 font-sans text-xs text-maroon/80">{notice}</p>
          )}
          {passError && (
            <p className="mt-2 font-sans text-xs text-maroon">{passError}</p>
          )}
          <button
            type="submit"
            disabled={signingIn}
            className="mt-6 w-full rounded-full bg-maroon px-6 py-3 font-sans text-[12px] uppercase tracking-[0.22em] text-ivory transition-colors hover:bg-maroon-ink disabled:opacity-50"
          >
            {signingIn ? "Signing in…" : "Enter"}
          </button>
        </motion.form>
      </main>
    );
  }

  return (
    <AdminDashboard
      onSignOut={() => {
        api.adminLogout();
        try {
          sessionStorage.removeItem(SESSION_KEY);
        } catch {
          /* ignore */
        }
        setAuthed(false);
      }}
    />
  );
}

function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const {
    products,
    categories,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    getExploreSlot,
    setExploreSlot,
    firstFreeSlot,
  } = useCatalog();

  const [editing, setEditing] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<Product | null>(null);
  const [editingSlot, setEditingSlot] = useState<ExploreSlot>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Dynamic-category UI: pick an existing tab or type a brand-new name.
  const [categoryMode, setCategoryMode] = useState<"select" | "new">("select");
  const [newCategory, setNewCategory] = useState("");

  // Multi-image gallery (up to MAX_PRODUCT_IMAGES). Order matters:
  // first item is the cover shown on cards. Items are either cropped
  // Files (fresh uploads) or kept URLs (existing / pasted links).
  interface GalleryItem {
    key: string;
    file?: File;
    url: string;
    preview: string;
  }
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [activeCrop, setActiveCrop] = useState<{ src: string; fileName: string } | null>(null);
  const [cropQueue, setCropQueue] = useState<{ src: string; fileName: string }[]>([]);
  const [cropError, setCropError] = useState<string | null>(null);
  const [cardCollapsed, setCardCollapsed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const gallerySeq = useRef(0);
  const nextGalleryKey = () => {
    gallerySeq.current += 1;
    return `g${Date.now()}-${gallerySeq.current}`;
  };
  const revokeGallery = (items: GalleryItem[]) => {
    for (const it of items) {
      if (it.file) revokeQuiet(it.preview);
    }
  };

  const newCount = products.filter((p) => p.isNew).length;
  const bestCount = products.filter((p) => p.isBestSeller).length;

  const openNew = () => {
    setEditing({
      ...emptyDraft,
      category: categories[0] ?? emptyDraft.category,
    });
    setEditingId(null);
    setEditingOriginal(null);
    setEditingSlot(null);
    setCategoryMode("select");
    setNewCategory("");
    setGallery([]);
    setImageUrl("");
    if (activeCrop) revokeQuiet(activeCrop.src);
    cropQueue.forEach((q) => revokeQuiet(q.src));
    setActiveCrop(null);
    setCropQueue([]);
    setCropError(null);
    setCardCollapsed(false);
  };

  const openEdit = (p: Product) => {
    setEditing(toDraft(p));
    setEditingId(p.id);
    setEditingOriginal(p);
    setEditingSlot(getExploreSlot(p.id));
    setCategoryMode("select");
    setNewCategory("");
    setGallery(
      galleryImages(p).map((url, i) => ({
        key: `existing-${p.id}-${i}`,
        url,
        preview: url,
      }))
    );
    setImageUrl("");
    if (activeCrop) revokeQuiet(activeCrop.src);
    cropQueue.forEach((q) => revokeQuiet(q.src));
    setActiveCrop(null);
    setCropQueue([]);
    setCropError(null);
    setCardCollapsed(false);
  };

  const closeForm = () => {
    revokeGallery(gallery);
    if (activeCrop) revokeQuiet(activeCrop.src);
    cropQueue.forEach((q) => revokeQuiet(q.src));
    setEditing(null);
    setEditingId(null);
    setEditingOriginal(null);
    setEditingSlot(null);
    setCategoryMode("select");
    setNewCategory("");
    setGallery([]);
    setImageUrl("");
    setActiveCrop(null);
    setCropQueue([]);
    setCropError(null);
  };

  const flash = (msg: string) => {
    setSavedNote(msg);
    window.setTimeout(() => setSavedNote(null), 2500);
  };

  // An expired/invalid session clears the token API-side; bounce back
  // to sign-in with the reason preserved. Returns true when handled.
  const expireSession = (e: unknown): boolean => {
    const msg = e instanceof Error ? e.message : "";
    if (/session expired|sign-in required/i.test(msg)) {
      try {
        sessionStorage.setItem("zari.admin.note", msg);
      } catch {
        /* ignore */
      }
      onSignOut();
      return true;
    }
    return false;
  };

  const reportError = (e: unknown, fallback: string) => {
    if (!expireSession(e)) flash(e instanceof Error ? e.message : fallback);
  };

  const galleryFull =
    gallery.length + (activeCrop ? 1 : 0) + cropQueue.length >=
    MAX_PRODUCT_IMAGES;

  const handleFiles = (files: FileList | File[] | null | undefined) => {
    if (!files || !editing) return;
    const picked = Array.from(files);
    if (!picked.length) return;
    const slotsLeft =
      MAX_PRODUCT_IMAGES - gallery.length - (activeCrop ? 1 : 0) - cropQueue.length;
    if (slotsLeft <= 0) {
      const msg = `Maximum ${MAX_PRODUCT_IMAGES} photos per product.`;
      setCropError(msg);
      flash(msg);
      return;
    }
    const usable = picked.slice(0, slotsLeft);
    if (picked.length > slotsLeft) {
      flash(`Only ${slotsLeft} more photo(s) fit — extras ignored.`);
    }
    const staged: { src: string; fileName: string }[] = [];
    for (const file of usable) {
      const check = validateImageFile(file);
      if (!check.ok) {
        const msg = (check as { ok: false; error: string }).error;
        setCropError(msg);
        flash(msg);
        continue;
      }
      staged.push({ src: URL.createObjectURL(file), fileName: file.name });
    }
    if (!staged.length) return;
    setCropError(null);
    if (activeCrop) {
      setCropQueue((q) => [...q, ...staged]);
    } else {
      const [first, ...rest] = staged;
      setActiveCrop(first);
      setCropQueue((q) => [...q, ...rest]);
    }
  };

  const advanceCropQueue = () => {
    if (cropQueue.length) {
      const [next, ...rest] = cropQueue;
      setActiveCrop(next);
      setCropQueue(rest);
      return true;
    }
    setActiveCrop(null);
    return false;
  };

  const handleCropApply = (file: File, previewUrl: string) => {
    // Fresh select object URL served its purpose.
    if (activeCrop) revokeQuiet(activeCrop.src);
    setGallery((g) =>
      g.length >= MAX_PRODUCT_IMAGES
        ? g
        : [...g, { key: nextGalleryKey(), file, url: "", preview: previewUrl }]
    );
    const more = advanceCropQueue();
    flash(
      more
        ? "Photo added — arrange the next one."
        : "Cropped — preview shows exactly what will upload."
    );
  };

  const handleCropCancel = () => {
    // Skip this photo, keep arranging the rest of the batch.
    if (activeCrop) revokeQuiet(activeCrop.src);
    const more = advanceCropQueue();
    if (more) flash("Skipped — arranging the next photo.");
  };

  const handleUrlAdd = () => {
    const v = imageUrl.trim();
    if (!v) return;
    if (gallery.length >= MAX_PRODUCT_IMAGES) {
      const msg = `Maximum ${MAX_PRODUCT_IMAGES} photos per product.`;
      setCropError(msg);
      flash(msg);
      return;
    }
    if (!/^(https?:\/\/|\/|data:image\/)/i.test(v)) {
      const msg = "Paste an image link (https://…) or upload a file.";
      setCropError(msg);
      flash(msg);
      return;
    }
    setCropError(null);
    setGallery((g) => [...g, { key: nextGalleryKey(), url: v, preview: v }]);
    setImageUrl("");
  };

  const removeGalleryItem = (key: string) => {
    setGallery((g) => {
      const victim = g.find((it) => it.key === key);
      if (victim?.file) revokeQuiet(victim.preview);
      return g.filter((it) => it.key !== key);
    });
  };

  const setGalleryCover = (key: string) => {
    setGallery((g) => {
      const idx = g.findIndex((it) => it.key === key);
      if (idx <= 0) return g;
      const next = [...g];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
  };

  const save = async () => {
    if (!editing || uploading || activeCrop || cropQueue.length) return;
    const price = Math.max(0, Number(editing.price) || 0);
    const discount = Number(editing.discountPrice) || 0;

    // Resolve the category: typed name wins in "new" mode, dropdown otherwise.
    const rawCategory =
      categoryMode === "new" ? newCategory : editing.category;
    const cleaned = normalizeCategoryName(rawCategory || "");
    if (!cleaned) {
      flash("Give the piece a category name.");
      return;
    }
    if (cleaned.length < 2) {
      flash("Category name must be at least 2 characters.");
      return;
    }
    if (cleaned.length > 60) {
      flash("Category name must be under 60 characters.");
      return;
    }
    // Reuse existing casing for case-insensitive duplicates.
    const existing =
      categories.find((c) => c.toLowerCase() === cleaned.toLowerCase()) ??
      products
        .map((p) => p.category)
        .find((c) => c.toLowerCase() === cleaned.toLowerCase());
    const finalCategory = existing ?? cleaned;

    if (gallery.length > MAX_PRODUCT_IMAGES) {
      flash(`Maximum ${MAX_PRODUCT_IMAGES} photos per product.`);
      return;
    }

    let selections: ImageSelection[] | undefined;
    if (editingId) {
      const origGallery = editingOriginal
        ? galleryImages(editingOriginal)
        : [];
      const unchanged =
        gallery.length === origGallery.length &&
        gallery.every(
          (it, i) => !it.file && it.url === origGallery[i]
        );
      selections = unchanged
        ? undefined // gallery untouched — fields-only update
        : gallery.map((it) =>
            it.file ? { file: it.file } : { url: it.url }
          );
      if (selections && !selections.length) {
        flash("Keep at least one photo — add a replacement first.");
        return;
      }
    } else {
      selections =
        gallery.length > 0
          ? gallery.map((it) =>
              it.file ? { file: it.file } : { url: it.url }
            )
          : [{ url: "/brown-abaya.png" }];
    }

    const payload = {
      name: editing.name.trim() || "Untitled piece",
      description: editing.description.trim(),
      price,
      discountPrice: discount > 0 && discount < price ? discount : undefined,
      category: finalCategory,
      quantity: editingOriginal?.quantity ?? 0,
      colour: editingOriginal?.colour ?? "",
      isNew: editing.isNew,
      isBestSeller: editing.isBestSeller,
    };

    setUploading(true);
    try {
      if (editingId) {
        await updateProduct(editingId, payload, selections ? { images: selections } : undefined);
        setExploreSlot(editingId, editingSlot);
        flash(
          existing
            ? "Product updated."
            : `Product updated — new category “${finalCategory}” created.`
        );
      } else {
        const created = await addProduct(payload, selections!);
        setExploreSlot(created.id, editingSlot);
        flash(
          existing
            ? "Product added."
            : `Product added — new category “${finalCategory}” created.`
        );
      }
      closeForm();
    } catch (e) {
      reportError(e, "Save failed.");
    } finally {
      setUploading(false);
    }
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const addCardToFreeSlot = () => {
    const free = firstFreeSlot(editingId ?? undefined);
    if (free) {
      setEditingSlot(free);
    } else {
      // All full — take slot 1 (evicts whoever held it on save).
      setEditingSlot(1);
    }
  };

  useEffect(() => {
    if (!editing) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-28 sm:px-8 md:pt-32">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-[11px] uppercase tracking-[0.35em] text-maroon/60">
            ZARI
          </p>
          <h1 className="mt-2 font-display text-4xl text-maroon-ink sm:text-5xl">
            Admin Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-full bg-maroon px-5 py-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors hover:bg-maroon-deep"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add Product
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-full border border-maroon/25 px-5 py-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-maroon-ink transition-colors hover:bg-maroon/5"
          >
            Sign out
          </button>
        </div>
      </div>

      {savedNote && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-maroon/10 px-4 py-2 font-sans text-xs text-maroon"
        >
          <Check className="h-3.5 w-3.5" /> {savedNote}
        </motion.p>
      )}

      {/* Stats */}
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Products", value: products.length, icon: LayoutGrid },
          { label: "Orders & Enquiries", value: orderCount(), icon: MessageSquare },
          { label: "New Arrivals", value: newCount, icon: Sparkles },
          { label: "Best Sellers", value: bestCount, icon: Star },
        ].map(({ label, value, icon: Icon }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: easeEditorial }}
            className="rounded-2xl border border-maroon/10 bg-white/70 p-5 shadow-[0_14px_36px_rgba(31,5,9,0.05)]"
          >
            <Icon className="h-[18px] w-[18px] text-maroon/60" strokeWidth={1.5} />
            <p className="mt-4 font-display text-4xl text-maroon-ink">{value}</p>
            <p className="mt-1 font-sans text-[11px] uppercase tracking-[0.2em] text-maroon/55">
              {label}
            </p>
          </motion.div>
        ))}
      </section>

      {/* Products */}
      <section className="mt-10">
        <h2 className="font-display text-2xl text-maroon-ink">
          Products{" "}
          <span className="font-sans text-sm not-italic text-maroon/55">
            ({products.length})
          </span>
        </h2>
        <p className="mt-3 max-w-3xl font-sans text-[13px] leading-7 text-maroon-ink/60">
          The four Explore Collections cards on the home page can be pinned to
          slots 1–4 with the Add Card button inside a product&apos;s pop-up, or
          left on Auto — auto cards pick themselves from Best Sellers, New
          Arrivals, budget finds (under ₹3000) and premium picks (above ₹4500),
          skipping pieces without a proper name so test drafts never headline
          the home page. Every card shows the product&apos;s own name, photo
          and description, and clicking View Product opens that product&apos;s
          page.
        </p>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-maroon/10 bg-white/70">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-maroon/10 font-sans text-[10px] uppercase tracking-[0.2em] text-maroon/55">
                <th className="px-5 py-3.5 font-medium">Product (Explore Collections Card)</th>
                <th className="px-5 py-3.5 font-medium">Category</th>
                <th className="px-5 py-3.5 font-medium">Price</th>
                <th className="px-5 py-3.5 font-medium">Flags</th>
                <th className="px-5 py-3.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const slot = getExploreSlot(p.id);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-maroon/10 last:border-0 hover:bg-maroon/[0.03]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.image || "/brown-abaya.png"}
                          alt=""
                          className="aspect-[3/4] w-11 shrink-0 rounded-md object-cover object-top"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-sans text-sm text-maroon-ink">{p.name}</p>
                          {slot && (
                            <span className="mt-1.5 inline-block rounded-full bg-[#E9D9D2] px-2.5 py-1 font-sans text-[9px] uppercase tracking-[0.16em] text-maroon">
                              Explore Collections Card
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-sans text-xs text-maroon-ink/70">
                      {p.category}
                    </td>
                    <td className="px-5 py-4 font-sans text-sm tabular-nums text-maroon-ink">
                      {discountPercent(p) > 0 && (
                        <s className="mr-2 text-maroon-ink/40">{formatINR(p.price)}</s>
                      )}
                      <span className={discountPercent(p) > 0 ? "text-maroon" : undefined}>
                        {formatINR(effectivePrice(p))}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateProduct(p.id, { isNew: !p.isNew }).catch(
                              (e) =>
                                reportError(
                                  e,
                                  "Couldn't reach the backend."
                                )
                            )
                          }
                          title="Toggle New Arrival"
                          className={`rounded-full px-2.5 py-1 font-sans text-[10px] uppercase tracking-[0.12em] transition-colors ${
                            p.isNew
                              ? "bg-maroon/15 text-maroon"
                              : "border border-dashed border-maroon/25 text-maroon/45"
                          }`}
                        >
                          New
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateProduct(p.id, { isBestSeller: !p.isBestSeller }).catch(
                              (e) =>
                                reportError(
                                  e,
                                  "Couldn't reach the backend."
                                )
                            )
                          }
                          title="Toggle Best Seller"
                          className={`rounded-full px-2.5 py-1 font-sans text-[10px] uppercase tracking-[0.12em] transition-colors ${
                            p.isBestSeller
                              ? "bg-maroon/15 text-maroon"
                              : "border border-dashed border-maroon/25 text-maroon/45"
                          }`}
                        >
                          Best
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          aria-label={`Edit ${p.name}`}
                          className="rounded-full p-2 text-maroon/60 transition-colors hover:bg-maroon/5 hover:text-maroon"
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(p)}
                          aria-label={`Delete ${p.name}`}
                          className="rounded-full p-2 text-maroon/60 transition-colors hover:bg-maroon/5 hover:text-maroon"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && products.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center font-sans text-sm text-maroon-ink/50">
                    No products yet — add your first piece.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add / Edit modal — matches screenshots */}
      {editing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-maroon-ink/55 px-4 py-6 backdrop-blur-sm sm:px-6"
          onClick={closeForm}
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? "Edit product" : "Add product"}
        >
          <motion.section
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: easeEditorial }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-maroon/15 bg-[#FFFEFB] p-6 shadow-[0_30px_70px_rgba(31,5,9,0.35)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-3xl text-maroon-ink">
                {editingId ? "Edit Product" : "Add Product"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="rounded-full p-2 text-maroon/60 transition-colors hover:bg-maroon/5 hover:text-maroon"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-8 md:grid-cols-2">
              {/* Left: fields */}
              <div className="space-y-5">
                <Field label="Product Name">
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Salma Leaf-Embroidered Abaya"
                    className={inputCls}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={editing.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={4}
                    placeholder="A sentence or two on fabric, cut and feel."
                    className={`${inputCls} resize-y`}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Price (₹)">
                    <input
                      type="number"
                      min={0}
                      value={editing.price}
                      onChange={(e) => set("price", e.target.value)}
                      placeholder="2999"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Discount Price (₹)">
                    <input
                      type="number"
                      min={0}
                      value={editing.discountPrice}
                      onChange={(e) => set("discountPrice", e.target.value)}
                      placeholder="None"
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Category">
                  {categoryMode === "select" ? (
                    <>
                      <select
                        value={
                          categories.includes(editing.category)
                            ? editing.category
                            : (categories[0] ?? editing.category)
                        }
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setCategoryMode("new");
                            setNewCategory("");
                          } else {
                            set("category", e.target.value);
                          }
                        }}
                        className={inputCls}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__new__">+ Add new category…</option>
                      </select>
                      <p className="mt-2 font-sans text-[11px] leading-5 text-maroon-ink/50">
                        Pick a tab, or add a new one — a new name creates its
                        own tab in Explore the Collection.
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        autoFocus
                        value={newCategory}
                        onChange={(e) => {
                          setNewCategory(e.target.value);
                          set("category", e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.preventDefault();
                        }}
                        placeholder="e.g. Festive Edit"
                        maxLength={60}
                        className={inputCls}
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="font-sans text-[11px] leading-5 text-maroon-ink/50">
                          Saving creates the “{normalizeCategoryName(newCategory) || "…"}” tab.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryMode("select");
                            setNewCategory("");
                            set(
                              "category",
                              categories[0] ?? "Abayas"
                            );
                          }}
                          className="shrink-0 font-sans text-[11px] uppercase tracking-[0.16em] text-maroon/70 underline-offset-2 hover:text-maroon hover:underline"
                        >
                          Choose existing
                        </button>
                      </div>
                    </>
                  )}
                </Field>
                <div className="flex gap-6 pt-1">
                  <Toggle label="New Arrival" checked={editing.isNew} onChange={(v) => set("isNew", v)} />
                  <Toggle label="Best Seller" checked={editing.isBestSeller} onChange={(v) => set("isBestSeller", v)} />
                </div>
              </div>

              {/* Right: photos + explore card */}
              <div className="space-y-5">
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-maroon/60">
                      Photos ({gallery.length}/{MAX_PRODUCT_IMAGES})
                    </span>
                    {gallery.length > 0 && (
                      <span className="font-sans text-[10px] uppercase tracking-[0.16em] text-maroon/50">
                        First is the cover
                      </span>
                    )}
                  </div>

                  {gallery.length > 0 ? (
                    <div className="mt-2 grid grid-cols-3 gap-2.5">
                      {gallery.map((it, i) => (
                        <div
                          key={it.key}
                          className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-maroon/15 bg-[#FBF3E8]"
                        >
                          <img
                            src={it.preview}
                            alt=""
                            className="h-full w-full object-cover object-top"
                          />
                          {i === 0 && (
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-maroon px-2 py-0.5 font-sans text-[9px] uppercase tracking-[0.14em] text-ivory">
                              Cover
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeGalleryItem(it.key)}
                            aria-label={`Remove photo ${i + 1}`}
                            className="absolute right-1.5 top-1.5 rounded-full bg-maroon-ink/70 p-1 text-ivory transition-colors hover:bg-maroon"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => setGalleryCover(it.key)}
                              className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-ivory/90 py-1 font-sans text-[9px] uppercase tracking-[0.14em] text-maroon opacity-0 transition-opacity hover:bg-ivory focus:opacity-100 group-hover:opacity-100"
                            >
                              Set cover
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-center rounded-xl border border-dashed border-maroon/25 bg-[#FBF3E8] py-8">
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-6 w-6 text-maroon/30" strokeWidth={1.5} />
                        <p className="mt-2 font-sans text-[11px] text-maroon-ink/50">
                          No photos yet — upload or paste a link.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleUrlAdd();
                          }
                        }}
                        placeholder="Image URL (https://...)"
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={handleUrlAdd}
                        disabled={uploading || galleryFull}
                        className="shrink-0 rounded-xl border border-maroon/25 px-4 font-sans text-[11px] uppercase tracking-[0.16em] text-maroon-ink transition-colors hover:bg-maroon/5 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading || !!activeCrop || galleryFull}
                      className="w-full rounded-full border border-maroon/25 px-4 py-2 font-sans text-[11px] uppercase tracking-[0.18em] text-maroon-ink transition-colors hover:bg-maroon/5 disabled:opacity-50"
                    >
                      {galleryFull
                        ? `Maximum ${MAX_PRODUCT_IMAGES} photos`
                        : `Upload Images (${gallery.length}/${MAX_PRODUCT_IMAGES})`}
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    {cropQueue.length > 0 && (
                      <p className="font-sans text-[11px] leading-5 text-maroon">
                        {cropQueue.length} more photo(s) waiting to be arranged…
                      </p>
                    )}
                    {cropError && (
                      <p className="font-sans text-[11px] leading-5 text-maroon">{cropError}</p>
                    )}
                  </div>
                </div>

                {/* Explore Collections Card */}
                {editingSlot == null ? (
                  editingId ? (
                    <div className="rounded-xl border border-dashed border-maroon/25 bg-ivory/50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-maroon/60">
                          Explore Collections
                        </span>
                        <button
                          type="button"
                          onClick={addCardToFreeSlot}
                          className="rounded-full bg-maroon px-4 py-1.5 font-sans text-[10px] uppercase tracking-[0.16em] text-ivory transition-colors hover:bg-maroon-deep"
                        >
                          Add Card
                        </button>
                      </div>
                      <p className="mt-2 font-sans text-[13px] text-maroon-ink">
                        Show this piece on a home card.
                      </p>
                    </div>
                  ) : (
                    <ExploreSlotPicker
                      slot={editingSlot}
                      collapsed={cardCollapsed}
                      onToggleCollapse={() => setCardCollapsed((v) => !v)}
                      onChange={setEditingSlot}
                    />
                  )
                ) : (
                  <ExploreSlotPicker
                    slot={editingSlot}
                    collapsed={cardCollapsed}
                    onToggleCollapse={() => setCardCollapsed((v) => !v)}
                    onChange={setEditingSlot}
                  />
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 border-t border-maroon/10 pt-5">
              <button
                type="button"
                onClick={save}
                disabled={uploading || !!activeCrop || cropQueue.length > 0}
                className="rounded-full bg-maroon px-7 py-3 font-sans text-[12px] uppercase tracking-[0.22em] text-ivory transition-colors hover:bg-maroon-deep disabled:opacity-50"
              >
                {uploading
                  ? "Saving…"
                  : activeCrop || cropQueue.length > 0
                    ? "Finish arranging photos…"
                    : editingId
                      ? "Save Changes"
                      : "Add Product"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full border border-maroon/25 px-7 py-3 font-sans text-[12px] uppercase tracking-[0.22em] text-maroon-ink transition-colors hover:bg-maroon/5"
              >
                Cancel
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}

      {editing && activeCrop && (
        <ImageCropModal
          src={activeCrop.src}
          fileName={activeCrop.fileName}
          aspect={3 / 4}
          queueLabel={
            cropQueue.length > 0
              ? `${cropQueue.length} more after this`
              : undefined
          }
          onCancel={handleCropCancel}
          onApply={handleCropApply}
        />
      )}

      {confirmDelete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-maroon-ink/50 px-6 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: easeEditorial }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-maroon/15 bg-ivory p-7 text-center shadow-[0_30px_70px_rgba(31,5,9,0.35)]"
          >
            <h3 className="font-display text-2xl text-maroon-ink">Remove this piece?</h3>
            <p className="mt-3 font-sans text-sm leading-relaxed text-maroon-ink/65">
              <span className="text-maroon">{confirmDelete.name}</span> will disappear from the
              storefront and cart. This cannot be undone.
            </p>
            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-full border border-maroon/25 px-5 py-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-maroon-ink transition-colors hover:bg-maroon/5"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = confirmDelete.id;
                  setConfirmDelete(null);
                  deleteProduct(id)
                    .then(() => flash("Product removed."))
                    .catch((e) =>
                      reportError(e, "Couldn't reach the backend.")
                    );
                }}
                className="flex-1 rounded-full bg-maroon px-5 py-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-ivory transition-colors hover:bg-maroon-ink"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </main>
  );
}

function ExploreSlotPicker({
  slot,
  collapsed,
  onToggleCollapse,
  onChange,
}: {
  slot: ExploreSlot;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onChange: (s: ExploreSlot) => void;
}) {
  const slots: (ExploreSlotNumber | null)[] = [null, 1, 2, 3, 4];
  return (
    <div className="rounded-xl border border-maroon/10 bg-[#FBF7F0] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-maroon/60">
          Explore Collections Card
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-maroon/60 transition-colors hover:text-maroon"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (
        <>
          <p className="mt-2 font-sans text-[12px] leading-6 text-maroon-ink/60">
            Choose which of the four home cards this piece headlines — the card always shows the
            product&apos;s own name, photo and description. Leave it on Auto and cards pick
            themselves from Best Sellers, New Arrivals, budget finds (under ₹3000) and premium
            picks (above ₹4500).
          </p>
          <p className="mt-4 font-sans text-[10px] uppercase tracking-[0.22em] text-maroon/60">
            Card Slot
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.map((s) => {
              const active = slot === s;
              const label = s == null ? "Auto" : String(s);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onChange(s)}
                  className={
                    active
                      ? "rounded-full bg-maroon px-4 py-1.5 font-sans text-[11px] uppercase tracking-[0.16em] text-ivory"
                      : "rounded-full border border-maroon/25 px-4 py-1.5 font-sans text-[11px] uppercase tracking-[0.16em] text-maroon-ink transition-colors hover:bg-maroon/5"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-maroon/20 bg-ivory/60 px-4 py-2.5 font-sans text-sm text-maroon-ink outline-none transition-colors placeholder:text-maroon-ink/35 focus:border-maroon/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-maroon/60">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2.5">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-maroon" : "bg-maroon/20"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-ivory shadow transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <span className="font-sans text-sm text-maroon-ink/80">{label}</span>
    </button>
  );
}
