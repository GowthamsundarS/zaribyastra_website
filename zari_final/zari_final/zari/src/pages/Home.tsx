import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Hero } from "../components/Hero";
import { StackedCollections } from "../components/StackedCollections";
import { Seo } from "../components/Seo";

const easeEditorial: [number, number, number, number] = [0.14, 1, 0.34, 1];

export function Home() {
  const introRef = useRef<HTMLElement>(null);
  const { scrollYProgress: introP } = useScroll({
    target: introRef,
    offset: ["start end", "end start"],
  });
  // the abaya turns a slight side view mid-section and returns to front;
  // pure rotateY keeps the garment rigid — no stretch or warp
  const rotateY = useTransform(introP, [0.12, 0.5, 0.88], [0, 24, 0]);

  return (
    <main id="main-content">
      <Seo
        title="ZARI by Astra — Modest Luxury Abayas | Kerala, India"
        description="ZARI by Astra — quietly crafted luxury abayas in crepe and silk, cut for movement and finished by hand in Kerala, India."
        path="/"
      />
      <Hero />

      {/* Introduction — brown abaya on the left, the house note on the right */}
      <section
        ref={introRef}
        id="atelier"
        className="relative bg-ivory px-6 pb-28 pt-24 sm:px-10 lg:px-16"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <motion.figure
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.1, ease: easeEditorial }}
            className="mx-auto w-full max-w-md"
          >
            <motion.div
              style={{ rotateY, transformPerspective: 1400 }}
              className="[filter:drop-shadow(0_24px_40px_rgba(31,5,9,0.18))]"
            >
              <img
                src="/abaya-intro.webp"
                srcSet="/abaya-intro-480.webp 480w, /abaya-intro.webp 941w"
                sizes="(max-width: 640px) calc(100vw - 48px), 448px"
                alt="Brown abaya with a matching draped hijab"
                loading="lazy"
                decoding="async"
                width={896}
                height={1200}
                className="aspect-[9/16] w-full object-contain"
              />
            </motion.div>
            <figcaption className="mt-4 text-center font-sans text-[10px] uppercase tracking-[0.35em] text-maroon-ink/50">
              The brown abaya — crepe, draped hijab, quiet hands
            </figcaption>
          </motion.figure>

          <div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: easeEditorial }}
              className="font-sans text-[10px] uppercase tracking-[0.5em] text-maroon"
            >
              The House
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1, delay: 0.1, ease: easeEditorial }}
              className="mt-6 font-display text-4xl leading-[1.1] text-maroon-ink sm:text-5xl"
            >
              The Essence of Abaya
            </motion.h2>
            <motion.span
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.1, delay: 0.25, ease: easeEditorial }}
              className="mt-10 block h-px w-24 origin-left bg-maroon/30"
            />
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1, delay: 0.2, ease: easeEditorial }}
              className="mt-10 max-w-xl font-sans text-sm leading-8 text-maroon-ink/70"
            >
              The abaya is an exercise in elegant restraint — a flowing garment defined by
              modesty, simplicity and graceful silhouettes, refined over generations of
              quiet craftsmanship. ZARI carries that heritage into modern luxury: crepe and
              silk in warm, earth-toned palettes, cut for movement and finished entirely by
              hand.
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.2, delay: 0.4 }}
              className="mt-8 font-arabic text-2xl text-maroon/70"
              lang="ar"
            >
              زَرِي — حِرفةُ الخَيْطِ الذَّهَبِي
            </motion.p>
          </div>
        </div>
      </section>

      <StackedCollections />
    </main>
  );
}
