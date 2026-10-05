"""Backend configuration (coaching proxy, database, sessions, CORS), read from the environment and an optional `backend/.env`.

The OpenAI key is held only here and in the outgoing Authorization header. It is never logged,
returned to clients or included in error messages.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_DIR / ".env"

DEFAULT_TTS_MODEL = "gpt-4o-mini-tts"
DEFAULT_TTS_VOICE = "marin"
DEFAULT_TEXT_MODEL = "gpt-4.1-mini"


def _clean(value: str | None) -> str:
    return (value or "").strip()


@dataclass(frozen=True)
class CoachSettings:
    api_key: str = field(default="", repr=False)
    tts_model: str = DEFAULT_TTS_MODEL
    tts_voice: str = DEFAULT_TTS_VOICE
    text_model: str = DEFAULT_TEXT_MODEL
    base_url: str = "https://api.openai.com/v1"
    tts_timeout_s: float = 10.0
    wording_timeout_s: float = 8.0
    tts_rate_per_minute: int = 30
    wording_rate_per_minute: int = 10
    tts_cache_size: int = 128

    @property
    def configured(self) -> bool:
        return bool(self.api_key)


def load_settings(env_file: Path | None = ENV_FILE) -> CoachSettings:
    """Load `backend/.env` (real environment variables take precedence), then read settings."""
    if env_file is not None and env_file.is_file():
        load_dotenv(env_file, override=False)
    return CoachSettings(
        api_key=_clean(os.environ.get("OPENAI_API_KEY")),
        tts_model=_clean(os.environ.get("OPENAI_TTS_MODEL")) or DEFAULT_TTS_MODEL,
        tts_voice=_clean(os.environ.get("OPENAI_TTS_VOICE")) or DEFAULT_TTS_VOICE,
        text_model=_clean(os.environ.get("OPENAI_TEXT_MODEL")) or DEFAULT_TEXT_MODEL,
    )


# ---------- Sprint 5: database, sessions and CORS ----------

DEFAULT_DATABASE_URL = "postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_dev"
DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://gymbud@127.0.0.1:5432/gymbud_test"


def _int(name: str, default: int, minimum: int = 0) -> int:
    raw = _clean(os.environ.get(name))
    if not raw:
        return default
    value = int(raw)
    if value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    return value


@dataclass(frozen=True)
class AppSettings:
    """Database, account-session and CORS settings. `database_url` may contain a password; it is
    excluded from repr and must only be logged through `safe_database_url`."""

    database_url: str = field(default=DEFAULT_DATABASE_URL, repr=False)
    test_database_url: str = field(default=DEFAULT_TEST_DATABASE_URL, repr=False)
    db_pool_size: int = 5
    db_max_overflow: int = 2
    db_pool_timeout_s: int = 10
    db_pool_recycle_s: int = 1800
    db_connect_timeout_s: int = 5
    db_statement_timeout_ms: int = 10_000
    auth_session_ttl_hours: int = 168
    login_rate_per_minute: int = 10
    cors_origins: tuple[str, ...] = ()

    @property
    def safe_database_url(self) -> str:
        from sqlalchemy.engine import make_url

        return make_url(self.database_url).render_as_string(hide_password=True)


def load_app_settings(env_file: Path | None = ENV_FILE) -> AppSettings:
    """Load `backend/.env` (real environment variables take precedence), then read settings."""
    if env_file is not None and env_file.is_file():
        load_dotenv(env_file, override=False)
    origins = tuple(o.strip() for o in _clean(os.environ.get("CORS_ORIGINS")).split(",") if o.strip())
    return AppSettings(
        database_url=_clean(os.environ.get("DATABASE_URL")) or DEFAULT_DATABASE_URL,
        test_database_url=_clean(os.environ.get("TEST_DATABASE_URL")) or DEFAULT_TEST_DATABASE_URL,
        db_pool_size=_int("DB_POOL_SIZE", 5, 1),
        db_max_overflow=_int("DB_MAX_OVERFLOW", 2, 0),
        db_pool_timeout_s=_int("DB_POOL_TIMEOUT_S", 10, 1),
        auth_session_ttl_hours=_int("AUTH_SESSION_TTL_HOURS", 168, 1),
        cors_origins=origins,
    )
