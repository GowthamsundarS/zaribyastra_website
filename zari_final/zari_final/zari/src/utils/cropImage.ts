/**
 * Frontend-only image validation + canvas cropping helpers.
 *
 * Cropping happens entirely in the browser. Cropped images are stored
 * locally as data-URLs — nothing is uploaded to a server.
 */

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Local browser-store limit mirrors the old 8MB server cap — checked before cropping. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateImageFile(file: File): { ok: true } | { ok: false; error: string } {
  // Some phones/cameras save files like "20261003-0939-26.6863603" with no
  // extension, so the browser reports an empty MIME type. Don't reject those
  // outright — let the crop step try to decode them.
  if (!file.type) {
    const hasImageExt = /\.(jpe?g|png|webp|gif|bmp|avif|hei[cf])$/i.test(file.name || "");
    if (!hasImageExt) {
      // No type and no image extension: allow it through so loadImage() gives
      // the real verdict ("Could not read that image") instead of a
      // misleading type error here.
    }
  } else if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Please choose an image file (JPG, PNG or WebP)." };
  }
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    // Still allow other image/* (e.g. heic-converted, gif) — the crop step
    // re-encodes to JPEG, so the backend still receives image/jpeg.
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "That file type is not supported. Use JPG, PNG or WebP." };
    }
  }
  if (file.size <= 0) {
    return { ok: false, error: "That file looks empty. Try a different image." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — please use one under 8MB.`,
    };
  }
  return { ok: true };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Needed so canvas isn't tainted when re-cropping remote (CORS-enabled) URLs.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image. Try a different file."));
    img.src = src;
  });
}

export interface CroppedResult {
  file: File;
  previewUrl: string;
}

function baseName(name: string): string {
  const clean = (name || "product").split(/[\\/]/).pop() || "product";
  return clean.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "product";
}

/**
 * Render the pixel crop to a canvas and return a new cropped File + object URL.
 * Output is JPEG (quality 0.92) capped at 1200x1600 so uploads stay fast
 * without visible quality loss. The returned File is what gets uploaded.
 */
export async function getCroppedImage(
  src: string,
  pixelCrop: Area,
  opts?: { fileName?: string; mimeType?: string; quality?: number; maxWidth?: number }
): Promise<CroppedResult> {
  const img = await loadImage(src);
  const quality = opts?.quality ?? 0.92;
  const mimeType = opts?.mimeType ?? "image/jpeg";
  const maxW = opts?.maxWidth ?? 1200;

  const sx = Math.max(0, Math.round(pixelCrop.x));
  const sy = Math.max(0, Math.round(pixelCrop.y));
  const sw = Math.min(img.naturalWidth - sx, Math.round(pixelCrop.width));
  const sh = Math.min(img.naturalHeight - sy, Math.round(pixelCrop.height));
  if (sw <= 0 || sh <= 0) throw new Error("Invalid crop area. Try zooming out and again.");

  // Cap output dimensions (preserve aspect) so very large photos don't
  // produce multi-MB uploads or blow up mobile memory.
  const scale = Math.min(1, maxW / sw);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cropping is not supported in this browser.");

  // JPEG has no alpha — paint white first so PNG transparency doesn't go black.
  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dw, dh);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not generate the cropped image."))),
      mimeType,
      quality
    )
  );
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const file = new File([blob], `${baseName(opts?.fileName || "product")}-cropped.${ext}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
  return { file, previewUrl: URL.createObjectURL(file) };
}

/** Small data-URL preview for the live "what will be uploaded" thumbnail. */
export async function getCroppedPreview(src: string, pixelCrop: Area): Promise<string> {
  const img = await loadImage(src);
  const sw = Math.max(1, Math.round(pixelCrop.width));
  const sh = Math.max(1, Math.round(pixelCrop.height));
  const pw = 180;
  const ph = Math.max(1, Math.round((pw * sh) / sw));
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pw, ph);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  try {
    ctx.drawImage(
      img,
      Math.max(0, Math.round(pixelCrop.x)),
      Math.max(0, Math.round(pixelCrop.y)),
      sw,
      sh,
      0,
      0,
      pw,
      ph
    );
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return src;
  }
}
