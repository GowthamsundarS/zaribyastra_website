import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { haptic } from "../utils/haptics";

// Icon-only and pinned to the viewport so it stays reachable while the page
// scrolls. Fallback to home matters: navigate(-1) on a direct landing would
// leave the site entirely.
export function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.14, 1, 0.34, 1] }}
      type="button"
      aria-label="Back"
      onClick={() => {
        haptic(10);
        if (location.key === "default") navigate("/");
        else navigate(-1);
      }}
      className="fixed bottom-8 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-maroon/20 bg-ivory/80 text-maroon-ink/70 shadow-[0_10px_30px_rgba(31,5,9,0.12)] backdrop-blur-sm transition-colors hover:border-maroon/60 hover:text-maroon sm:left-10"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
    </motion.button>
  );
}
