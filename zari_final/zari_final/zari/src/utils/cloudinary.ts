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
  if (!url.includes("res.cloudinary.com")) return url;
  return optimizedCloudinaryUrl(url, width);
}
