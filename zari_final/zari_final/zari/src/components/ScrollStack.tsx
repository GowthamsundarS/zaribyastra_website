import { useLayoutEffect, useRef, useCallback } from "react";
import Lenis from "lenis";
import { getSharedLenis, lenisEasing } from "./SmoothScroll";
import "./ScrollStack.css";

export const ScrollStackItem = ({
  children,
  itemClassName = "",
}: {
  children?: React.ReactNode;
  itemClassName?: string;
}) => (
  <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>
);

export type ScrollStackProps = {
  children: React.ReactNode;
  className?: string;
  itemDistance?: number;
  itemScale?: number;
  itemStackDistance?: number;
  stackPosition?: string;
  scaleEndPosition?: string;
  baseScale?: number;
  scaleDuration?: number;
  rotationAmount?: number;
  blurAmount?: number;
  useWindowScroll?: boolean;
  onStackComplete?: () => void;
  /**
   * Changes when the card list changes (e.g. products arriving from the
   * backend after mount). Included in the setup effect deps so offsets are
   * re-measured for the new cards instead of keeping stale/empty refs —
   * without this the stack silently breaks whenever data loads async.
   */
  itemsKey?: string;
};

const ScrollStack = ({
  children,
  className = "",
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = "20%",
  scaleEndPosition = "10%",
  baseScale = 0.85,
  rotationAmount = 0,
  blurAmount = 0,
  useWindowScroll = false,
  onStackComplete,
  itemsKey = "",
}: ScrollStackProps) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stackCompletedRef = useRef(false);
  const cardsRef = useRef<HTMLElement[]>([]);
  // Cached document/scroller offsets — measured once (and on
  // resize/content load), NOT on every scroll frame. Reading
  // getBoundingClientRect per card per frame forces layout thrash
  // and is the main source of stack jitter.
  const cardTopsRef = useRef<number[]>([]);
  const endTopRef = useRef(0);
  const lastTransformsRef = useRef(new Map<number, Record<string, number>>());
  const tickingRef = useRef(false);
  const onStackCompleteRef = useRef(onStackComplete);
  onStackCompleteRef.current = onStackComplete;

  const calculateProgress = useCallback(
    (scrollTop: number, start: number, end: number) => {
      if (scrollTop < start) return 0;
      if (scrollTop > end) return 1;
      return (scrollTop - start) / (end - start);
    },
    []
  );

  const parsePercentage = useCallback(
    (value: string | number, containerHeight: number) => {
      if (typeof value === "string" && value.includes("%")) {
        return (parseFloat(value) / 100) * containerHeight;
      }
      return parseFloat(value as string);
    },
    []
  );

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return {
        scrollTop: window.scrollY,
        containerHeight: window.innerHeight,
      };
    }
    const scroller = scrollerRef.current;
    return {
      scrollTop: scroller ? scroller.scrollTop : 0,
      containerHeight: scroller ? scroller.clientHeight : 0,
    };
  }, [useWindowScroll]);

  // Measure cached offsets. Called on mount + resize + content load,
  // never inside the scroll hot path.
  const measureOffsets = useCallback(() => {
    const cards = cardsRef.current;
    if (!cards.length) return;
    if (useWindowScroll) {
      const y = window.scrollY;
      cardTopsRef.current = cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return rect.top + y;
      });
      const endElement =
        document.querySelector<HTMLElement>(".scroll-stack-end");
      endTopRef.current = endElement
        ? endElement.getBoundingClientRect().top + y
        : 0;
    } else {
      cardTopsRef.current = cards.map((card) => card.offsetTop);
      const endElement =
        scrollerRef.current?.querySelector<HTMLElement>(".scroll-stack-end");
      endTopRef.current = endElement ? endElement.offsetTop : 0;
    }
  }, [useWindowScroll]);

  const updateCardTransforms = useCallback(() => {
    const cards = cardsRef.current;
    const cardTops = cardTopsRef.current;
    if (!cards.length || !cardTops.length) return;

    const { scrollTop, containerHeight } = getScrollData();
    if (!containerHeight) return;
    const stackPositionPx = parsePercentage(stackPosition, containerHeight);
    const scaleEndPositionPx = parsePercentage(
      scaleEndPosition,
      containerHeight
    );
    const endElementTop = endTopRef.current;

    // Resolve the current top card once from cached tops (O(n)),
    // instead of re-reading layout inside the per-card loop (O(n^2)).
    let topCardIndex = 0;
    if (blurAmount) {
      for (let j = 0; j < cardTops.length; j++) {
        if (scrollTop >= cardTops[j] - stackPositionPx - itemStackDistance * j) {
          topCardIndex = j;
        }
      }
    }

    cards.forEach((card, i) => {
      if (!card) return;

      const cardTop = cardTops[i] ?? 0;
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i;
      const pinEnd = endElementTop - containerHeight / 2;

      const scaleProgress = calculateProgress(
        scrollTop,
        triggerStart,
        triggerEnd
      );
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

      let blur = 0;
      if (blurAmount && i < topCardIndex) {
        blur = Math.max(0, (topCardIndex - i) * blurAmount);
      }

      let translateY = 0;
      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;

      if (isPinned) {
        translateY =
          scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
      }

      const newTransform = {
        translateY: Math.round(translateY),
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      };

      const lastTransform = lastTransformsRef.current.get(i);
      const hasChanged =
        !lastTransform ||
        Math.abs(lastTransform.translateY - newTransform.translateY) > 0.5 ||
        Math.abs(lastTransform.scale - newTransform.scale) > 0.001 ||
        Math.abs(lastTransform.rotation - newTransform.rotation) > 0.1 ||
        Math.abs(lastTransform.blur - newTransform.blur) > 0.1;

      if (hasChanged) {
        const transform = `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale}) rotate(${newTransform.rotation}deg)`;
        card.style.transform = transform;
        if (blurAmount) {
          const filter = newTransform.blur > 0 ? `blur(${newTransform.blur}px)` : "";
          if (card.style.filter !== filter) card.style.filter = filter;
        } else if (card.style.filter) {
          card.style.filter = "";
        }

        lastTransformsRef.current.set(i, newTransform);
      }

      if (i === cards.length - 1) {
        const isInView = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isInView && !stackCompletedRef.current) {
          stackCompletedRef.current = true;
          onStackCompleteRef.current?.();
        } else if (!isInView && stackCompletedRef.current) {
          stackCompletedRef.current = false;
        }
      }
    });
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    calculateProgress,
    parsePercentage,
    getScrollData,
  ]);

  // rAF-throttled entry point: multiple scroll sources (Lenis emit +
  // native scroll) can fire in the same frame; coalesce them so the
  // DOM is written at most once per frame.
  const scheduleUpdate = useCallback(() => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      tickingRef.current = false;
      updateCardTransforms();
    });
  }, [updateCardTransforms]);

  // Direct entry point for Lenis 'scroll' callbacks, which already run
  // inside Lenis's own rAF — no extra frame of lag.
  const handleLenisScroll = useCallback(() => {
    updateCardTransforms();
  }, [updateCardTransforms]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(
      useWindowScroll
        ? document.querySelectorAll<HTMLElement>(".scroll-stack-card")
        : scroller.querySelectorAll<HTMLElement>(".scroll-stack-card")
    );

    cardsRef.current = cards;
    const transformsCache = lastTransformsRef.current;

    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        card.style.marginBottom = `${itemDistance}px`;
      }
      card.style.willChange = "transform";
      card.style.transformOrigin = "top center";
      card.style.backfaceVisibility = "hidden";
      card.style.transform = "translateZ(0)";
      card.style.webkitTransform = "translateZ(0)";
      card.style.perspective = "1000px";
      card.style.webkitPerspective = "1000px";
    });

    measureOffsets();
    updateCardTransforms();

    const cleanups: Array<() => void> = [];

    // Offsets shift when images/fonts load or the viewport changes —
    // re-measure then, never per scroll frame.
    const handleResize = () => {
      measureOffsets();
      scheduleUpdate();
    };
    window.addEventListener("resize", handleResize);
    cleanups.push(() => window.removeEventListener("resize", handleResize));

    const handleLoad = () => {
      measureOffsets();
      scheduleUpdate();
    };
    window.addEventListener("load", handleLoad);
    cleanups.push(() => window.removeEventListener("load", handleLoad));

    if (typeof document !== "undefined" && document.fonts?.ready) {
      let cancelled = false;
      document.fonts.ready.then(() => {
        if (!cancelled) {
          measureOffsets();
          scheduleUpdate();
        }
      });
      cleanups.push(() => {
        cancelled = true;
      });
    }

    // Card images change row heights once decoded — re-measure per
    // image so later cards don't stack from stale offsets.
    const imgs = Array.from(
      scroller.querySelectorAll<HTMLImageElement>("img")
    );
    const imgListeners: Array<() => void> = [];
    imgs.forEach((img) => {
      if (img.complete) return;
      const onImg = () => {
        measureOffsets();
        scheduleUpdate();
      };
      img.addEventListener("load", onImg);
      img.addEventListener("error", onImg);
      imgListeners.push(() => {
        img.removeEventListener("load", onImg);
        img.removeEventListener("error", onImg);
      });
    });
    cleanups.push(() => imgListeners.forEach((off) => off()));

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(scroller);
      const ro = resizeObserver;
      cleanups.push(() => ro.disconnect());
    }

    if (useWindowScroll) {
      // Reuse the app's window-level Lenis (SmoothScroll) so there is
      // exactly one smoother on this axis. Its 'scroll' emit runs in
      // the same rAF as the smoothed scroll → no lag, no jitter.
      const shared = getSharedLenis();
      if (shared) {
        const unsub = shared.on("scroll", handleLenisScroll);
        cleanups.push(unsub);
      }
      // Native fallback (covers reduced-motion / no-Lenis + any scroll
      // source Lenis doesn't emit for). Coalesced via scheduleUpdate.
      const onScroll = () => scheduleUpdate();
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
      return () => {
        cleanups.forEach((fn) => fn());
        stackCompletedRef.current = false;
        cardsRef.current = [];
        cardTopsRef.current = [];
        transformsCache.clear();
      };
    }

    // Inner-scroller mode: own Lenis instance bound to the wrapper,
    // per the React Bits reference implementation.
    let raf = 0;
    const lenis = new Lenis({
      wrapper: scroller,
      content:
        scroller.querySelector<HTMLElement>(".scroll-stack-inner") ??
        undefined,
      duration: 1.2,
      easing: lenisEasing,
      smoothWheel: true,
      touchMultiplier: 2,
      infinite: false,
      wheelMultiplier: 1,
      lerp: 0.1,
      syncTouch: true,
      syncTouchLerp: 0.075,
    });

    const unsub = lenis.on("scroll", handleLenisScroll);

    const rafLoop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(rafLoop);
    };
    raf = requestAnimationFrame(rafLoop);

    updateCardTransforms();

    return () => {
      cleanups.forEach((fn) => fn());
      unsub();
      if (raf) cancelAnimationFrame(raf);
      lenis.destroy();
      stackCompletedRef.current = false;
      cardsRef.current = [];
      cardTopsRef.current = [];
      transformsCache.clear();
    };
  }, [
    itemDistance,
    useWindowScroll,
    itemsKey,
    handleLenisScroll,
    scheduleUpdate,
    measureOffsets,
    updateCardTransforms,
  ]);

  return (
    <div
      className={`scroll-stack-scroller${
        useWindowScroll ? " window-scroll" : ""
      } ${className}`.trim()}
      ref={scrollerRef}
    >
      <div className="scroll-stack-inner">
        {children}
        {/* Spacer so the last pin can release cleanly */}
        <div className="scroll-stack-end" />
      </div>
    </div>
  );
};

export default ScrollStack;
