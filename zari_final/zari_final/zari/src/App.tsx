import React, { useLayoutEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { BagProvider } from "./contexts/BagContext";
import { CatalogProvider } from "./contexts/CatalogContext";
import { SmoothScroll, getSharedLenis } from "./components/SmoothScroll";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { Collection } from "./pages/Collection";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Admin } from "./pages/Admin";
import { Footer } from "./components/Footer";

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
    <CatalogProvider>
      <BagProvider>
        <BrowserRouter>
          <SmoothScroll>
            <div className="w-full bg-ivory">
              <ScrollManager />
              <Header />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/collection" element={<Collection />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<Home />} />
              </Routes>
              <Footer />
            </div>
          </SmoothScroll>
        </BrowserRouter>
      </BagProvider>
    </CatalogProvider>
  );
}
//poda
