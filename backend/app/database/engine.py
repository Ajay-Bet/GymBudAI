"""SQLAlchemy engine with a bounded pool, pre-ping and a server-side statement timeout.

Pool budget per API process: `DB_POOL_SIZE + DB_MAX_OVERFLOW` connections. On Cloud Run, keep
max instances x (pool + overflow) below the Cloud SQL `max_connections` minus a reserve.
"""

from __future__ import annotations

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import AppSettings


def create_db_engine(settings: AppSettings, url: str | None = None) -> Engine:
    """Create (lazily connecting) engine. `url` overrides `settings.database_url` (tests)."""
    target = make_url(url or settings.database_url)
    connect_args: dict[str, object] = {}
    if target.get_backend_name() == "postgresql":
        connect_args = {
            "connect_timeout": settings.db_connect_timeout_s,
            "options": f"-c statement_timeout={settings.db_statement_timeout_ms} -c timezone=UTC",
        }
    return create_engine(
        target,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_s,
        pool_recycle=settings.db_pool_recycle_s,
        pool_pre_ping=True,
        hide_parameters=True,  # keep submitted values (emails, payloads) out of error messages/logs
        connect_args=connect_args,
    )


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
