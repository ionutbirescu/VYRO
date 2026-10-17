from typing import NoReturn

from fastapi import HTTPException, status


def not_implemented() -> NoReturn:
    """Placeholder for endpoints that are in the contract but not built yet."""
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Not implemented yet")
