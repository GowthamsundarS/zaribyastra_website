import React, { useEffect } from "react";
import Lenis from "lenis";

// Shared window-level Lenis singleton. ScrollStack (window-scroll mode)
// subscribes to this instance instead of creating a second one — two
// Lenis instances on the same axis fight each other and cause jitter.
let lenisInstance: Lenis | null = null;

export function getSharedLenis(): Lenis | null {
  return lenisInstance;
}

export const lenisEasing = (t: number) =>
  Math.min(1, 1.001 - Math.pow(2, -10 * t));

// Perf: Lenis is a desktop enhancement. Mobile uses native touch scroll
// (compositor-driven, zero main-thread cost) and the home stack already
// renders CSS sticky cards under 768px — a Lenis rAF loop there only burns
// battery and risks jitter. Same for data-saver / 2G.
function shouldSkipSmoothScroll(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return true;
  if (window.matchMedia("(max-width: 767px)").matches) return true;
  const conn = (navigator as unknown as { connection?: {
    saveData?: boolean;
    effectiveType?: string;
  } }).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType && ["slow-2g", "2g"].includes(conn.effectiveType))
    return true;
  return false;
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (shouldSkipSmoothScroll()) return;
    const lenis = new Lenis({
      duration: 1.2,
      easing: lenisEasing,
      smoothWheel: true,
      touchMultiplier: 2,
      wheelMultiplier: 1,
      lerp: 0.1,
      // Native touch scroll on mobile — syncTouch hijacks finger gestures
      // and blocks scrolling inside fixed modals (e.g. Add Product).
      syncTouch: false,
      infinite: false,
    });
    lenisInstance = lenis;
    let rafId = 0;
    let running = true;
    const raf = (time: number) => {
      if (!running) return;
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    // Perf: don't spin the rAF loop while the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafId);
      } else if (!running) {
        running = true;
        rafId = requestAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(rafId);
      lenis.destroy();
      if (lenisInstance === lenis) lenisInstance = null;
    };
  }, []);
  return <>{children}</>;
}
