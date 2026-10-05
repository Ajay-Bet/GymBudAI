"""Request dependencies: database session and the authenticated user."""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.models import AuthSession, User
from app.services.auth import AuthService
from app.services.errors import not_authenticated

_BEARER = re.compile(r"^Bearer ([A-Za-z0-9_\-]{16,256})$", re.IGNORECASE)


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth


@dataclass(frozen=True)
class CurrentAuth:
    user: User
    session: AuthSession


def bearer_token(request: Request) -> str:
    header = request.headers.get("authorization")
    if not header:
        raise not_authenticated()
    match = _BEARER.match(header.strip())
    if match is None:
        raise not_authenticated("Malformed Authorization header; expected 'Bearer <token>'.")
    return match.group(1)


def current_auth(
    db: Annotated[Session, Depends(get_db)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    token: Annotated[str, Depends(bearer_token)],
) -> CurrentAuth:
    user, session = auth.authenticate(db, token)
    return CurrentAuth(user=user, session=session)


DbSession = Annotated[Session, Depends(get_db)]
Auth = Annotated[CurrentAuth, Depends(current_auth)]
AuthSvc = Annotated[AuthService, Depends(get_auth_service)]
