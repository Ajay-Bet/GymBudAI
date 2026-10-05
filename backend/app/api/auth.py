"""`/api/auth/*`: register, login, logout (GB 501)."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.api.deps import Auth, AuthSvc, DbSession
from app.schemas.auth import LoginIn, RegisterIn, TokenOut, UserOut
from app.services.auth import IssuedSession

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token(issued: IssuedSession) -> TokenOut:
    return TokenOut(access_token=issued.token, expires_at=issued.session.expires_at, user=UserOut.model_validate(issued.user))


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: DbSession, auth: AuthSvc) -> TokenOut:
    """Create an account and sign it in. 409 `email-taken`."""
    return _token(auth.register(db, body))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: DbSession, auth: AuthSvc) -> TokenOut:
    """401 `invalid-credentials` (uniform), 429 `rate-limited`."""
    client_ip = request.client.host if request.client else "unknown"
    return _token(auth.login(db, body, client_ip))


@router.post("/logout", status_code=204, response_class=Response)
def logout(current: Auth, db: DbSession, auth: AuthSvc) -> Response:
    """Revoke the presented bearer token."""
    auth.logout(db, current.session)
    return Response(status_code=204)
