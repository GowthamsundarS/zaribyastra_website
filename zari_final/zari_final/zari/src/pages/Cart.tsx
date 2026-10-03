import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useBag } from "../contexts/BagContext";
import { useCatalog } from "../contexts/CatalogContext";
import { BackButton } from "../components/BackButton";
import { formatINR, effectivePrice, discountPercent } from "../data/catalog";
import { openWhatsAppOrder, type OrderLine } from "../utils/whatsapp";

const easeEditorial: [number, number, number, number] = [0.14, 1, 0.34, 1];

export function Cart() {
  const { items, setQuantity, removeFromBag, clearBag } = useBag();
  const { getProduct } = useCatalog();
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");

  const rows = useMemo(
    () =>
      items
        .map((item) => ({ item, product: getProduct(item.productId) }))
        .filter((r) => r.product !== undefined),
    [items, getProduct]
  );

  const total = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + (r.product ? effectivePrice(r.product) : 0) * r.item.quantity,
        0
      ),
    [rows]
  );

  const proceed = () => {
    if (rows.length === 0) return;
    const lines: OrderLine[] = rows.map((r) => ({
      name: r.product!.name,
      size: r.item.size,
      quantity: r.item.quantity,
      price: effectivePrice(r.product!),
    }));
    openWhatsAppOrder(lines, total, customerName);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-32 sm:px-8 md:pt-40">
      <BackButton />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: easeEditorial }}
      >
        <p className="font-sans text-[11px] uppercase tracking-[0.3em] text-maroon/60">
          ZARI
        </p>
        <h1 className="mt-3 font-display text-4xl font-medium text-maroon-ink sm:text-5xl">
          Shopping Cart
        </h1>
      </motion.div>

      {rows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-16 flex flex-col items-center rounded-2xl border border-maroon/10 bg-white/60 px-6 py-20 text-center shadow-[0_18px_45px_rgba(31,5,9,0.06)]"
        >
          <ShoppingBag className="h-10 w-10 text-maroon/40" strokeWidth={1.25} />
          <p className="mt-6 font-display text-2xl italic text-maroon-ink/80">
            Your cart is quietly empty.
          </p>
          <p className="mt-2 max-w-sm font-sans text-sm leading-relaxed text-maroon-ink/60">
            Explore the collection and add a piece you will reach for again and again.
          </p>
          <Link
            to="/collection"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-maroon px-7 py-3 font-sans text-[12px] uppercase tracking-[0.22em] text-ivory transition-colors hover:bg-maroon-ink"
          >
            Explore Collection
          </Link>
        </motion.div>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px] lg:items-start">
          <ul className="space-y-6">
            {rows.map(({ item, product }, i) => (
              <motion.li
                key={`${item.productId}-${item.size}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: i * 0.05, ease: easeEditorial }}
                className="flex gap-5 rounded-2xl border border-maroon/10 bg-white/70 p-4 shadow-[0_14px_36px_rgba(31,5,9,0.05)] sm:gap-6 sm:p-5"
              >
                <Link
                  to={`/product/${product!.id}`}
                  className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl bg-ivory sm:w-24"
                >
                  <img
                    src={product!.image}
                    alt={product!.name}
                    className="h-full w-full object-cover object-top"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-sans text-[10px] uppercase tracking-[0.24em] text-maroon/55">
                        {product!.category} · {item.size}
                      </p>
                      <Link
                        to={`/product/${product!.id}`}
                        className="mt-1 block truncate font-display text-xl text-maroon-ink transition-colors hover:text-maroon"
                      >
                        {product!.name}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-sans text-sm text-maroon-ink/60">
                        {discountPercent(product!) > 0 && (
                          <s className="text-maroon-ink/40">
                            {formatINR(product!.price)}
                          </s>
                        )}
                        <span className="text-maroon">
                          {formatINR(effectivePrice(product!))}
                        </span>
                        <span>each</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromBag(item.productId, item.size)}
                      aria-label={`Remove ${product!.name}`}
                      className="rounded-full p-2 text-maroon/50 transition-colors hover:bg-maroon/5 hover:text-maroon"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-4 pt-4">
                    <div className="inline-flex items-center rounded-full border border-maroon/20">
                      <button
                        type="button"
                        onClick={() =>
                          setQuantity(item.productId, item.size, item.quantity - 1)
                        }
                        aria-label="Decrease quantity"
                        className="p-2.5 text-maroon/70 transition-colors hover:text-maroon"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <span className="min-w-8 text-center font-sans text-sm tabular-nums text-maroon-ink">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setQuantity(item.productId, item.size, item.quantity + 1)
                        }
                        aria-label="Increase quantity"
                        className="p-2.5 text-maroon/70 transition-colors hover:text-maroon"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                    <p className="font-display text-xl text-maroon-ink">
                      {formatINR(effectivePrice(product!) * item.quantity)}
                    </p>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>

          <motion.aside
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: easeEditorial }}
            className="rounded-2xl border border-maroon/10 bg-white/80 p-6 shadow-[0_18px_45px_rgba(31,5,9,0.07)] lg:sticky lg:top-32"
          >
            <h2 className="font-display text-2xl text-maroon-ink">Order Summary</h2>
            <div className="mt-5 space-y-3 border-t border-maroon/10 pt-5 font-sans text-sm text-maroon-ink/70">
              <div className="flex justify-between">
                <span>
                  Subtotal ({rows.reduce((n, r) => n + r.item.quantity, 0)}{" "}
                  {rows.reduce((n, r) => n + r.item.quantity, 0) === 1 ? "item" : "items"})
                </span>
                <span className="tabular-nums text-maroon-ink">{formatINR(total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="italic text-maroon/70">Arranged on WhatsApp</span>
              </div>
            </div>
            <div className="mt-5 flex items-baseline justify-between border-t border-maroon/10 pt-5">
              <span className="font-sans text-[11px] uppercase tracking-[0.24em] text-maroon/60">
                Total
              </span>
              <span className="font-display text-3xl text-maroon">{formatINR(total)}</span>
            </div>

            <label className="mt-6 block">
              <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-maroon/60">
                Your name <span className="normal-case tracking-normal">(optional)</span>
              </span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Aisha"
                className="mt-2 w-full rounded-xl border border-maroon/20 bg-ivory/60 px-4 py-3 font-sans text-sm text-maroon-ink outline-none transition-colors placeholder:text-maroon-ink/35 focus:border-maroon/50"
              />
            </label>

            <button
              type="button"
              onClick={proceed}
              className="mt-6 w-full rounded-full bg-maroon px-6 py-3.5 font-sans text-[12px] uppercase tracking-[0.22em] text-ivory transition-colors hover:bg-maroon-ink"
            >
              Proceed to Purchase
            </button>
            <button
              type="button"
              onClick={() => navigate("/collection")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-maroon/25 px-6 py-3 font-sans text-[12px] uppercase tracking-[0.22em] text-maroon-ink transition-colors hover:border-maroon/50 hover:bg-maroon/5"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              Continue Shopping
            </button>
            <button
              type="button"
              onClick={clearBag}
              className="mt-4 w-full text-center font-sans text-[11px] uppercase tracking-[0.18em] text-maroon/45 transition-colors hover:text-maroon"
            >
              Clear cart
            </button>
            <p className="mt-5 border-t border-maroon/10 pt-4 text-center font-sans text-[11px] leading-relaxed text-maroon-ink/50">
              Your order opens in WhatsApp with the details above. We confirm
              payment and delivery personally — no online checkout needed.
            </p>
          </motion.aside>
        </div>
      )}
    </main>
  );
}
