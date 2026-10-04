import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { useCatalog } from "../contexts/CatalogContext";
import { useBag } from "../contexts/BagContext";
import { BackButton } from "../components/BackButton";
import {
  formatINR,
  effectivePrice,
  discountPercent,
  galleryImages,
  MADE_TO_MEASURE,
} from "../data/catalog";
import { ADMIN_WHATSAPP, openWhatsAppOrder } from "../utils/whatsapp";

export function ProductDetail() {
  const { id } = useParams();
  const { getProduct, loading } = useCatalog();
  const { addToBag } = useBag();
  const navigate = useNavigate();
  const product = id ? getProduct(id) : undefined;
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);

  const photos =
    product && galleryImages(product).length > 0
      ? galleryImages(product)
      : ["/brown-abaya.png"];
  const shown = Math.min(photo, photos.length - 1);

  // Reset gallery + quantity when navigating between products.
  useEffect(() => {
    setPhoto(0);
    setQty(1);
  }, [id]);

  if (loading) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-ivory px-6 pt-24">
        <BackButton />
        <p className="font-display text-3xl italic text-maroon-ink/50">
          Unveiling the piece…
        </p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-ivory px-6 pt-24">
        <BackButton />
        <p className="font-display text-3xl italic text-maroon-ink/50">
          This piece has left the atelier.
        </p>
        <Link
          to="/collection"
          className="border-b border-maroon/40 pb-1 font-sans text-[11px] uppercase tracking-[0.35em] text-maroon"
        >
          Back to the Collection
        </Link>
      </main>
    );
  }

  const chosenSize = MADE_TO_MEASURE;
  const payable = effectivePrice(product);
  const off = discountPercent(product);
  const total = payable * qty;

  const buyNow = () =>
    openWhatsAppOrder(
      [{ name: product.name, size: chosenSize, quantity: qty, price: payable }],
      total
    );

  return (
    <main className="bg-ivory px-6 pb-28 pt-32 sm:px-10 lg:px-16">
      <BackButton />
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:gap-20">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.14, 1, 0.34, 1] }}
          className="relative"
        >
          <img
            key={photos[shown]}
            src={photos[shown]}
            alt={product.name}
            className="aspect-[3/4] w-full object-cover object-top"
          />
          {photos.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2.5">
              {photos.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setPhoto(i)}
                  aria-label={`View photo ${i + 1}`}
                  aria-current={i === shown}
                  className={
                    "aspect-[3/4] overflow-hidden border transition-all " +
                    (i === shown
                      ? "border-maroon"
                      : "border-maroon/15 opacity-70 hover:opacity-100")
                  }
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.14, 1, 0.34, 1] }}
          className="flex flex-col"
        >
          <p className="font-sans text-[10px] uppercase tracking-[0.45em] text-maroon/70">
            {product.category}
            {product.isNew && " · New Arrival"}
            {product.isBestSeller && " · Best Seller"}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.1] text-maroon-ink sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            {off > 0 && (
              <s className="font-sans text-base tracking-[0.12em] text-maroon-ink/40">
                {formatINR(product.price)}
              </s>
            )}
            <span className="font-sans text-lg tracking-[0.12em] text-maroon">
              {formatINR(payable)}
            </span>
            {off > 0 && (
              <span className="bg-gold px-3 py-1 font-sans text-[9px] uppercase tracking-[0.3em] text-maroon-ink">
                {off}% Off
              </span>
            )}
          </p>
          <span className="mt-8 block h-px w-20 bg-maroon/25" />
          <p className="mt-8 font-sans text-sm leading-8 text-maroon-ink/70">
            {product.description}
          </p>

          <div className="mt-10">
            <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-maroon-ink/55">
              Fit &amp; Sizing
            </p>
            <div className="mt-4 border border-maroon/20 px-5 py-4">
              <p className="font-sans text-sm leading-7 text-maroon-ink/70">
                Every piece is cut to your own measurements, so there is no size
                to choose here.
              </p>
              <a
                href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(
                  `Hello ZARI, I would like size details for the ${product.name}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 border-b border-maroon/40 pb-0.5 font-sans text-[10px] uppercase tracking-[0.3em] text-maroon transition-colors hover:border-maroon"
              >
                Ask us about sizing
              </a>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-between gap-6">
            <p className="font-sans text-[10px] uppercase tracking-[0.4em] text-maroon-ink/55">
              Quantity
            </p>
            <div className="flex items-center border border-maroon/25">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-3.5 py-2.5 text-maroon-ink/70 transition-colors hover:text-maroon"
              >
                <Minus size={14} />
              </button>
              <span className="min-w-10 text-center font-sans text-sm text-maroon-ink">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQty((q) => q + 1)}
                className="px-3.5 py-2.5 text-maroon-ink/70 transition-colors hover:text-maroon"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                addToBag(product.id, chosenSize, qty);
                navigate("/cart");
              }}
              className="flex-1 border border-maroon/40 py-3.5 font-sans text-[11px] uppercase tracking-[0.3em] text-maroon transition-colors hover:border-maroon hover:bg-maroon hover:text-ivory"
            >
              Add to Cart
            </button>
            <button
              type="button"
              onClick={buyNow}
              className="flex-1 bg-maroon py-3.5 font-sans text-[11px] uppercase tracking-[0.3em] text-ivory transition-colors hover:bg-maroon-deep"
            >
              Buy Now
            </button>
          </div>
          <p className="mt-6 font-sans text-[10px] uppercase tracking-[0.3em] text-maroon-ink/45">
            Orders are confirmed personally on WhatsApp — no checkout, just a conversation.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
