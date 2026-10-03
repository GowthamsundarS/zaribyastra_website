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

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      duration: 1.2,
      easing: lenisEasing,
      smoothWheel: true,
      touchMultiplier: 2,
      wheelMultiplier: 1,
      lerp: 0.1,
      syncTouch: true,
      syncTouchLerp: 0.075,
      infinite: false,
    });
    lenisInstance = lenis;
    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      if (lenisInstance === lenis) lenisInstance = null;
    };
  }, []);
  return <>{children}</>;
}
