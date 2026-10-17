from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    """Response model that can be built straight from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    detail: str


class HealthStatus(BaseModel):
    status: Literal["ok"]
    version: str


Difficulty = Annotated[int, Field(ge=1, le=5, description="1 = easy, 5 = extreme")]

DurationDays = Literal[1, 7, 14, 30]

Limit = Annotated[int, Field(ge=1, le=50)]
