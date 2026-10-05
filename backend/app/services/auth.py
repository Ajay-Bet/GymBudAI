"""Email + password accounts with opaque bearer sessions (GB 501).

- Argon2id via argon2-cffi `PasswordHasher()` defaults; rehash on login when parameters change.
- Token: `secrets.token_urlsafe(32)`; only its SHA-256 is stored. Fixed expiry (no sliding renewal).
- Login failures are one uniform 401 `invalid-credentials`; unknown emails still run a hash
  verification so timing does not reveal which emails exist.
"""

from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import AppSettings
from app.models import AuthSession, User
from app.schemas.auth import LoginIn, RegisterIn
from app.services.errors import api_error, not_authenticated


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class IssuedSession:
    token: str
    session: AuthSession
    user: User


class LoginRateLimiter:
    """Sliding one-minute window per (email, client IP), per process (prototype; not distributed)."""

    MAX_KEYS = 10_000

    def __init__(self, limit: int, clock: Callable[[], float] = time.monotonic, window_s: float = 60.0) -> None:
        self.limit = limit
        self.window_s = window_s
        self.clock = clock
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()

    def acquire(self, email: str, client_ip: str) -> None:
        now = self.clock()
        with self._lock:
            if len(self._hits) > self.MAX_KEYS:
                self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < self.window_s}
            hits = self._hits.setdefault((email, client_ip), deque())
            while hits and now - hits[0] >= self.window_s:
                hits.popleft()
            if len(hits) >= self.limit:
                retry = max(1, int(self.window_s - (now - hits[0])) + 1)
                raise api_error(429, "rate-limited", "Too many sign-in attempts. Try again shortly.", {"Retry-After": str(retry)})
            hits.append(now)


class AuthService:
    def __init__(self, settings: AppSettings, hasher: PasswordHasher | None = None) -> None:
        self.hasher = hasher or PasswordHasher()
        self.ttl = timedelta(hours=settings.auth_session_ttl_hours)
        self.rate_limiter = LoginRateLimiter(settings.login_rate_per_minute)
        self._dummy_hash: str | None = None  # computed on first unknown-email login

    def _issue(self, db: Session, user: User) -> IssuedSession:
        token = secrets.token_urlsafe(32)
        session = AuthSession(user_id=user.id, token_hash=hash_token(token), expires_at=datetime.now(UTC) + self.ttl)
        db.add(session)
        return IssuedSession(token=token, session=session, user=user)

    def register(self, db: Session, data: RegisterIn) -> IssuedSession:
        if db.scalar(select(User.id).where(User.email == data.email)) is not None:
            raise api_error(409, "email-taken", "An account with this email already exists.")
        user = User(email=data.email, password_hash=self.hasher.hash(data.password), display_name=data.display_name)
        db.add(user)
        try:
            db.flush()
            issued = self._issue(db, user)
            db.commit()
        except IntegrityError:
            db.rollback()
            raise api_error(409, "email-taken", "An account with this email already exists.") from None
        return issued

    def login(self, db: Session, data: LoginIn, client_ip: str) -> IssuedSession:
        self.rate_limiter.acquire(data.email, client_ip)
        user = db.scalar(select(User).where(User.email == data.email))
        if user is None:
            if self._dummy_hash is None:
                self._dummy_hash = self.hasher.hash(secrets.token_urlsafe(16))
            self._verify(self._dummy_hash, data.password)
            raise self._invalid()
        if not self._verify(user.password_hash, data.password):
            raise self._invalid()
        if self.hasher.check_needs_rehash(user.password_hash):
            user.password_hash = self.hasher.hash(data.password)
        issued = self._issue(db, user)
        db.commit()
        return issued

    def authenticate(self, db: Session, token: str) -> tuple[User, AuthSession]:
        row = db.execute(
            select(AuthSession, User).join(User, User.id == AuthSession.user_id).where(AuthSession.token_hash == hash_token(token))
        ).first()
        if row is None or row[0].revoked_at is not None:
            raise not_authenticated()
        session, user = row
        if session.expires_at <= datetime.now(UTC):
            raise not_authenticated("Your session has expired. Sign in again.", code="session-expired")
        return user, session

    def logout(self, db: Session, session: AuthSession) -> None:
        if session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
        db.commit()

    def _verify(self, password_hash: str, password: str) -> bool:
        try:
            return self.hasher.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False

    @staticmethod
    def _invalid():
        return api_error(401, "invalid-credentials", "Email or password is incorrect.", {"WWW-Authenticate": "Bearer"})
