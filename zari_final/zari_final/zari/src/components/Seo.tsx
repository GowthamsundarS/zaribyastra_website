import React from "react";
import { Helmet } from "react-helmet-async";

const SITE = "https://zaribyastra.in";

interface SeoProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

export function Seo({
  title,
  description,
  path = "/",
  image = `${SITE}/abaya-intro.webp`,
  noindex = false,
  jsonLd,
}: SeoProps) {
  const url = `${SITE}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image.startsWith("http") ? image : `${SITE}${image}`} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
