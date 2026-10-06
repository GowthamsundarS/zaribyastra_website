/**
 * Cloudinary responsive-delivery helper — infrastructure only, no visual change.
 *
 * The backend already returns optimized delivery URLs
 * (`f_auto,q_auto,c_limit,w_xxx`). This helper lets <img> tags additionally
 * offer the browser a width-based choice so phones download ~400-600px
 * variants and desktops ~800-1200px, via standard srcSet/sizes. Styling,
 * layout, props and behaviour of every component stay exactly the same.
 *
 * Safe for legacy content: local /public assets, data-URIs, non-Cloudinary
 * URLs and missing URLs pass through unchanged (or fall back to "").
 */

const UPLOAD_MARKER = "/image/upload/";

/**
 * Responsive ladder for the one local asset the storefront legitimately
 * renders: the brand intro image (hero-adjacent section, card fallback and
 * social preview). Variants are the same pixels at smaller widths, so
 * visuals are identical while phones download right-sized files.
 *
 * Components keep passing their own layout-accurate `sizes`; this map only
 * supplies the width-tagged choices, exactly like the Cloudinary ladder.
 * Unknown local files still pass through untouched.
 *
 * NOTE: ladders for the removed design-phase seed images used to live here.
 * They were deleted together with the seed data — no component may reference
 * those old local files anymore, so there is nothing to build a ladder for.
 */
interface LocalLadder {
  /** width -> file, ascending */
  variants: Array<{ width: number; file: string }>;
  /** sensible fallback `src` (mid-ladder, never the largest file) */
  defaultSrc: string;
  srcSet: string;
}

function ladder(
  variants: Array<{ width: number; file: string }>,
  defaultWidth: number
): LocalLadder {
  const sorted = [...variants].sort((a, b) => a.width - b.width);
  const fallback =
    sorted.find((v) => v.width >= defaultWidth) ?? sorted[sorted.length - 1];
  return {
    variants: sorted,
    defaultSrc: fallback.file,
    srcSet: sorted.map((v) => `${v.file} ${v.width}w`).join(", "),
  };
}

const LOCAL_SRCSETS: Record<string, LocalLadder> = {
  "/abaya-intro.webp": ladder(
    [
      { width: 320, file: "/abaya-intro-320.webp" },
      { width: 480, file: "/abaya-intro-480.webp" },
      { width: 640, file: "/abaya-intro-640.webp" },
      { width: 800, file: "/abaya-intro-800.webp" },
      { width: 941, file: "/abaya-intro.webp" },
    ],
    640
  ),
};

function looksLikeTransform(segment: string): boolean {
  if (!segment) return false;
  if (/^v\d+$/.test(segment)) return false;
  const parts = segment.split(",");
  if (!parts.length) return false;
  return parts.every((p) => /^[a-zA-Z]+_[^/]*$/.test(p) || /^[a-z]+$/.test(p));
}

/** Rewrite a Cloudinary delivery URL to `f_auto,q_auto,c_limit,w_{width}`. */
export function optimizedCloudinaryUrl(
  url: string | null | undefined,
  width = 800
): string {
  if (!url || typeof url !== "string") return "";
  const clean = url.trim();
  if (!clean) return "";
  if (clean.startsWith("data:") || clean.startsWith("blob:")) return clean;
  if (clean.startsWith("/")) return clean; // local /public asset
  if (!clean.includes("res.cloudinary.com")) return clean;
  if (!clean.includes(UPLOAD_MARKER)) return clean;

  const w = Math.max(50, Math.min(Math.round(width) || 800, 2000));
  const transform = `f_auto,q_auto,c_limit,w_${w}`;
  const [head, tailWithExtra] = clean.split(UPLOAD_MARKER);
  // Preserve any query string / fragment.
  let tail = tailWithExtra;
  let suffix = "";
  const q = tail.indexOf("?");
  const h = tail.indexOf("#");
  const cut = q === -1 ? h : h === -1 ? q : Math.min(q, h);
  if (cut !== -1) {
    suffix = tail.slice(cut);
    tail = tail.slice(0, cut);
  }
  const segments = tail.split("/");
  const rest = [...segments];
  while (rest.length && looksLikeTransform(rest[0])) rest.shift();
  return `${head}${UPLOAD_MARKER}${transform}/${rest.join("/")}${suffix}`;
}

/** Build a width-based srcSet from any (possibly legacy) image URL. */
export function cloudinarySrcSet(
  url: string | null | undefined,
  widths: number[] = [400, 600, 800, 1200]
): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const clean = url.trim();
  // The one legitimate local asset gets its fixed local ladder (same
  // pixels, right-sized files) — the caller's `sizes` still governs the
  // pick.
  const local = LOCAL_SRCSETS[clean];
  if (local) return local.srcSet;
  if (!clean.includes("res.cloudinary.com")) return undefined;
  const unique = [...new Set(widths)].sort((a, b) => a - b);
  return unique
    .map((w) => `${optimizedCloudinaryUrl(clean, w)} ${w}w`)
    .join(", ");
}

/** Primary src for an <img>: optimized default width, legacy-safe. */
export function cloudinarySrc(
  url: string | null | undefined,
  width = 800
): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  const clean = url.trim();
  // Legitimate local asset: serve the smallest variant that covers the
  // requested width instead of the full-size original.
  const local = LOCAL_SRCSETS[clean];
  if (local) {
    const w = Math.round(width) || 800;
    return (
      local.variants.find((v) => v.width >= w)?.file ??
      local.variants[local.variants.length - 1].file
    );
  }
  if (!clean.includes("res.cloudinary.com")) return url;
  return optimizedCloudinaryUrl(clean, width);
}
