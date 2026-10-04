import React from "react";
import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";

export function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-ivory px-6 pt-24">
      <Seo
        title="Page not found — ZARI by Astra"
        description="The page you requested is not part of the ZARI by Astra collection."
        path="/"
        noindex
      />
      <p className="font-display text-3xl italic text-maroon-ink/50">
        This piece is not in the atelier.
      </p>
      <Link
        to="/"
        className="border-b border-maroon/40 pb-1 font-sans text-[11px] uppercase tracking-[0.35em] text-maroon"
      >
        Back to Home
      </Link>
    </main>
  );
}
