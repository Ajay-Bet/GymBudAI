"""Error helpers. Public shape: {"detail": {"code": "<kebab-code>", "message": "<text>"}}."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError


def api_error(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message}, headers=headers)


def not_authenticated(message: str = "Sign in to continue.", code: str = "not-authenticated") -> HTTPException:
    return api_error(401, code, message, {"WWW-Authenticate": "Bearer"})


def not_found() -> HTTPException:
    # Same answer for "does not exist" and "belongs to someone else" (no existence leak).
    return api_error(404, "not-found", "Workout not found.")


def validation_error(loc: list[str | int], message: str, error_type: str = "value_error") -> RequestValidationError:
    """A 422 in FastAPI's own validation shape, for checks that need the database."""
    return RequestValidationError([{"type": error_type, "loc": tuple(loc), "msg": message, "input": None}])
