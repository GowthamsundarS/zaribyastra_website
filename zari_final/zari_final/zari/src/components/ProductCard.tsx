import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Product,
  formatINR,
  effectivePrice,
  discountPercent,
  galleryImages,
  MADE_TO_MEASURE,
} from "../data/catalog";
import { cloudinarySrc, cloudinarySrcSet } from "../utils/cloudinary";
import { useBag } from "../contexts/BagContext";
import { ADMIN_WHATSAPP, openWhatsAppOrder } from "../utils/whatsapp";
import { haptic } from "../utils/haptics";

export function ProductCard({
  product,
  index,
}: {
  product: Product;
  index: number;
}) {
  const { addToBag } = useBag();
  const navigate = useNavigate();
  const size = MADE_TO_MEASURE;
  const payable = effectivePrice(product);
  const off = discountPercent(product);

  // Gallery: cover first, swipe/arrow through the rest without leaving
  // the Collections grid.
  const photos =
    galleryImages(product).length > 0
      ? galleryImages(product)
      : ["/abaya-intro.webp"];
  const [active, setActive] = useState(0);
  const shown = Math.min(active, photos.length - 1);
  const touchX = useRef<number | null>(null);
  const go = (dir: 1 | -1) => {
    haptic(5);
    setActive((a) => (a + dir + photos.length) % photos.length);
  };

  const buyNow = () => {
    haptic([10, 40, 16]);
    openWhatsAppOrder(
      [
        {
          name: product.name,
          size,
          quantity: 1,
          price: payable,
        },
      ],
      payable
    );
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.8, delay: (index % 3) * 0.08, ease: [0.14, 1, 0.34, 1] }}
      className="group flex flex-col"
    >
      <div
        className="relative block overflow-hidden"
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 32 && photos.length > 1) go(dx < 0 ? 1 : -1);
        }}
      >
        <Link to={`/product/${product.id}`} aria-label={`View ${product.name}`}>
          <img
            key={photos[shown]}
            src={cloudinarySrc(photos[shown], 480)}
            srcSet={cloudinarySrcSet(photos[shown], [320, 480, 640, 800, 1200])}
            sizes="(max-width: 640px) calc(100vw - 48px), (max-width: 1024px) calc(50vw - 56px), 363px"
            alt={product.name}
            loading="lazy"
            decoding="async"
            width={768}
            height={1024}
            className="aspect-[3/4] w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.045]"
          />
        </Link>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-ivory/90 p-1.5 text-maroon opacity-100 shadow transition-opacity hover:bg-ivory sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-ivory/90 p-1.5 text-maroon opacity-100 shadow transition-opacity hover:bg-ivory sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
              {photos.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={
                    "h-1.5 rounded-full transition-all " +
                    (i === shown ? "w-5 bg-ivory" : "w-1.5 bg-ivory/60 hover:bg-ivory/90")
                  }
                />
              ))}
            </span>
          </>
        )}
        <span className="pointer-events-none absolute left-4 top-4 flex gap-2">
          {product.isNew && (
            <span className="bg-ivory/90 px-3 py-1 font-sans text-[9px] uppercase tracking-[0.3em] text-maroon">
              New
            </span>
          )}
          {product.isBestSeller && (
            <span className="bg-maroon px-3 py-1 font-sans text-[9px] uppercase tracking-[0.3em] text-ivory">
              Best Seller
            </span>
          )}
          {off > 0 && (
            <span className="bg-gold px-3 py-1 font-sans text-[9px] uppercase tracking-[0.3em] text-maroon-ink">
              {off}% Off
            </span>
          )}
        </span>
        {photos.length > 1 && (
          <span className="pointer-events-none absolute bottom-2.5 right-3 font-sans text-[10px] tracking-[0.2em] text-ivory/90">
            {shown + 1}/{photos.length}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pt-5">
        <p className="font-sans text-[9px] uppercase tracking-[0.4em] text-maroon/70">
          {product.category}
        </p>
        <Link to={`/product/${product.id}`}>
          <h2 className="mt-2 font-display text-xl leading-snug text-maroon-ink transition-colors group-hover:text-maroon">
            {product.name}
          </h2>
        </Link>
        <p className="mt-2 line-clamp-2 font-sans text-xs leading-6 text-maroon-ink/60">
          {product.description}
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3 font-sans text-sm tracking-[0.15em]">
          {off > 0 && (
            <s className="text-maroon-ink/40">{formatINR(product.price)}</s>
          )}
          <span className={off > 0 ? "text-maroon" : "text-maroon-ink/80"}>
            {formatINR(payable)}
          </span>
        </p>
        <a
          href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(
            `Hello ZARI, I would like size details for the ${product.name}.`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 self-start font-sans text-[9px] uppercase tracking-[0.28em] text-maroon-ink/45 transition-colors hover:text-maroon"
        >
          Size details given on WhatsApp
        </a>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              haptic(12);
              addToBag(product.id, size);
              navigate("/cart");
            }}
            className="flex-1 border border-maroon/40 py-2.5 font-sans text-[10px] uppercase tracking-[0.28em] text-maroon transition-colors hover:border-maroon hover:bg-maroon hover:text-ivory"
          >
            Add to Cart
          </button>
          <button
            type="button"
            onClick={buyNow}
            className="flex-1 bg-maroon py-2.5 font-sans text-[10px] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-maroon-deep"
          >
            Buy Now
          </button>
        </div>
      </div>
    </motion.article>
  );
}
