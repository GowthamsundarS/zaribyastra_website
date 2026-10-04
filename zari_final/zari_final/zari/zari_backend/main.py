import base64
import hashlib
import hmac
import io
import json
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

import cloudinary
import cloudinary.uploader

from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Body,
    Depends,
    Request
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from database import supabase


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


# =========================================================
# CLOUDINARY CONFIGURATION
# =========================================================

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

_DISABLE_DOCS = os.getenv("DISABLE_DOCS") == "1"

app = FastAPI(
    title="Boutique Product API",
    version="1.0.0",
    # Hide interactive docs on public hosting (they advertise every
    # route, including /admin/*). Set DISABLE_DOCS=1 in production.
    docs_url=None if _DISABLE_DOCS else "/docs",
    redoc_url=None if _DISABLE_DOCS else "/redoc",
    openapi_url=None if _DISABLE_DOCS else "/openapi.json",
)


# =========================================================
# FIX SWAGGER UI FILE UPLOAD BUTTON
# =========================================================
#
# FastAPI >= 0.129 generates:
#   {"type": "string", "contentMediaType": "application/octet-stream"}
# for UploadFile, but Swagger UI 5.x only shows the
# "Choose Files" button for:
#   {"type": "string", "format": "binary"}
#
# This patch adds "format": "binary" alongside
# "contentMediaType" so Swagger renders a file picker
# for both single and List[UploadFile] fields.
# OAS 3.1 ignores "format", OAS 3.0 ignores
# "contentMediaType", so keeping both is safe.
#
# =========================================================

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )

    for component in schema.get("components", {}).get("schemas", {}).values():
        for prop in component.get("properties", {}).values():
            # Handle direct file field: {"contentMediaType": ...}
            if prop.get("contentMediaType") == "application/octet-stream":
                prop["format"] = "binary"

            # Handle array of files: {"items": {"contentMediaType": ...}}
            items = prop.get("items", {})
            if items.get("contentMediaType") == "application/octet-stream":
                items["format"] = "binary"

            # Handle anyOf (Optional[UploadFile])
            for variant in prop.get("anyOf", []):
                if variant.get("contentMediaType") == "application/octet-stream":
                    variant["format"] = "binary"
                v_items = variant.get("items", {})
                if v_items.get("contentMediaType") == "application/octet-stream":
                    v_items["format"] = "binary"

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi


# =========================================================
# CORS
# =========================================================

# Production domains come from FRONTEND_URLS (comma-separated, e.g.
# "https://zari.in,https://www.zari.in"). Never use "*" here — with
# credentials allowed, a wildcard would let any site call the API with
# a stolen admin token.
_EXTRA_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_URLS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        *_EXTRA_ORIGINS,
    ])),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"]
)


# =========================================================
# SECURITY HEADERS (additive only — no route logic changed)
# =========================================================

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Referrer-Policy", "strict-origin-when-cross-origin"
    )
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
    )
    # HSTS only makes sense over HTTPS; harmless on localhost.
    response.headers.setdefault(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
    )
    # Permissive enough for Swagger UI + Cloudinary images.
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "img-src 'self' data: https:; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self' https:"
    )
    return response


# =========================================================
# ALLOWED IMAGE TYPES
# =========================================================

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp"
}


# =========================================================
# MAXIMUM NUMBER OF IMAGES
# =========================================================

MAX_IMAGES = 5

# Frontend caps uploads at 8MB — enforce the same cap server-side
# (frontend checks are bypassable, so this is the real limit).
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


def read_upload_capped(upload: UploadFile) -> bytes:
    """Read an upload into memory, rejecting oversized files first.

    Raises 413 before a single byte reaches Cloudinary.
    """
    f = upload.file
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Image too large ({size / 1024 / 1024:.1f}MB) — "
                "maximum 8MB per photo"
            )
        )
    return f.read()


def internal_error(context: str, e: Exception) -> HTTPException:
    """Log the real error server-side, send a generic message out.

    Raw exception text can leak paths, driver internals and table
    names, so it must never reach the client.
    """
    try:
        print(f"[error] {context}: {e}")
    except Exception:
        pass
    return HTTPException(
        status_code=500,
        detail="Internal server error — please try again later"
    )


# =========================================================
# ADMIN AUTH (passcode stored as hash in the `admins` table)
# =========================================================
#
# Run this once in Supabase to create the table:
#
#   create table if not exists admins (
#     id uuid primary key default gen_random_uuid(),
#     username text unique not null default 'admin',
#     password_hash text not null,
#     created_at timestamptz default now(),
#     updated_at timestamptz default now()
#   );
#
# The admin row is created directly in SQL (no setup endpoint exists
# on purpose — see below). Afterwards log in via POST /admin/login
# and rotate the secret via POST /admin/change-password.
#
# Hashing is PBKDF2-SHA256 from the standard library (no extra
# packages needed). Stored format:
#   pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
#

ADMIN_MIN_PASSWORD_LENGTH = 8

PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, expected = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            int(iterations)
        )
        return hmac.compare_digest(dk.hex(), expected)
    except Exception:
        return False


def validate_new_password(password: str) -> str:
    if len(password) < ADMIN_MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                f"{ADMIN_MIN_PASSWORD_LENGTH} characters"
            )
        )
    if len(password) > 128:
        raise HTTPException(
            status_code=400,
            detail="Password must be under 128 characters"
        )
    return password


def get_admin_row(username: str):
    response = (
        supabase
        .table("admins")
        .select("*")
        .eq("username", username)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


# =========================================================
# ADMIN SESSION TOKENS (stateless HMAC-signed, no extra table)
# =========================================================
#
# Login returns token "payload_b64.signature_b64" where payload is
# {"sub": username, "exp": epoch}. Requires ADMIN_TOKEN_SECRET in
# .env — generate one with:
#   python -c "import secrets; print(secrets.token_hex(32))"
# Without it the app still runs but tokens die on every restart
# (a loud warning is printed so this never goes unnoticed).
#

def _token_secret() -> bytes:
    configured = os.getenv("ADMIN_TOKEN_SECRET")
    if configured:
        return configured.encode("utf-8")
    return _EPHEMERAL_SECRET


_EPHEMERAL_SECRET = secrets.token_bytes(32)
if not os.getenv("ADMIN_TOKEN_SECRET"):
    print(
        "[warn] ADMIN_TOKEN_SECRET is not set — admin sessions will "
        "not survive a restart. Set it in zari_backend/.env."
    )

TOKEN_TTL_SECONDS = 12 * 60 * 60  # 12 hours

_bearer_scheme = HTTPBearer(auto_error=False)


def issue_admin_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    raw = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    sig = hmac.new(_token_secret(), raw.encode("ascii"), hashlib.sha256)
    return f"{raw}.{sig.hexdigest()}"


def verify_admin_token(token: str) -> str | None:
    """Return the username for a valid token, else None."""
    try:
        raw, provided = token.split(".", 1)
        expected = hmac.new(
            _token_secret(), raw.encode("ascii"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(provided, expected):
            return None
        payload = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        username = str(payload.get("sub", "")).strip()
        return username or None
    except Exception:
        return None


def require_admin(
    creds: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> str:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Admin sign-in required"
        )
    username = verify_admin_token(creds.credentials)
    if not username:
        raise HTTPException(
            status_code=401,
            detail="Session expired — please sign in again"
        )
    return username


# =========================================================
# LOGIN RATE LIMITING (in-memory sliding window per IP)
# =========================================================

LOGIN_MAX_ATTEMPTS = 10
LOGIN_WINDOW_SECONDS = 10 * 60

_login_attempts: dict[str, list[float]] = {}


def check_login_rate_limit(ip: str) -> None:
    now = time.time()
    hits = [
        t for t in _login_attempts.get(ip, [])
        if now - t < LOGIN_WINDOW_SECONDS
    ]
    if len(hits) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts — try again later"
        )
    hits.append(now)
    _login_attempts[ip] = hits


def client_ip(request: Request) -> str:
    try:
        # Behind nginx/Cloudflare every connection appears to come from
        # the proxy itself, which would lump all visitors into one rate
        # limit bucket. Trust X-Forwarded-For ONLY when you knowingly run
        # behind a proxy that sets it (TRUST_PROXY_HEADERS=1) — otherwise
        # clients could spoof the header to dodge the login throttle.
        if os.getenv("TRUST_PROXY_HEADERS") == "1":
            forwarded = request.headers.get("x-forwarded-for", "")
            first = forwarded.split(",")[0].strip()
            if first:
                return first
        return request.client.host if request.client else "unknown"
    except Exception:
        return "unknown"


def staggered_timestamp(index: int) -> str:
    """One-second-staggered `created_at` so gallery order (cover first)
    survives `order by created_at` even for bulk inserts that share a
    timestamp. Returns an ISO string the DB accepts."""
    return (
        datetime.now(timezone.utc) + timedelta(seconds=index)
    ).isoformat()


# =========================================================
# CATEGORIES (dynamic — new names auto-create a new tab
# in the Collections page)
# =========================================================
#
# Categories live in two places:
#   1. `products.category` (free-form text, always present)
#   2. `categories` table  (optional registry of known names)
#
# The `categories` table is optional. If it does not exist yet,
# every helper below degrades gracefully to distinct values from
# `products`. To persist the registry, run this once in Supabase:
#
#   create table if not exists categories (
#     id uuid primary key default gen_random_uuid(),
#     name text unique not null,
#     created_at timestamptz default now()
#   );
#

DEFAULT_CATEGORIES = ["Abayas", "Premium Collection"]

MAX_CATEGORY_LENGTH = 60

MAX_PRODUCT_NAME_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 2000
MAX_COLOR_LENGTH = 50


def validate_text_length(field: str, value: str, limit: int) -> str:
    """Trim + enforce a generous length cap (prevents DB bloat / stored-XSS payloads)."""
    cleaned = (value or "").strip()
    if len(cleaned) > limit:
        raise HTTPException(
            status_code=400,
            detail=f"{field} must be under {limit} characters"
        )
    return cleaned


def normalize_category(raw: str | None) -> str:
    """Trim + collapse whitespace. Empty falls back to 'Abayas'."""
    cleaned = " ".join((raw or "").strip().split())
    return cleaned or "Abayas"


def validate_category(name: str) -> str:
    if len(name) < 2:
        raise HTTPException(
            status_code=400,
            detail="Category name must be at least 2 characters"
        )
    if len(name) > MAX_CATEGORY_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Category name must be under {MAX_CATEGORY_LENGTH} characters"
        )
    return name


def ensure_category_exists(name: str) -> None:
    """Insert `name` into the `categories` registry if missing.

    Best-effort only — silently ignored when the table does not
    exist yet (products.category remains the source of truth).
    """
    try:
        existing = (
            supabase
            .table("categories")
            .select("id")
            .eq("name", name)
            .limit(1)
            .execute()
        )
        if existing.data:
            return
        supabase.table("categories").insert({"name": name}).execute()
    except Exception:
        pass


def list_all_categories() -> List[str]:
    """Union of registry + distinct product categories (+ defaults)."""
    seen: List[str] = []
    seen_lower: set[str] = set()

    def add(name: object) -> None:
        if not isinstance(name, str):
            return
        cleaned = " ".join(name.strip().split())
        if not cleaned:
            return
        key = cleaned.lower()
        if key in seen_lower:
            return
        seen_lower.add(key)
        seen.append(cleaned)

    # 1. Registry first (if the table exists).
    try:
        reg = (
            supabase
            .table("categories")
            .select("name")
            .order("name", desc=False)
            .execute()
        )
        for row in reg.data or []:
            add(row.get("name"))
    except Exception:
        pass

    # 2. Distinct categories actually used by products.
    try:
        rows = (
            supabase
            .table("products")
            .select("category")
            .execute()
        )
        for row in rows.data or []:
            add(row.get("category"))
    except Exception:
        pass

    # 3. Defaults are always offered so the shop never looks empty.
    for d in DEFAULT_CATEGORIES:
        add(d)

    # Keep defaults first (in declared order), rest alphabetical.
    defaults = [c for c in DEFAULT_CATEGORIES if c.lower() in seen_lower]
    rest = sorted(
        [c for c in seen if c not in defaults],
        key=lambda s: s.lower()
    )
    return defaults + rest


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():
    return {
        "message": "Boutique Product API is running",
        "status": "ok"
    }



# =========================================================
# LIST CATEGORIES
# =========================================================
# Returns every known category so the frontend can render one
# tab per category inside the Collections page. New categories
# appear here automatically once a product uses them.

@app.get("/categories")
def get_categories():
    try:
        return {
            "categories": list_all_categories()
        }
    except Exception as e:
        raise internal_error("fetch categories", e)


# =========================================================
# CREATE CATEGORY
# =========================================================
# Explicitly register a category name. Product creation also
# auto-registers, so this endpoint is optional — useful for
# pre-creating an empty tab before its first product exists.

@app.post("/categories")
def create_category(
    name: str = Form(...),
    admin: str = Depends(require_admin),
):
    cleaned = normalize_category(name)
    validate_category(cleaned)
    ensure_category_exists(cleaned)
    return {
        "message": "Category ready",
        "category": cleaned,
        "categories": list_all_categories()
    }


# =========================================================
# ADMIN LOGIN (compare input against the stored hash)
# =========================================================
#
# NOTE: there is deliberately no setup endpoint — the first (and
# only) admin is created directly in SQL (see the `admins` table
# comment above). With no self-registration route, nobody can
# claim an admin account, before or after hosting goes live.
#

@app.post("/admin/login")
def admin_login(
    request: Request,
    password: str = Form(...),
    username: str = Form("admin"),
):
    check_login_rate_limit(client_ip(request))
    username = " ".join(username.strip().split()) or "admin"

    try:
        row = get_admin_row(username)
    except Exception as e:
        raise internal_error("admin login lookup", e)

    # Same message whether the user is missing or the password is
    # wrong, so callers can't enumerate usernames.
    if not row or not verify_password(password, row.get("password_hash") or ""):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    return {
        "ok": True,
        "message": "Login successful",
        "username": row.get("username"),
        "token": issue_admin_token(row.get("username") or username),
        "expires_in": TOKEN_TTL_SECONDS,
    }


# =========================================================
# ADMIN CHANGE PASSWORD (needs the current password)
# =========================================================

@app.post("/admin/change-password")
def admin_change_password(
    new_password: str = Form(...),
    admin: str = Depends(require_admin),
):
    # The bearer token already proves identity — no current password
    # needed. Username comes from the token, never from the caller.
    validate_new_password(new_password)

    try:
        row = get_admin_row(admin)
    except Exception as e:
        raise internal_error("admin password lookup", e)

    if not row:
        raise HTTPException(
            status_code=401,
            detail="Session expired — please sign in again"
        )

    try:
        (
            supabase
            .table("admins")
            .update({
                "password_hash": hash_password(new_password),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", row["id"])
            .execute()
        )
    except Exception as e:
        raise internal_error("admin password update", e)

    return {
        "message": "Password changed",
        "username": admin,
    }



# =========================================================
# CREATE PRODUCT
# =========================================================

@app.post("/products")
async def create_product(

    # IMPORTANT:
    # File parameter comes BEFORE the other parameters
    # to avoid Python's parameter-ordering error.

    images: List[UploadFile] = File(...),

    product_name: str = Form(...),

    description: str = Form(""),

    price: float = Form(...),

    offer_price: float | None = Form(None),

    quantity: int = Form(0),

    color: str = Form(""),

    category: str = Form("Abayas"),

    is_new: bool = Form(False),

    is_best_seller: bool = Form(False),

    admin: str = Depends(require_admin),

):

    # =====================================================
    # VALIDATE PRODUCT NAME
    # =====================================================

    product_name = validate_text_length(
        "Product name", product_name, MAX_PRODUCT_NAME_LENGTH
    )

    if not product_name:
        raise HTTPException(
            status_code=400,
            detail="Product name is required"
        )

    description = validate_text_length(
        "Description", description, MAX_DESCRIPTION_LENGTH
    )
    color = validate_text_length("Color", color, MAX_COLOR_LENGTH)


    # =====================================================
    # VALIDATE PRICE
    # =====================================================

    if price < 0:
        raise HTTPException(
            status_code=400,
            detail="Price cannot be negative"
        )


    # =====================================================
    # VALIDATE OFFER PRICE
    # =====================================================

    if offer_price is not None:

        if offer_price < 0:
            raise HTTPException(
                status_code=400,
                detail="Offer price cannot be negative"
            )

        if offer_price > price:
            raise HTTPException(
                status_code=400,
                detail="Offer price cannot be greater than price"
            )


    # =====================================================
    # VALIDATE QUANTITY
    # =====================================================

    if quantity < 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity cannot be negative"
        )


    # =====================================================
    # VALIDATE IMAGES
    # =====================================================

    if not images:
        raise HTTPException(
            status_code=400,
            detail="At least one image is required"
        )

    if len(images) > MAX_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_IMAGES} images are allowed"
        )


    # =====================================================
    # VALIDATE CATEGORY
    # (free-form — a brand-new name auto-creates a category
    #  and a new tab in the Collections page)
    # =====================================================

    category = validate_category(normalize_category(category))

    # Register it so GET /categories returns it even before
    # this product's images finish uploading.
    ensure_category_exists(category)


    # =====================================================
    # STEP 1
    # CREATE PRODUCT IN SUPABASE
    # =====================================================

    product_data = {
        "product_name": product_name,
        "description": description,
        "price": price,
        "offer_price": offer_price,
        "quantity": quantity,
        "color": color,
        "category": category,
        "is_new": is_new,
        "is_best_seller": is_best_seller
    }

    try:

        product_response = (
            supabase
            .table("products")
            .insert(product_data)
            .execute()
        )

    except Exception as e:

        raise internal_error("create product", e)


    if not product_response.data:

        raise HTTPException(
            status_code=500,
            detail="Product was not created"
        )


    product = product_response.data[0]

    product_id = product["id"]


    # =====================================================
    # STEP 2
    # UPLOAD IMAGES TO CLOUDINARY
    # =====================================================

    uploaded_images = []

    try:

        for image in images:

            # -------------------------------------------------
            # Validate image type
            # -------------------------------------------------

            if image.content_type not in ALLOWED_IMAGE_TYPES:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Invalid image type: "
                        f"{image.content_type}. "
                        f"Allowed types: JPG, PNG, WEBP."
                    )
                )


            # -------------------------------------------------
            # Validate filename
            # -------------------------------------------------

            if not image.filename:

                raise HTTPException(
                    status_code=400,
                    detail="Image filename is missing"
                )


            # -------------------------------------------------
            # Generate unique Cloudinary public ID
            # -------------------------------------------------

            unique_name = (
                f"{product_id}_"
                f"{uuid.uuid4().hex}"
            )


            # -------------------------------------------------
            # Enforce size cap, then upload to Cloudinary
            # -------------------------------------------------

            image_bytes = read_upload_capped(image)

            result = cloudinary.uploader.upload(

                io.BytesIO(image_bytes),

                folder="boutique/products",

                public_id=unique_name,

                resource_type="image",

                overwrite=False
            )


            # -------------------------------------------------
            # Get Cloudinary information
            # -------------------------------------------------

            image_url = result["secure_url"]

            public_id = result["public_id"]


            # -------------------------------------------------
            # Store information temporarily
            # (staggered created_at keeps upload order = gallery
            # order under `order by created_at`)
            # -------------------------------------------------

            uploaded_images.append({
                "product_id": product_id,
                "image_url": image_url,
                "public_id": public_id,
                "created_at": staggered_timestamp(len(uploaded_images))
            })


    # =====================================================
    # ROLLBACK IF IMAGE VALIDATION FAILS
    # =====================================================

    except HTTPException:

        # Delete any images already uploaded

        for uploaded in uploaded_images:

            try:

                cloudinary.uploader.destroy(
                    uploaded["public_id"]
                )

            except Exception:
                pass


        # Delete product

        try:

            (
                supabase
                .table("products")
                .delete()
                .eq("id", product_id)
                .execute()
            )

        except Exception:
            pass


        raise


    # =====================================================
    # ROLLBACK IF CLOUDINARY UPLOAD FAILS
    # =====================================================

    except Exception as e:

        # Delete uploaded Cloudinary images

        for uploaded in uploaded_images:

            try:

                cloudinary.uploader.destroy(
                    uploaded["public_id"]
                )

            except Exception:
                pass


        # Delete product from Supabase

        try:

            (
                supabase
                .table("products")
                .delete()
                .eq("id", product_id)
                .execute()
            )

        except Exception:
            pass


        raise internal_error("create product image upload", e)


    # =====================================================
    # STEP 3
    # SAVE IMAGE INFORMATION IN SUPABASE
    # =====================================================

    try:

        image_response = (
            supabase
            .table("product_images")
            .insert(uploaded_images)
            .execute()
        )

    except Exception as e:

        # -------------------------------------------------
        # Delete Cloudinary images
        # -------------------------------------------------

        for uploaded in uploaded_images:

            try:

                cloudinary.uploader.destroy(
                    uploaded["public_id"]
                )

            except Exception:
                pass


        # -------------------------------------------------
        # Delete product
        # -------------------------------------------------

        try:

            (
                supabase
                .table("products")
                .delete()
                .eq("id", product_id)
                .execute()
            )

        except Exception:
            pass


        raise internal_error("create product save images", e)


    # =====================================================
    # RETURN CREATED PRODUCT
    # =====================================================

    return {
        "message": "Product created successfully",
        "product": product,
        "images": image_response.data
    }


# =========================================================
# GET ALL PRODUCTS
# =========================================================

@app.get("/products")
def get_products(limit: int = 100, offset: int = 0):

    # Bounded pagination — defaults preserve the old "return all"
    # behaviour for existing clients while preventing unbounded
    # full-table + N+1 image fan-out on large catalogs.
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    try:

        products_response = (
            supabase
            .table("products")
            .select("*")
            .order(
                "created_at",
                desc=True
            )
            .range(offset, offset + limit - 1)
            .execute()
        )


        products = products_response.data or []
        product_ids = [p["id"] for p in products if p.get("id")]

        images_by_product: dict[str, list] = {pid: [] for pid in product_ids}
        if product_ids:
            images_response = (
                supabase
                .table("product_images")
                .select("*")
                .in_("product_id", product_ids)
                .order("created_at", desc=False)
                .execute()
            )
            for img in images_response.data or []:
                images_by_product.setdefault(img["product_id"], []).append(img)

        for product in products:
            product["images"] = images_by_product.get(product["id"], [])


        return {
            "products": products
        }


    except Exception as e:

        raise internal_error("fetch products", e)


# =========================================================
# GET SINGLE PRODUCT
# =========================================================

@app.get("/products/{product_id}")
def get_product(product_id: str):

    try:

        product_response = (
            supabase
            .table("products")
            .select("*")
            .eq(
                "id",
                product_id
            )
            .execute()
        )


        if not product_response.data:

            raise HTTPException(
                status_code=404,
                detail="Product not found"
            )


        product = product_response.data[0]


        # -------------------------------------------------
        # Get product images
        # -------------------------------------------------

        images_response = (
            supabase
            .table("product_images")
            .select("*")
            .eq(
                "product_id",
                product_id
            )
            .order(
                "created_at",
                desc=False
            )
            .execute()
        )


        product["images"] = images_response.data


        return product


    except HTTPException:

        raise


    except Exception as e:

        raise internal_error("fetch product", e)


# =========================================================
# UPDATE PRODUCT
# =========================================================

@app.put("/products/{product_id}")
def update_product(

    product_id: str,

    product_name: str = Form(...),

    description: str = Form(""),

    price: float = Form(...),

    offer_price: float | None = Form(None),

    quantity: int = Form(0),

    color: str = Form(""),

    category: str = Form("Abayas"),

    is_new: bool = Form(False),

    is_best_seller: bool = Form(False),

    admin: str = Depends(require_admin),

):

    # =====================================================
    # VALIDATE PRODUCT NAME
    # =====================================================

    product_name = validate_text_length(
        "Product name", product_name, MAX_PRODUCT_NAME_LENGTH
    )

    if not product_name:

        raise HTTPException(
            status_code=400,
            detail="Product name is required"
        )

    description = validate_text_length(
        "Description", description, MAX_DESCRIPTION_LENGTH
    )
    color = validate_text_length("Color", color, MAX_COLOR_LENGTH)


    # =====================================================
    # VALIDATE PRICE
    # =====================================================

    if price < 0:

        raise HTTPException(
            status_code=400,
            detail="Price cannot be negative"
        )


    # =====================================================
    # VALIDATE OFFER PRICE
    # =====================================================

    if offer_price is not None:

        if offer_price < 0:

            raise HTTPException(
                status_code=400,
                detail="Offer price cannot be negative"
            )

        if offer_price > price:

            raise HTTPException(
                status_code=400,
                detail="Offer price cannot be greater than price"
            )



    # =====================================================
    # VALIDATE QUANTITY
    # =====================================================

    if quantity < 0:

        raise HTTPException(
            status_code=400,
            detail="Quantity cannot be negative"
        )


    # =====================================================
    # VALIDATE CATEGORY
    # (renaming to a brand-new name creates that category)
    # =====================================================

    category = validate_category(normalize_category(category))

    ensure_category_exists(category)


    # =====================================================
    # UPDATE DATA
    # =====================================================

    update_data = {

        "product_name": product_name,

        "description": description,

        "price": price,

        "offer_price": offer_price,

        "quantity": quantity,

        "color": color,

        "category": category,

        "is_new": is_new,

        "is_best_seller": is_best_seller
    }


    # =====================================================
    # UPDATE SUPABASE
    # =====================================================

    try:

        response = (
            supabase
            .table("products")
            .update(update_data)
            .eq(
                "id",
                product_id
            )
            .execute()
        )


        if not response.data:

            raise HTTPException(
                status_code=404,
                detail="Product not found"
            )


        return {

            "message": "Product updated successfully",

            "product": response.data[0]

        }


    except HTTPException:

        raise


    except Exception as e:

        raise internal_error("update product", e)


# =========================================================
# ADD IMAGES TO PRODUCT
# =========================================================

@app.post("/products/{product_id}/images")
async def add_product_images(
    product_id: str,
    images: List[UploadFile] = File(...),
    admin: str = Depends(require_admin),
):

    # -------------------------------------------------
    # Check product exists
    # -------------------------------------------------

    product_response = (
        supabase
        .table("products")
        .select("id")
        .eq("id", product_id)
        .execute()
    )

    if not product_response.data:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    if not images:
        raise HTTPException(
            status_code=400,
            detail="At least one image is required"
        )

    # -------------------------------------------------
    # Check total image limit (existing + new)
    # -------------------------------------------------

    existing = (
        supabase
        .table("product_images")
        .select("id")
        .eq("product_id", product_id)
        .execute()
    )

    existing_count = len(existing.data or [])

    if existing_count + len(images) > MAX_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_IMAGES} images per product. Currently {existing_count}, trying to add {len(images)}."
        )

    uploaded_images = []

    try:

        for image in images:

            if image.content_type not in ALLOWED_IMAGE_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Invalid image type: "
                        f"{image.content_type}. "
                        f"Allowed types: JPG, PNG, WEBP."
                    )
                )

            if not image.filename:
                raise HTTPException(
                    status_code=400,
                    detail="Image filename is missing"
                )

            unique_name = (
                f"{product_id}_"
                f"{uuid.uuid4().hex}"
            )

            image_bytes = read_upload_capped(image)

            result = cloudinary.uploader.upload(
                io.BytesIO(image_bytes),
                folder="boutique/products",
                public_id=unique_name,
                resource_type="image",
                overwrite=False
            )

            uploaded_images.append({
                "product_id": product_id,
                "image_url": result["secure_url"],
                "public_id": result["public_id"],
                "created_at": staggered_timestamp(
                    existing_count + len(uploaded_images)
                )
            })

    except HTTPException:
        for uploaded in uploaded_images:
            try:
                cloudinary.uploader.destroy(uploaded["public_id"])
            except Exception:
                pass
        raise

    except Exception as e:
        for uploaded in uploaded_images:
            try:
                cloudinary.uploader.destroy(uploaded["public_id"])
            except Exception:
                pass
        raise internal_error("add product images upload", e)

    try:
        image_response = (
            supabase
            .table("product_images")
            .insert(uploaded_images)
            .execute()
        )
    except Exception as e:
        for uploaded in uploaded_images:
            try:
                cloudinary.uploader.destroy(uploaded["public_id"])
            except Exception:
                pass
        raise internal_error("add product images save", e)

    return {
        "message": "Images added successfully",
        "images": image_response.data
    }


# =========================================================
# REORDER PRODUCT IMAGES (gallery order, cover first)
# =========================================================
# Gallery order is `order by created_at`, so reordering rewrites
# staggered timestamps — no schema migration needed.

@app.put("/products/{product_id}/images/order")
def reorder_product_images(
    product_id: str,
    image_ids: List[str] = Body(..., embed=True),
    admin: str = Depends(require_admin),
):
    if not image_ids:
        raise HTTPException(
            status_code=400,
            detail="At least one image id is required"
        )

    if len(image_ids) > MAX_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_IMAGES} images per product"
        )

    try:
        existing = (
            supabase
            .table("product_images")
            .select("id")
            .eq("product_id", product_id)
            .execute()
        )
    except Exception as e:
        raise internal_error("reorder images lookup", e)

    known = {str(row["id"]) for row in existing.data or []}
    seen: set[str] = set()

    for image_id in image_ids:
        if image_id in seen:
            raise HTTPException(
                status_code=400,
                detail="Duplicate image id in order"
            )
        seen.add(image_id)
        if image_id not in known:
            raise HTTPException(
                status_code=400,
                detail="All image ids must belong to this product"
            )

    try:
        for index, image_id in enumerate(image_ids):
            (
                supabase
                .table("product_images")
                .update({"created_at": staggered_timestamp(index)})
                .eq("id", image_id)
                .execute()
            )
    except Exception as e:
        raise internal_error("reorder images update", e)

    try:
        ordered = (
            supabase
            .table("product_images")
            .select("*")
            .eq("product_id", product_id)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as e:
        raise internal_error("reorder images readback", e)

    return {
        "message": "Image order saved",
        "images": ordered.data
    }


# =========================================================
# DELETE SINGLE PRODUCT IMAGE
# =========================================================

@app.delete("/product-images/{image_id}")
def delete_product_image(
    image_id: str,
    admin: str = Depends(require_admin),
):

    # -------------------------------------------------
    # Find image row
    # -------------------------------------------------

    img_response = (
        supabase
        .table("product_images")
        .select("*")
        .eq("id", image_id)
        .execute()
    )

    if not img_response.data:
        raise HTTPException(
            status_code=404,
            detail="Image not found"
        )

    img = img_response.data[0]
    product_id = img["product_id"]

    # -------------------------------------------------
    # Prevent deleting the last image
    # -------------------------------------------------

    count_response = (
        supabase
        .table("product_images")
        .select("id")
        .eq("product_id", product_id)
        .execute()
    )

    if len(count_response.data or []) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the last image. Add a replacement first."
        )

    # -------------------------------------------------
    # Delete from Cloudinary (ignore errors)
    # -------------------------------------------------

    try:
        cloudinary.uploader.destroy(img["public_id"])
    except Exception:
        pass

    # -------------------------------------------------
    # Delete DB row
    # -------------------------------------------------

    try:
        (
            supabase
            .table("product_images")
            .delete()
            .eq("id", image_id)
            .execute()
        )
    except Exception as e:
        raise internal_error("delete product image", e)

    return {
        "message": "Image deleted successfully",
        "image_id": image_id,
        "product_id": product_id
    }


# =========================================================
# DELETE PRODUCT
# =========================================================

@app.delete("/products/{product_id}")
def delete_product(
    product_id: str,
    admin: str = Depends(require_admin),
):

    try:

        # =================================================
        # STEP 1
        # CHECK PRODUCT EXISTS
        # =================================================

        product_response = (
            supabase
            .table("products")
            .select("id")
            .eq(
                "id",
                product_id
            )
            .execute()
        )


        if not product_response.data:

            raise HTTPException(
                status_code=404,
                detail="Product not found"
            )


        # =================================================
        # STEP 2
        # GET PRODUCT IMAGES
        # =================================================

        images_response = (
            supabase
            .table("product_images")
            .select("public_id")
         
            .eq(
                "product_id",
                product_id
            )
            .execute()
        )


        # =================================================
        # STEP 3
        # DELETE CLOUDINARY IMAGES
        # =================================================

        for image in images_response.data:

            try:

                cloudinary.uploader.destroy(
                    image["public_id"]
                )

            except Exception:

                pass


        # =================================================
        # STEP 4
        # DELETE PRODUCT
        # =================================================

        (
            supabase
            .table("products")
            .delete()
            .eq(
                "id",
                product_id
            )
            .execute()
        )


        return {

            "message": "Product deleted successfully",

            "product_id": product_id

        }


    except HTTPException:

        raise


    except Exception as e:

        raise internal_error("delete product", e)