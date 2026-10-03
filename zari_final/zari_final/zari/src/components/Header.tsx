import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useScroll,
  useTransform,
} from "framer-motion";
import { Menu, ShoppingBag, Sparkle, X } from "lucide-react";
import { useBag } from "../contexts/BagContext";
import { ZariMark } from "./ZariMark";
import { HERO_INTRO_DELAY, HERO_INTRO_DURATION } from "./Hero";

const LINKS = [
  { label: "Home", to: "/" },
  { label: "Collection", to: "/collection" },
  { label: "About", to: "/#atelier" },
  { label: "Contact", to: "/#contact" },
];

const GRADIENT_LETTER: React.CSSProperties = {
  backgroundImage: "linear-gradient(180deg, #6B0F1A 0%, #8A6A5E 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

export function Header() {
  const { count } = useBag();
  const { pathname } = useLocation();
  const { scrollY } = useScroll();
  const [vh] = useState(() => window.innerHeight);
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = pathname === "/";
  // On home the header stays out of the way during the auto-playing hero
  // intro, then fades in when the intro finishes — or earlier if the user
  // has already scrolled past the hero, whichever comes first.
  const introDone = useMotionValue(0);
  useEffect(() => {
    if (!isHome) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      introDone.set(1);
      return;
    }
    const controls = animate(introDone, 1, {
      duration: 0.8,
      delay: HERO_INTRO_DELAY + HERO_INTRO_DURATION - 0.6,
    });
    return () => controls.stop();
  }, [isHome, introDone]);
  const scrollPast = useTransform(scrollY, [vh * 0.5, vh * 0.8], [0, 1]);
  const homeOpacity = useTransform(
    [introDone, scrollPast],
    ([a, b]: number[]) => Math.max(a, b)
  );
  const homePointerEvents = useTransform(homeOpacity, (v) => (v > 0.05 ? "auto" : "none"));
  const opacity = isHome ? homeOpacity : 1;
  const pointerEvents = isHome ? homePointerEvents : "auto";

  const split = (to: string) => {
    const [path, hash] = to.split("#");
    return hash ? { pathname: path, hash: "#" + hash } : { pathname: path };
  };

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <motion.header
      style={{ opacity, pointerEvents }}
      className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-ivory/95 via-ivory/80 to-transparent"
    >
      <div className="mx-auto grid w-full max-w-[calc(72rem+5rem)] grid-cols-3 items-center px-6 py-5 sm:px-10">
        <nav className="flex justify-start gap-6 font-sans text-[10px] uppercase tracking-[0.4em] text-maroon-ink/70 md:gap-10">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              to={split(l.to)}
              className="hidden transition-colors hover:text-maroon md:inline"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          to="/"
          className="flex items-baseline justify-center gap-[0.08em] font-display text-2xl leading-none"
          aria-label="ZARI home"
        >
          <span style={GRADIENT_LETTER}>Z</span>
          <ZariMark className="h-[0.72em] w-auto text-maroon-deep" />
          <span style={GRADIENT_LETTER}>R</span>
          <span style={GRADIENT_LETTER} className="relative">
            I
            <Sparkle
              size={8}
              fill="currentColor"
              strokeWidth={0}
              className="absolute -top-[0.3em] left-1/2 -translate-x-1/2 text-maroon"
            />
          </span>
        </Link>
        <div className="flex items-center justify-end gap-5">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="text-maroon-ink/70 transition-colors hover:text-maroon md:hidden"
          >
            {menuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>
          <Link
            to="/cart"
            aria-label={`Shopping bag, ${count} items`}
            className="relative text-maroon-ink/70 transition-colors hover:text-maroon"
          >
            <ShoppingBag size={20} strokeWidth={1.5} />
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-maroon px-1 font-sans text-[9px] font-medium text-ivory"
              >
                {count}
              </motion.span>
            )}
          </Link>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.14, 1, 0.34, 1] }}
            className="overflow-hidden border-t border-maroon/10 bg-ivory/95 backdrop-blur-sm md:hidden"
          >
            <div className="flex flex-col items-center py-3">
              {LINKS.map((l) => (
                <Link
                  key={l.label}
                  to={split(l.to)}
                  onClick={() => setMenuOpen(false)}
                  className="py-2.5 font-sans text-[11px] uppercase tracking-[0.35em] text-maroon-ink/80 transition-colors hover:text-maroon"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
