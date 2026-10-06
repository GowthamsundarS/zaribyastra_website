import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  animate,
  useMotionValue,
  useTransform,
  MotionValue,
} from "framer-motion";
import { ZariMark } from "./ZariMark";

// Auto-playing brand intro — the same choreography as before, but driven
// by time (like a video) instead of scroll. Fractions below are fractions
// of the total intro duration.
export const HERO_INTRO_DURATION = 2; // seconds
export const HERO_INTRO_DELAY = 0.2; // seconds

// Perf: skip the 2s intro (show final wordmark instantly) when animation
// buys nothing — reduced-motion, data-saver, or slow networks (2G/3G).
// Desktop + fast-mobile visuals are unchanged; LCP/SI on slow mobile stop
// paying ~2s for choreography.
export function shouldSkipIntro(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return true;
  const conn = (navigator as unknown as { connection?: {
    saveData?: boolean;
    effectiveType?: string;
  } }).connection;
  if (conn?.saveData) return true;
  if (
    conn?.effectiveType &&
    ["slow-2g", "2g", "3g"].includes(conn.effectiveType)
  )
    return true;
  return false;
}
const INTRO_DURATION = HERO_INTRO_DURATION;
const HOLD_END = 0.16; // logo alone, breathing
const ZOOM_END = 0.3; // zoom/focus into the logo
const SETTLE_END = 0.58; // logo shrinks into place as the "A" of ZARI
const LETTER_START = 0.56;
const LETTER_STEP = 0.085;
const LETTER_SPAN = 0.11;

function useLetterReveal(p: MotionValue<number>, index: number, from: number) {
  const t0 = LETTER_START + index * LETTER_STEP;
  const span = LETTER_SPAN;
  return {
    opacity: useTransform(p, [t0, t0 + span], [0, 1], { clamp: true }),
    x: useTransform(p, [t0, t0 + span], [from * 36, 0]),
    scale: useTransform(p, [t0, t0 + span], [0.82, 1]),
  };
}

function Letter({
  p,
  char,
  index,
  from,
}: {
  p: MotionValue<number>;
  char: string;
  index: number;
  from: number;
}) {
  const r = useLetterReveal(p, index, from);
  return (
    <motion.span
      style={{ opacity: r.opacity, x: r.x, scale: r.scale }}
      className="inline-block"
      aria-hidden="true"
    >
      {char}
    </motion.span>
  );
}

export function Hero() {
  const rowRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);
  const [geom, setGeom] = useState({ dx: 0, dy: 0, sMax: 1 });

  // Time-driven progress 0 → 1 over INTRO_DURATION, replacing the old
  // scroll-driven progress. All choreography below keys off this value.
  const p = useMotionValue(0);

  useEffect(() => {
    if (shouldSkipIntro()) {
      p.set(1);
      return;
    }
    const controls = animate(p, 1, {
      duration: INTRO_DURATION,
      ease: "linear",
      delay: HERO_INTRO_DELAY,
    });
    return () => controls.stop();
  }, [p]);

  // Layout: measured in useLayoutEffect (before first paint) so the opening
  // frame already has the correct scale/centre — no wordmark jump, no CLS.
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      const logo = logoRef.current;
      if (!row || !logo) return;
      // read sub-pixel layout rects with the transform momentarily dropped —
      // integer offsetWidth/offsetLeft rounding gets multiplied by sMax and
      // would leave the logo visibly off-centre at full zoom
      const prevTransform = row.style.transform;
      row.style.transform = "none";
      const rowRect = row.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      row.style.transform = prevTransform;
      const logoW = logoRect.width;
      // centre-to-centre deltas between logo and row, unscaled
      const dx =
        logoRect.left + logoRect.width / 2 - (rowRect.left + rowRect.width / 2);
      // the text line box is taller than the logo, so vertical centring
      // needs its own correction
      const dy =
        logoRect.top + logoRect.height / 2 - (rowRect.top + rowRect.height / 2);
      // scale that makes the logo ~52vw on wide screens, ~62vw on small,
      // capped so its height stays inside the viewport
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const targetW = vw < 640 ? vw * 0.62 : vw < 1024 ? vw * 0.5 : vw * 0.42;
      const targetH = vh * 0.58;
      const naturalRatio = logoW ? 677 / 644 : 1; // logo png aspect
      const sMax = Math.min(targetW / logoW, targetH / (logoW / naturalRatio));
      setGeom({ dx, dy, sMax });
    };
    measure();
    window.addEventListener("resize", measure);
    const t = window.setTimeout(measure, 350); // after fonts settle
    document.fonts.ready.then(measure);
    // the row's layout width shifts when webfonts swap in; an error in dx
    // is multiplied by sMax at full zoom, so re-measure on any resize
    const ro = new ResizeObserver(measure);
    if (rowRef.current) ro.observe(rowRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  const { dx, dy, sMax } = geom;

  // scale: hold big with a slow breath-in, then settle to 1
  const scale = useTransform(
    p,
    [0, HOLD_END, ZOOM_END, SETTLE_END, 1],
    [sMax, sMax, sMax * 1.12, 1, 1]
  );
  // While zoomed in, the logo stays optically centred and the other
  // letters of ZARI are added around it (framer composes
  // translate-then-scale, so the correction must scale with s too).
  // As the logo settles back to scale 1, the correction eases out to 0
  // so the finished wordmark — not just the logo — sits dead centre.
  const centerWeight = (s: number) =>
    sMax > 1 ? Math.min(1, Math.max(0, (s - 1) / (sMax - 1))) : 0;
  const x = useTransform(scale, (s) => -dx * s * centerWeight(s));
  const y = useTransform(scale, (s) => -dy * s * centerWeight(s));

  const eyebrowOpacity = useTransform(p, [0, HOLD_END * 0.6, HOLD_END], [1, 1, 0]);
  const eyebrowY = useTransform(p, [HOLD_END * 0.5, HOLD_END], [0, -18]);
  // tagline lands only after the last letter has settled (~0.9)
  const taglineOpacity = useTransform(p, [0.9, 0.97, 1], [0, 1, 0.9]);
  const taglineY = useTransform(p, [0.9, 0.97], [16, 0]);
  const hairlineScale = useTransform(p, [0.9, 0.98], [0, 1]);

  return (
    <section className="relative flex h-screen items-center justify-center overflow-hidden bg-ivory">
      {/* soft fabric texture + lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 8%, rgba(255,252,246,0.9) 0%, rgba(247,242,234,0) 55%)," +
            "radial-gradient(90% 70% at 50% 110%, rgba(107,15,26,0.05) 0%, rgba(247,242,234,0) 60%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />

      {/* screen-reader accessible brand */}
      <h1 className="sr-only">ZARI — Modest luxury</h1>

      <motion.p
        style={{ opacity: eyebrowOpacity, y: eyebrowY }}
        className="absolute top-[16vh] font-sans text-[10px] uppercase tracking-[0.55em] text-maroon-ink/60 sm:text-xs"
      >
        The House of
      </motion.p>

      {/* wordmark row: the A-shaped logo becomes the "A" of ZARI */}
      <motion.div
        ref={rowRef}
        style={{ scale, x, y, fontSize: "clamp(2.75rem, 18vmin, 10.5rem)" }}
        className="relative flex items-baseline gap-[0.05em] font-display leading-none text-maroon"
      >
        <Letter p={p} char="Z" index={0} from={-1} />
        <span
          ref={logoRef}
          className="inline-flex h-[11.5vmin] select-none text-maroon"
        >
          <ZariMark className="h-full w-auto" />
        </span>
        <Letter p={p} char="R" index={1} from={1} />
        <Letter p={p} char="I" index={2} from={1} />
      </motion.div>

      {/* hairline + tagline after the reveal */}
      <motion.div
        style={{ opacity: taglineOpacity, y: taglineY }}
        className="absolute bottom-[15vh] flex flex-col items-center gap-5"
      >
        <motion.span
          style={{ scaleX: hairlineScale }}
          className="block h-px w-24 bg-maroon/40 sm:w-32"
        />
        <p className="font-display text-lg italic text-maroon-ink/70 sm:text-xl">
          Modest luxury, redefined
        </p>
      </motion.div>
    </section>
  );
}
