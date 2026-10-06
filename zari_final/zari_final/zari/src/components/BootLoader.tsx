import { useEffect, useState } from "react";
import { ZariMark } from "./ZariMark";
import { getSharedLenis } from "./SmoothScroll";

/** Safety timeout — look & timing knobs live here. */
export const BOOT_TIMEOUT_MS = 7000;
/** Fade-out duration (keep in sync with `duration-500` below). */
const FADE_MS = 500;
const SEEN_KEY = "zari.boot.seen";

function wasSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode — show the loader again next time, harmless */
  }
}

/**
 * First-load veil: covers the first paint on fresh devices/empty caches so
 * webfonts swapping in, late images and async catalog cards can't cause
 * layout jumps or half-animated heroes. Plain overlay only — page content
 * stays in the HTML, so SEO is unaffected.
 */
export function BootLoader() {
  const [show, setShow] = useState(() => !wasSeen());
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!show) return;

    // Lock scrolling while the veil is up; restore exact values after.
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    let finished = false;
    let completed = 0;
    let total = 0;
    const update = () => setProgress(total ? completed / total : 0);
    const check = () => {
      if (!finished && total > 0 && completed >= total) finish();
    };
    const track = (p: Promise<unknown>) => {
      total += 1;
      update();
      const step = () => {
        completed += 1;
        update();
        check();
      };
      void p.then(step, step);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      markSeen();
      // Recalculate layout BEFORE the fade so sticky stacks and scroll
      // animations measure final heights (Lenis self-observes resizes, but
      // an explicit pass + event covers every listener deterministically).
      try {
        const lenis = getSharedLenis() as unknown as {
          resize?: () => void;
        } | null;
        if (lenis && typeof lenis.resize === "function") lenis.resize();
      } catch {
        /* no smoother active (e.g. mobile) — resize event below suffices */
      }
      window.dispatchEvent(new Event("resize"));
      setFading(true);
      window.setTimeout(() => {
        html.style.overflow = prevHtml;
        body.style.overflow = prevBody;
        setShow(false);
      }, FADE_MS);
    };

    // Never trap the user behind the veil.
    const timer = window.setTimeout(finish, BOOT_TIMEOUT_MS);

    // 1. Webfonts (the wordmark/hero text shifts when these swap in).
    try {
      track(
        document.fonts
          ? document.fonts.ready.then(() => undefined)
          : Promise.resolve()
      );
    } catch {
      track(Promise.resolve());
    }

    // 2. Window load + a second image sweep (catalog cards often mount
    // between first paint and load).
    const snapImages = () => {
      const vh = window.innerHeight || 800;
      for (const img of Array.from(document.images)) {
        const r = img.getBoundingClientRect();
        const nearViewport = r.top < vh * 1.5 && r.bottom > -200;
        // Far-below-fold lazy images are skipped: decoding them here would
        // force downloads the page deliberately deferred.
        if (img.loading === "lazy" && !nearViewport) continue;
        if (img.complete && img.naturalWidth > 0) {
          track(Promise.resolve());
        } else {
          try {
            track(img.decode().then(
              () => undefined,
              () => undefined
            ));
          } catch {
            track(Promise.resolve());
          }
        }
      }
    };
    if (document.readyState === "complete") {
      track(Promise.resolve());
      snapImages();
    } else {
      track(
        new Promise<void>((resolve) => {
          window.addEventListener("load", () => resolve(), { once: true });
        }).then(() => {
          snapImages();
        })
      );
      snapImages();
    }

    return () => {
      window.clearTimeout(timer);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
    // Runs once per mount; App never remounts during SPA navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading the ZARI boutique"
      className={
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 bg-ivory transition-opacity duration-500 " +
        (fading ? "pointer-events-none opacity-0" : "opacity-100")
      }
    >
      {/* animate-none under prefers-reduced-motion */}
      <ZariMark className="h-20 w-auto animate-pulse text-maroon motion-reduce:animate-none sm:h-24" />
      <p
        className="font-display text-2xl tracking-[0.5em] text-maroon"
        style={{ paddingLeft: "0.5em" }}
      >
        ZARI
      </p>
      <div
        className="h-px w-40 overflow-hidden bg-maroon/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label="Loading progress"
      >
        <div
          className="h-full bg-maroon transition-[width] duration-300 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
