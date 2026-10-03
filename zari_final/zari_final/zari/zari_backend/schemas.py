from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProductImageResponse(BaseModel):

    id: str

    product_id: str

    image_url: str

    public_id: str

    created_at: Optional[datetime] = None


class ProductResponse(BaseModel):

    id: str

    product_name: str

    description: Optional[str] = None

    price: float

    offer_price: Optional[float] = None

    quantity: int

    color: Optional[str] = None

    created_at: Optional[datetime] = None

    updated_at: Optional[datetime] = None

    images: list[ProductImageResponse] = []