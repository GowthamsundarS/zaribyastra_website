import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import ScrollStack, { ScrollStackItem } from "./ScrollStack";
import { useCatalog } from "../contexts/CatalogContext";
import { type Product } from "../data/catalog";

const easeEditorial: [number, number, number, number] = [0.14, 1, 0.34, 1];

const FALLBACK_IMAGE = "/brown-abaya.png";
const FALLBACK_DESC =
  "A ZARI piece — open it for fabric, cut and finishing details.";

function CollectionCard({
  product,
  number,
}: {
  product: Product;
  number: number;
}) {
  const name = product.name?.trim() || "Untitled piece";
  const desc = product.description?.trim() || FALLBACK_DESC;
  return (
    <article className="grid min-h-[600px] overflow-hidden rounded-[24px] border border-maroon/10 bg-[#FBF7F0] sm:h-[68vh] sm:min-h-[560px] sm:grid-cols-[7fr_5fr] sm:grid-rows-[1fr]">
      <Link
        to={`/product/${product.id}`}
        aria-label={`View ${name}`}
        className="block overflow-hidden"
      >
        <img
          src={product.image?.trim() || FALLBACK_IMAGE}
          alt={name}
          loading="lazy"
          onError={(e) => {
            const el = e.currentTarget;
            if (!el.src.endsWith(FALLBACK_IMAGE)) el.src = FALLBACK_IMAGE;
          }}
          className="aspect-[4/3] w-full object-cover object-top transition-transform duration-700 ease-out hover:scale-[1.03] sm:aspect-auto sm:h-full sm:min-h-0"
        />
      </Link>
      <div className="flex flex-col justify-center gap-4 p-8 sm:min-h-0 sm:gap-5 sm:p-12">
        <p className="font-sans text-[10px] uppercase tracking-[0.45em] text-maroon">
          Collection {String(number).padStart(2, "0")}
        </p>
        <Link to={`/product/${product.id}`} className="self-start">
          <h3 className="font-display text-4xl leading-tight text-maroon-ink transition-colors hover:text-maroon sm:text-4xl lg:text-5xl">
            {name}
          </h3>
        </Link>
        <p className="font-sans text-sm leading-7 text-maroon-ink/70 sm:text-[15px]">{desc}</p>
        <Link
          to={`/product/${product.id}`}
          className="group mt-2 inline-flex items-center gap-3 self-start border-b border-maroon/40 pb-1 font-sans text-[11px] uppercase tracking-[0.35em] text-maroon transition-colors hover:border-maroon"
        >
          View Product
          <ArrowRight
            size={14}
            className="transition-transform duration-500 group-hover:translate-x-1"
          />
        </Link>
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-10" aria-hidden="true">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="grid min-h-[420px] animate-pulse overflow-hidden rounded-[24px] border border-maroon/10 bg-[#FBF7F0] sm:grid-cols-[7fr_5fr]"
        >
          <div className="min-h-[280px] bg-maroon/10 sm:min-h-[420px]" />
          <div className="flex flex-col justify-center gap-4 p-8 sm:p-12">
            <div className="h-3 w-28 bg-maroon/15" />
            <div className="h-8 w-3/4 bg-maroon/15" />
            <div className="h-4 w-full bg-maroon/10" />
            <div className="h-4 w-2/3 bg-maroon/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StackedCollections() {
  const { exploreCards, loading, products } = useCatalog();
  // Re-init the scroll stack whenever the card set resolves — products
  // arrive async, and stale offsets are what made the stack "sometimes"
  // stick, overlap or show an empty run.
  const itemsKey = exploreCards.map((p) => p.id).join("|");

  return (
    <section id="collections" className="relative bg-ivory">
      <div className="mx-auto max-w-6xl px-6 pt-10 sm:px-10">
        <div className="grid gap-10 md:grid-cols-2 md:items-end">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: easeEditorial }}
              className="font-sans text-[10px] uppercase tracking-[0.5em] text-maroon"
            >
              The Collections
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1, delay: 0.1, ease: easeEditorial }}
              className="mt-6 font-display text-4xl leading-[1.08] text-maroon-ink sm:text-5xl lg:text-6xl"
            >
              Cut for stillness,
              <br />
              made for movement.
            </motion.h2>
          </div>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1, delay: 0.2, ease: easeEditorial }}
            className="max-w-md font-sans text-sm leading-7 text-maroon-ink/70 md:ml-auto"
          >
            Four edits, one line — crepe, silk and velvet cut to the same drape that opens
            this house. Scroll through the stack; each collection rests over the last.
          </motion.p>
        </div>
      </div>

      {loading && exploreCards.length === 0 ? (
        <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
          <LoadingSkeleton />
        </div>
      ) : exploreCards.length === 0 ? (
        <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:px-10">
          <p className="font-display text-2xl italic text-maroon-ink/50">
            {products.length
              ? "The atelier is styling the next edit — check back soon."
              : "Unveiling the edit…"}
          </p>
          <Link
            to="/collection"
            className="mt-6 inline-block border-b border-maroon/40 pb-1 font-sans text-[11px] uppercase tracking-[0.35em] text-maroon"
          >
            Browse all pieces
          </Link>
        </div>
      ) : (
        /* Window-scroll mode reuses the app's shared Lenis (SmoothScroll)
            singleton — one smoother per axis, transforms update in Lenis's
            own rAF with cached offsets, so the stack tracks the smoothed
            scroll with no lag or jitter. scaleEndPosition must sit above
            stackPosition for a forward scale range. */
        <ScrollStack
          key={itemsKey}
          itemsKey={itemsKey}
          useWindowScroll
          itemDistance={48}
          itemStackDistance={28}
          itemScale={0.035}
          baseScale={0.86}
          stackPosition="16%"
          scaleEndPosition="8%"
          blurAmount={1.2}
          className="bg-ivory"
        >
          {exploreCards.map((product, i) => (
            <ScrollStackItem
              key={`${product.id}-${i}`}
              itemClassName="zari-stack-card !h-auto !rounded-[28px] !p-0 !shadow-[0_30px_60px_-30px_rgba(31,5,9,0.35)]"
            >
              <CollectionCard product={product} number={i + 1} />
            </ScrollStackItem>
          ))}
        </ScrollStack>
      )}

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-4 text-center sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1, ease: easeEditorial }}
        >
          <Link
            to="/collection"
            className="group inline-flex items-center gap-4 border border-maroon/40 px-10 py-4 font-sans text-[11px] uppercase tracking-[0.35em] text-maroon transition-colors hover:border-maroon hover:bg-maroon hover:text-ivory"
          >
            Explore Collection
            <ArrowRight
              size={14}
              className="transition-transform duration-500 group-hover:translate-x-1"
            />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
