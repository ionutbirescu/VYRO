import pytest
from fastapi.testclient import TestClient

from app.models import User
from app.routers import shop
from tests.conftest import auth


def fake_receipt(monkeypatch: pytest.MonkeyPatch, product_ids: set[str]) -> None:
    monkeypatch.setattr(shop, "_receipt_product_ids", lambda receipt: product_ids)


def test_iap_grants_a_product_found_anywhere_in_the_receipt(
    db_client: TestClient, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The receipt lists every purchase of the app; the newest one may be something else.
    fake_receipt(
        monkeypatch,
        {"com.ionutbirescu.vyro.gold_frame", "com.ionutbirescu.vyro.night_theme"},
    )

    response = db_client.post(
        "/v1/shop/iap/validate",
        headers=auth(),
        json={"product_code": "cosmetic_frame_gold", "receipt": "base64", "platform": "ios"},
    )

    assert response.status_code == 201, response.text
    cosmetics = response.json()["entitlements"]["cosmetics"]
    assert [c["code"] for c in cosmetics] == ["cosmetic_frame_gold"]


def test_iap_rejects_a_receipt_without_the_product(
    db_client: TestClient, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_receipt(monkeypatch, {"com.ionutbirescu.vyro.night_theme"})

    response = db_client.post(
        "/v1/shop/iap/validate",
        headers=auth(),
        json={"product_code": "cosmetic_frame_gold", "receipt": "base64", "platform": "ios"},
    )

    assert response.status_code == 400
    assert db_client.get("/v1/me/entitlements", headers=auth()).json()["cosmetics"] == []
