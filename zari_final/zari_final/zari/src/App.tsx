import React, { Suspense, lazy, useLayoutEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { BagProvider } from "./contexts/BagContext";
import { CatalogProvider } from "./contexts/CatalogContext";
import { HelmetProvider } from "react-helmet-async";
import { SmoothScroll, getSharedLenis } from "./components/SmoothScroll";
import { BootLoader } from "./components/BootLoader";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";

// Route-level code-splitting: Home stays in the initial chunk for fast FCP,
// everything else loads on demand so mobile downloads less JS up front.
import { Home } from "./pages/Home";
const Collection = lazy(() =>
  import("./pages/Collection").then((m) => ({ default: m.Collection }))
);
const ProductDetail = lazy(() =>
  import("./pages/ProductDetail").then((m) => ({ default: m.ProductDetail }))
);
const Cart = lazy(() => import("./pages/Cart").then((m) => ({ default: m.Cart })));
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
const NotFound = lazy(() =>
  import("./pages/NotFound").then((m) => ({ default: m.NotFound }))
);

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    // Take manual control — Chrome otherwise restores the previous
    // page's scroll offset on SPA navigation. The Admin link lives in
    // the footer (bottom of a very tall Home page), so without this the
    // new page opens scrolled to the bottom and looks blank until reload.
    if ("scrollRestoration" in window.history) {
      try {
        window.history.scrollRestoration = "manual";
      } catch {
        /* ignore */
      }
    }
    const lenis = getSharedLenis();
    if (!hash) {
      // Lenis owns the window scroll loop — a bare window.scrollTo(0, 0)
      // gets fought/overwritten by its next raf. Drive both, and repeat
      // once next frame to win the race.
      if (lenis) {
        try {
          lenis.scrollTo(0, { immediate: true });
        } catch {
          /* ignore */
        }
      }
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      const raf = requestAnimationFrame(() => {
        if (getSharedLenis()) {
          try {
            getSharedLenis()?.scrollTo(0, { immediate: true });
          } catch {
            /* ignore */
          }
        }
        window.scrollTo(0, 0);
      });
      return () => cancelAnimationFrame(raf);
    }
    // Offset clears the fixed header; Lenis owns the window axis, so a
    // native smooth scroll here would fight its interpolation.
    const goToHash = () => {
      let el: Element | null = null;
      try {
        el = document.querySelector(hash);
      } catch {
        return true; // malformed selector in the URL — treat as unresolved
      }
      if (!el) return false;
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      const lenis = getSharedLenis();
      if (lenis) lenis.scrollTo(top, { duration: 1.6 });
      else window.scrollTo({ top, behavior: "smooth" });
      return true;
    };
    // A hash link from another page resolves before that page has laid out.
    if (goToHash()) return;
    const raf = requestAnimationFrame(goToHash);
    return () => cancelAnimationFrame(raf);
  }, [pathname, hash]);
  return null;
}

export function App() {
  return (
    <HelmetProvider>
    <CatalogProvider>
      <BagProvider>
        <BrowserRouter>
          <SmoothScroll>
            <div className="w-full bg-ivory">
              {/* First-load veil (first visit per session only). */}
              <BootLoader />
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-maroon focus:px-4 focus:py-2 focus:text-ivory"
              >
                Skip to content
              </a>
              <ScrollManager />
              <Header />
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/collection" element={<Collection />} />
                  <Route path="/product/:id" element={<ProductDetail />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <Footer />
            </div>
          </SmoothScroll>
        </BrowserRouter>
      </BagProvider>
    </CatalogProvider>
    </HelmetProvider>
  );
}

