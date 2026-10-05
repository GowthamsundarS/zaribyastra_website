"""Cloudinary delivery-URL optimizer (backward compatible).

Originals stay untouched in Cloudinary. This module only rewrites the
*delivery* URL so browsers download an optimized variant:

    https://res.cloudinary.com/<cloud>/image/upload/v123/boutique/products/x.jpg
    -> https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,c_limit,w_800/v123/boutique/products/x.jpg

Cloudinary then serves AVIF where supported, WebP otherwise, with an
optimized JPEG/PNG fallback — at the requested width cap. No extra
copies are stored; transformation URLs are stable and CDN-cacheable.

Safe for legacy rows:
- non-Cloudinary URLs (local /public assets, data: URIs, other CDNs)
  are returned unchanged,
- already-transformed URLs are normalized, never double-wrapped,
- missing/empty URLs return "" so one bad image can't break a page.
"""

from __future__ import annotations

import os
import re

_UPLOAD_MARKER = "/image/upload/"
_TRANSFORM_RE = re.compile(r"^[a-zA-Z_]+_[^/]*$")
_KNOWN_TRANSFORM_PREFIXES = (
    "f_", "q_", "w_", "h_", "c_", "g_", "ar_", "dpr_", "e_",
    "o_", "r_", "a_", "b_", "d_", "fl_", "fn_", "pg_", "t_",
    "u_", "x_", "y_", "z_",
)


def _looks_like_transform(segment: str) -> bool:
    """True when a path segment is a Cloudinary transformation chain."""
    if not segment or segment.startswith("v") and segment[1:].isdigit():
        return False
    parts = segment.split(",")
    if not parts:
        return False
    return all(
        p.startswith(_KNOWN_TRANSFORM_PREFIXES) or _TRANSFORM_RE.match(p)
        for p in parts
        if p
    )


def optimized_image_url(url: str | None, width: int = 800) -> str:
    """Return an optimized Cloudinary delivery URL for *url*.

    *width* is a `c_limit` cap (never upscales): card grids should pass
    600, detail/hero views 1000-1200, thumbnails 200-300.
    """
    if not url or not isinstance(url, str):
        return ""
    url = url.strip()
    if not url:
        return ""
    # Never touch data-URIs, blobs or relative site assets.
    if url.startswith(("data:", "blob:")) or url.startswith("/"):
        return url
    marker = _UPLOAD_MARKER
    if "res.cloudinary.com" not in url or marker not in url:
        return url
    try:
        width = max(50, min(int(width), 2000))
    except (TypeError, ValueError):
        width = 800

    transform = f"f_auto,q_auto,c_limit,w_{width}"
    head, tail = url.split(marker, 1)
    # Strip query string / fragment, re-appended at the end.
    suffix = ""
    for sep in ("?", "#"):
        if sep in tail:
            tail, extra = tail.split(sep, 1)
            suffix = sep + extra + suffix
            tail = tail  # keep path portion only
            break
    # tail is like "[transform/]v123/public/id.jpg" or "[transform/]public/id.jpg"
    segments = tail.split("/")
    rest: list[str] = list(segments)
    # Drop any existing transformation segments (idempotent) so we never
    # produce /upload/f_auto,.../f_auto,.../...
    while rest and _looks_like_transform(rest[0]):
        rest.pop(0)
    return f"{head}{marker}{transform}/{'/'.join(rest)}{suffix}"


def cloud_name() -> str:
    return os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()


def optimize_image_row(row: dict | None, width: int = 800) -> dict | None:
    """Rewrite ``image_url`` in-place on a product_images row (same keys)."""
    if not isinstance(row, dict):
        return row
    try:
        if row.get("image_url"):
            row["image_url"] = optimized_image_url(row["image_url"], width)
    except Exception:
        pass
    return row


def optimize_product_payload(product: dict | None, width: int = 800) -> dict | None:
    """Rewrite every nested ``images[].image_url`` (same response shape)."""
    if not isinstance(product, dict):
        return product
    try:
        images = product.get("images")
        if isinstance(images, list):
            for img in images:
                optimize_image_row(img, width)
    except Exception:
        pass
    return product
