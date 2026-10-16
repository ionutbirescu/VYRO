from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.shop import CheckoutRequest, CheckoutResult, Entitlements, ProductList

router = APIRouter(tags=["shop"])


@router.get("/shop/products")
def list_products(user: CurrentUser, db: DbSession) -> ProductList:
    not_implemented()


@router.post("/shop/checkout", status_code=status.HTTP_201_CREATED)
def checkout(body: CheckoutRequest, user: CurrentUser, db: DbSession) -> CheckoutResult:
    """Sandbox purchase: records the purchase and grants it, with no real payment."""
    not_implemented()


@router.get("/me/entitlements")
def get_entitlements(user: CurrentUser, db: DbSession) -> Entitlements:
    not_implemented()


@router.put("/me/cosmetics/{cosmetic_code}/equipped")
def equip_cosmetic(cosmetic_code: str, user: CurrentUser, db: DbSession) -> Entitlements:
    not_implemented()
