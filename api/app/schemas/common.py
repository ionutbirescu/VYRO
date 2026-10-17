from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class Schema(BaseModel):
    """Base for every request and response body. Unknown fields are rejected, which also keeps
    them out of the contract (additionalProperties: false) and out of mock responses."""

    model_config = ConfigDict(extra="forbid")


class ApiModel(Schema):
    """Response model that can be built straight from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(Schema):
    detail: str


class HealthStatus(Schema):
    status: Literal["ok"]
    version: str


Count = Annotated[int, Field(ge=0)]

Level = Annotated[int, Field(ge=1)]

Difficulty = Annotated[int, Field(ge=1, le=5, description="1 = easy, 5 = extreme")]

DurationDays = Literal[1, 7, 14, 30]

Limit = Annotated[int, Field(ge=1, le=50)]
