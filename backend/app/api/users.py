"""`/api/users/me`."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import Auth
from app.schemas.auth import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(current: Auth) -> UserOut:
    return UserOut.model_validate(current.user)
