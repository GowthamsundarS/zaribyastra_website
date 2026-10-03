import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { Check, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { getCroppedImage, type Area } from "../utils/cropImage";

interface ImageCropModalProps {
  /** Object URL / data URL of the original selected image. Never uploaded. */
  src: string;
  fileName?: string;
  /** Locked aspect — product cards render aspect-[3/4]. */
  aspect?: number;
  /** e.g. "Photo 1 of 3" when several files were selected. */
  queueLabel?: string;
  onCancel: () => void;
  /** Receives the NEW cropped File (this is what gets uploaded). */
  onApply: (file: File, previewUrl: string) => void;
}

const PRODUCT_ASPECT = 3 / 4;

/**
 * WhatsApp-profile-style arrange step.
 * Full-screen dark editor: the photo moves under a fixed, locked 3:4 frame.
 * The frame itself is the live preview — what you see in it is exactly the
 * pixels written into the new cropped File on Done.
 */
export function ImageCropModal({
  src,
  fileName = "product",
  aspect = PRODUCT_ASPECT,
  queueLabel,
  onCancel,
  onApply,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pixelsRef = useRef<Area | null>(null);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    pixelsRef.current = pixels;
  }, []);

  const reset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError(null);
  }, []);

  const apply = useCallback(async () => {
    if (!pixelsRef.current || applying) return;
    setApplying(true);
    setError(null);
    try {
      // Real crop: brand-new File generated on a canvas — not a CSS preview.
      const { file, previewUrl } = await getCroppedImage(src, pixelsRef.current, {
        fileName,
      });
      onApply(file, previewUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not crop this image.");
      setApplying(false);
    }
  }, [src, fileName, applying, onApply]);

  // Lock background scroll + Escape to cancel.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  // Collection cards render 4:3, product cards render 3:4 — the badge tells
  // the admin which frame they are fitting the photo into.
  const aspectLabel =
    Math.abs(aspect - 4 / 3) < 0.01 ? "4:3 locked" : "3:4 locked";

  return (
    <div
      className="fixed inset-0 z-[80] flex h-[100dvh] flex-col bg-black/[0.97] text-ivory"
      role="dialog"
      aria-modal="true"
      aria-label="Arrange product photo"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 pt-4 sm:px-6">
        <div className="min-w-0">
          <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-ivory/60">
            Arrange photo{queueLabel ? ` · ${queueLabel}` : ""}
          </p>
          <h2 className="mt-1 truncate font-display text-2xl text-ivory">
            Fit it in the frame
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-white/25 px-3 py-1.5 font-sans text-[10px] uppercase tracking-[0.2em] text-ivory/80">
          {aspectLabel}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel cropping"
          disabled={applying}
          className="shrink-0 rounded-full p-2 text-ivory/70 transition-colors hover:bg-white/10 hover:text-ivory disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="px-4 pt-1 font-sans text-xs text-ivory/55 sm:px-6">
        Drag the photo to arrange · pinch or use the slider to zoom. The frame
        shows exactly what will be uploaded.
      </p>

      {/* Crop surface — fills all free space, no horizontal scroll on mobile */}
      <div className="relative min-h-0 flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          minZoom={1}
          maxZoom={4}
          zoomSpeed={0.9}
          showGrid={false}
          cropShape="rect"
          objectFit="contain"
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: {
              backgroundColor: "#000",
              touchAction: "none",
            },
            cropAreaStyle: {
              border: "2px solid #fff",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.78)",
              borderRadius: 12,
            },
          }}
        />
      </div>

      {/* Bottom control bar */}
      <div className="border-t border-white/10 bg-black px-4 pb-5 pt-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
            disabled={applying}
            className="rounded-full border border-white/25 p-2.5 text-ivory transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom photo"
            disabled={applying}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
          />
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}
            disabled={applying}
            className="rounded-full border border-white/25 p-2.5 text-ivory transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={applying}
            aria-label="Reset arrangement"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2.5 font-sans text-[11px] uppercase tracking-[0.16em] text-ivory transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        {error && (
          <p className="mx-auto mt-2 w-full max-w-2xl font-sans text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mx-auto mt-3 flex w-full max-w-2xl gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="flex-1 rounded-full border border-white/25 px-6 py-3 font-sans text-[12px] uppercase tracking-[0.2em] text-ivory transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={applying}
            className="inline-flex flex-[2] items-center justify-center gap-2 rounded-full bg-maroon px-6 py-3 font-sans text-[12px] uppercase tracking-[0.2em] text-ivory transition-colors hover:bg-maroon-deep disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {applying ? "Cropping…" : "Done — use this photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
