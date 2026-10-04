"""`/api/coach/*`: optional OpenAI voice and wording for curl coaching (Sprint 4 extension)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.schemas.coach import CoachStatus, TtsRequest, WordingRequest, WordingResponse
from app.services.coach import CoachError, CoachService

router = APIRouter(prefix="/api/coach", tags=["coach"])

TTS_BODY_MAX = 2 * 1024
WORDING_BODY_MAX = 8 * 1024

M = TypeVar("M", bound=BaseModel)


def _service(request: Request) -> CoachService:
    return request.app.state.coach


def _error(exc: CoachError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status, headers=exc.headers)


async def _read_body(request: Request, model: type[M], limit: int) -> M:
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or len(declared) > 10 or int(declared) > limit):
        raise CoachError(413, "request-too-large")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise CoachError(413, "request-too-large")
        body.extend(chunk)
    try:
        return model.model_validate_json(bytes(body))
    except ValidationError:
        raise CoachError(422, "invalid-request") from None


@router.get("/status", response_model=CoachStatus)
async def coach_status(request: Request) -> dict[str, bool]:
    """Whether AI voice / wording are available (a key is configured). Never returns the key."""
    return _service(request).status()


@router.post(
    "/tts",
    response_class=Response,
    responses={200: {"content": {"audio/mpeg": {}}, "description": "AI-generated speech (MP3)."}},
)
async def coach_tts(request: Request) -> Response:
    """Body `{text: 1-300 chars, purpose: 'cue'|'narration'}` -> `audio/mpeg`."""
    try:
        service = _service(request)
        if not service.settings.configured:
            raise CoachError(503, "not-configured")
        payload = await _read_body(request, TtsRequest, TTS_BODY_MAX)
        audio, hit = await service.tts(payload)
    except CoachError as exc:
        return _error(exc)
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "X-Coach-Cache": "hit" if hit else "miss", "X-AI-Generated": "true"},
    )


@router.post("/wording", response_model=WordingResponse)
async def coach_wording(request: Request):
    """Body: structured findings and score only. Returns validated grounded wording."""
    try:
        service = _service(request)
        if not service.settings.configured:
            raise CoachError(503, "not-configured")
        facts = await _read_body(request, WordingRequest, WORDING_BODY_MAX)
        result = await service.wording(facts)
    except CoachError as exc:
        return _error(exc)
    return JSONResponse(result.model_dump(), headers={"Cache-Control": "no-store"})
