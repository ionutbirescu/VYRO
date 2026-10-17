from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.enums import AcquiredVia, ProductKind
from app.schemas.common import Count, Schema


class Product(Schema):
    code: str
    kind: ProductKind
    name: str
    description: str
    price_cents: Count = Field(description="Price for the user's A/B price variant")
    currency: str
    owned: bool


class ProductList(Schema):
    items: list[Product]


class CheckoutRequest(Schema):
    product_code: str


class OwnedCosmetic(Schema):
    code: str
    acquired_via: AcquiredVia
    equipped: bool


class Entitlements(Schema):
    is_plus: bool
    plus_until: datetime | None
    cosmetics: list[OwnedCosmetic]


class CheckoutResult(Schema):
    purchase_id: UUID
    product_code: str
    price_cents: Count
    currency: str
    sandbox: Literal[True] = Field(default=True, description="Always true; no money moves")
    entitlements: Entitlements
