"""GymBud API entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from app.api.auth import router as auth_router
from app.api.coach import router as coach_router
from app.api.exercises import router as exercises_router
from app.api.users import router as users_router
from app.api.workouts import router as workouts_router
from app.core.config import AppSettings, CoachSettings, load_app_settings, load_settings
from app.core.limits import BodySizeLimitMiddleware
from app.database import create_db_engine, create_session_factory
from app.services.auth import AuthService
from app.services.coach import CoachService

logger = logging.getLogger("app.database")

UNAVAILABLE = {"detail": {"code": "database-unavailable", "message": "Saved workouts are temporarily unavailable. Try again."}}
INTERNAL = {"detail": {"code": "internal-error", "message": "Something went wrong on the server."}}


def _database_error(_: Request, exc: Exception) -> JSONResponse:
    # Log only exception classes: messages can include host names, SQL or submitted values.
    orig = getattr(exc, "orig", None)
    unavailable = isinstance(exc, (OperationalError, InterfaceError, PoolTimeoutError)) or bool(
        getattr(exc, "connection_invalidated", False)
    )
    logger.warning("database %s (%s%s)", "unavailable" if unavailable else "error", type(exc).__name__,
                   f": {type(orig).__name__}" if orig is not None else "")
    if unavailable:
        return JSONResponse(UNAVAILABLE, status_code=503, headers={"Retry-After": "5"})
    return JSONResponse(INTERNAL, status_code=500)


def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's 422 shape without the `input` echo (it would repeat passwords and whole payloads).
    errors = [{k: v for k, v in error.items() if k != "input"} for error in exc.errors()]
    return JSONResponse({"detail": jsonable_encoder(errors)}, status_code=422)


def create_app(
    settings: CoachSettings | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    *,
    app_settings: AppSettings | None = None,
    engine: Engine | None = None,
) -> FastAPI:
    coach = CoachService(settings if settings is not None else load_settings(), transport=transport)
    app_settings = app_settings if app_settings is not None else load_app_settings()
    owns_engine = engine is None
    engine = engine if engine is not None else create_db_engine(app_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await coach.aclose()
        if owns_engine:
            engine.dispose()

    application = FastAPI(title="GymBud API", version="0.2.0", lifespan=lifespan)
    application.state.coach = coach
    application.state.app_settings = app_settings
    application.state.engine = engine
    application.state.session_factory = create_session_factory(engine)
    application.state.auth = AuthService(app_settings)

    application.add_exception_handler(RequestValidationError, _validation_error)
    for exc_type in (DBAPIError, PoolTimeoutError):
        application.add_exception_handler(exc_type, _database_error)

    application.add_middleware(BodySizeLimitMiddleware)
    if app_settings.cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=list(app_settings.cors_origins),
            allow_methods=["GET", "POST", "PATCH"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @application.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Confirm the API process is responding (does not check the database)."""
        return {"status": "ok"}

    application.include_router(coach_router)
    application.include_router(auth_router)
    application.include_router(users_router)
    application.include_router(exercises_router)
    application.include_router(workouts_router)
    return application


app = create_app()
