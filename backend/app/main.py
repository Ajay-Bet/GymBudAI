"""GymBud API entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.api.coach import router as coach_router
from app.core.config import CoachSettings, load_settings
from app.services.coach import CoachService


def create_app(settings: CoachSettings | None = None, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    coach = CoachService(settings if settings is not None else load_settings(), transport=transport)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await coach.aclose()

    application = FastAPI(title="GymBud API", version="0.1.0", lifespan=lifespan)
    application.state.coach = coach

    @application.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Confirm the API process is responding."""
        return {"status": "ok"}

    application.include_router(coach_router)
    return application


app = create_app()
