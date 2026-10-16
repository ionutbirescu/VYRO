from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.enums import AcquiredVia, ProductKind


class Product(BaseModel):
    code: str
    kind: ProductKind
    name: str
    description: str
    price_cents: int = Field(description="Price for the user's A/B price variant")
    currency: str
    owned: bool


class ProductList(BaseModel):
    items: list[Product]


class CheckoutRequest(BaseModel):
    product_code: str


class OwnedCosmetic(BaseModel):
    code: str
    acquired_via: AcquiredVia
    equipped: bool


class Entitlements(BaseModel):
    is_plus: bool
    plus_until: datetime | None
    cosmetics: list[OwnedCosmetic]


class CheckoutResult(BaseModel):
    purchase_id: UUID
    product_code: str
    price_cents: int
    currency: str
    sandbox: Literal[True] = Field(default=True, description="Always true; no money moves")
    entitlements: Entitlements
