"""Request body size caps for the persistence API (pure ASGI, before JSON parsing)."""

from __future__ import annotations

import json
import re

from app.schemas.workouts import SET_BODY_MAX_BYTES

DEFAULT_BODY_MAX_BYTES = 16 * 1024
_SET_PATH = re.compile(r"^/api/workouts/[^/]+/sets/?$")
_LIMITED_PREFIXES = ("/api/auth", "/api/users", "/api/workouts", "/api/exercises")


def body_limit(path: str) -> int:
    return SET_BODY_MAX_BYTES if _SET_PATH.match(path) else DEFAULT_BODY_MAX_BYTES


class BodySizeLimitMiddleware:
    """413 `request-too-large` when a write body exceeds its cap (512 KiB for a set, 16 KiB otherwise).
    The coaching proxy (`/api/coach`) enforces its own caps and is not affected."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] not in ("POST", "PUT", "PATCH")
            or not scope["path"].startswith(_LIMITED_PREFIXES)
        ):
            await self.app(scope, receive, send)
            return
        limit = body_limit(scope["path"])
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                if not value.isdigit() or len(value) > 12 or int(value) > limit:
                    await self._reject(send, limit)
                    return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > limit:
                await self._reject(send, limit)
                return
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    @staticmethod
    async def _reject(send, limit: int) -> None:
        payload = json.dumps(
            {"detail": {"code": "request-too-large", "message": f"Request body exceeds {limit} bytes."}}
        ).encode()
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]})
        await send({"type": "http.response.body", "body": payload})
