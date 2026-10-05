"""Accounts and bearer sessions (GB 501)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import EmailStr, Field, StringConstraints, field_validator

from app.schemas.common import InModel, OutModel

PASSWORD_MIN = 10
PASSWORD_MAX = 128


class RegisterIn(InModel):
    email: EmailStr = Field(max_length=254)
    password: Annotated[str, StringConstraints(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)]
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None

    @field_validator("email")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("display_name")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return value or None


class LoginIn(InModel):
    # Not validated as an email: any mismatch is the same uniform 401.
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=320)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=1024)]


class UserOut(OutModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    created_at: datetime


class TokenOut(OutModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    user: UserOut
