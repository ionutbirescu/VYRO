from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.auth import CurrentUser
from app.db import DbSession
from app.enums import AcquiredVia, PriceVariant, ProductKind
from app.models import Purchase, User, UserCosmetic
from app.schemas.shop import (
    CheckoutRequest,
    CheckoutResult,
    Entitlements,
    OwnedCosmetic,
    Product,
    ProductList,
)

router = APIRouter(tags=["shop"])

CURRENCY = "USD"
PLUS_DURATION = timedelta(days=31)


@dataclass(frozen=True)
class _Def:
    kind: ProductKind
    name: str
    description: str
    price_a: int
    price_b: int


CATALOG: dict[str, _Def] = {
    "plus_monthly": _Def(
        kind=ProductKind.SUBSCRIPTION,
        name="ChallengeMe+",
        description="Unlimited AI generation, coaching and verification",
        price_a=99,
        price_b=199,
    ),
    "challenge_pack_30": _Def(
        kind=ProductKind.ONE_TIME,
        name="30-Day Challenge Pack",
        description="A personalized 30-day program, crafted by AI for you",
        price_a=99,
        price_b=99,
    ),
    "cosmetic_frame_gold": _Def(
        kind=ProductKind.COSMETIC,
        name="Gold Frame",
        description="A shimmering gold profile frame",
        price_a=99,
        price_b=99,
    ),
    "cosmetic_theme_night": _Def(
        kind=ProductKind.COSMETIC,
        name="Night Theme",
        description="A dark cosmic profile theme",
        price_a=99,
        price_b=99,
    ),
}


def _price(defn: _Def, variant: PriceVariant) -> int:
    return defn.price_a if variant is PriceVariant.A else defn.price_b


def _is_plus(user: User, now: datetime) -> bool:
    return user.plus_until is not None and user.plus_until > now


def _owned(db, user: User, code: str, defn: _Def, now: datetime) -> bool:
    if defn.kind is ProductKind.SUBSCRIPTION:
        return _is_plus(user, now)
    if defn.kind is ProductKind.COSMETIC:
        return (
            db.scalar(
                select(UserCosmetic).where(
                    UserCosmetic.user_id == user.id,
                    UserCosmetic.cosmetic_code == code,
                )
            )
            is not None
        )
    return (
        db.scalar(
            select(Purchase).where(
                Purchase.user_id == user.id,
                Purchase.product_code == code,
            )
        )
        is not None
    )


def _entitlements(db, user: User, now: datetime) -> Entitlements:
    cosmetics = list(db.scalars(select(UserCosmetic).where(UserCosmetic.user_id == user.id)))
    return Entitlements(
        is_plus=_is_plus(user, now),
        plus_until=user.plus_until,
        cosmetics=[
            OwnedCosmetic(
                code=c.cosmetic_code,
                acquired_via=c.acquired_via,
                equipped=c.equipped,
            )
            for c in cosmetics
        ],
    )


@router.get("/shop/products")
def list_products(user: CurrentUser, db: DbSession) -> ProductList:
    now = datetime.now(UTC)
    return ProductList(
        items=[
            Product(
                code=code,
                kind=defn.kind,
                name=defn.name,
                description=defn.description,
                price_cents=_price(defn, user.price_variant),
                currency=CURRENCY,
                owned=_owned(db, user, code, defn, now),
            )
            for code, defn in CATALOG.items()
        ]
    )


@router.post("/shop/checkout", status_code=status.HTTP_201_CREATED)
def checkout(body: CheckoutRequest, user: CurrentUser, db: DbSession) -> CheckoutResult:
    """Sandbox purchase: records the purchase and grants it, with no real payment."""
    defn = CATALOG.get(body.product_code)
    if defn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    now = datetime.now(UTC)
    price = _price(defn, user.price_variant)
    purchase = Purchase(
        user_id=user.id,
        product_code=body.product_code,
        price_cents=price,
        currency=CURRENCY,
        price_variant=user.price_variant,
        sandbox=True,
    )
    db.add(purchase)
    if defn.kind is ProductKind.SUBSCRIPTION:
        base = user.plus_until if user.plus_until and user.plus_until > now else now
        user.plus_until = base + PLUS_DURATION
    elif defn.kind is ProductKind.COSMETIC:
        already = db.scalar(
            select(UserCosmetic).where(
                UserCosmetic.user_id == user.id,
                UserCosmetic.cosmetic_code == body.product_code,
            )
        )
        if not already:
            db.add(
                UserCosmetic(
                    user_id=user.id,
                    cosmetic_code=body.product_code,
                    acquired_via=AcquiredVia.PURCHASED,
                    equipped=False,
                )
            )
    db.flush()
    db.commit()
    return CheckoutResult(
        purchase_id=purchase.id,
        product_code=body.product_code,
        price_cents=price,
        currency=CURRENCY,
        sandbox=True,
        entitlements=_entitlements(db, user, datetime.now(UTC)),
    )


@router.get("/me/entitlements")
def get_entitlements(user: CurrentUser, db: DbSession) -> Entitlements:
    return _entitlements(db, user, datetime.now(UTC))


@router.put("/me/cosmetics/{cosmetic_code}/equipped")
def equip_cosmetic(cosmetic_code: str, user: CurrentUser, db: DbSession) -> Entitlements:
    cosmetic = db.scalar(
        select(UserCosmetic).where(
            UserCosmetic.user_id == user.id,
            UserCosmetic.cosmetic_code == cosmetic_code,
        )
    )
    if cosmetic is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cosmetic not owned")
    for c in db.scalars(select(UserCosmetic).where(UserCosmetic.user_id == user.id)):
        c.equipped = c.cosmetic_code == cosmetic_code
    db.commit()
    return _entitlements(db, user, datetime.now(UTC))
