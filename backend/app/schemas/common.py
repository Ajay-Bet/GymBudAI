"""Shared wire types for the Sprint 5 API. JSON is camelCase; Python is snake_case."""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from pydantic import AfterValidator, AwareDatetime, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

EARLIEST_WALL_TIME = datetime(2020, 1, 1, tzinfo=UTC)
MAX_CLOCK_SKEW = timedelta(minutes=5)


class InModel(BaseModel):
    """Request body: camelCase keys only, unknown keys rejected."""

    model_config = ConfigDict(alias_generator=to_camel, validate_by_alias=True, validate_by_name=False, extra="forbid")


class OutModel(BaseModel):
    """Response body: built by field name, serialized camelCase."""

    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_alias=True, validate_by_name=True, serialize_by_alias=True,
        from_attributes=True,
    )


def _number_only(value: Any) -> Any:
    # JSON numbers only: no strings, no booleans (lax float would coerce both).
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("must be a number")
    return value


def wall_time(value: datetime) -> datetime:
    """Aware timestamp, normalized to UTC, not before 2020 and at most 5 minutes in the future."""
    value = value.astimezone(UTC)
    if value < EARLIEST_WALL_TIME:
        raise ValueError("must not be before 2020-01-01T00:00:00Z")
    if value > datetime.now(UTC) + MAX_CLOCK_SKEW:
        raise ValueError("must not be more than 5 minutes in the future")
    return value


Number = Annotated[float, BeforeValidator(_number_only), Field(allow_inf_nan=False)]
Fraction = Annotated[float, BeforeValidator(_number_only), Field(ge=0, le=1, allow_inf_nan=False)]
NonNegNumber = Annotated[float, BeforeValidator(_number_only), Field(ge=0, allow_inf_nan=False)]
WallTime = Annotated[AwareDatetime, AfterValidator(wall_time)]
ClientId = Annotated[str, StringConstraints(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")]
VersionStr = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*$")]
Slug = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*$")]
TimezoneName = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_+\-]*(/[A-Za-z0-9_+\-]+)*$")]


def reject_non_finite(value: Any, path: str = "summary") -> None:
    """Raise if a JSON tree holds NaN/Infinity (Python's json parser accepts them; JSONB does not)."""
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{path} must not contain NaN or Infinity")
    if isinstance(value, dict):
        for key, item in value.items():
            reject_non_finite(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            reject_non_finite(item, f"{path}[{index}]")
