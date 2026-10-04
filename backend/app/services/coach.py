"""OpenAI coaching proxy: TTS audio and grounded set-feedback wording over the REST API (httpx).

No retries (a late cue is worse than none; the frontend falls back to the browser voice/text).
Errors are mapped to short codes; upstream bodies and exception text are never logged.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict, deque
from collections.abc import Callable

import httpx

from app.core.config import CoachSettings
from app.schemas.coach import TtsRequest, WordingRequest, WordingResponse
from app.services.coach_wording import (
    OUTPUT_SCHEMA,
    SYSTEM_PROMPT,
    InvalidWording,
    build_user_content,
    extract_output_text,
    validate_wording,
)

logger = logging.getLogger("gymbud.coach")

TTS_INSTRUCTIONS = {
    "cue": "Friendly, clear personal trainer. Short, upbeat and encouraging; even pace; no shouting.",
    "narration": "Friendly, clear personal trainer giving calm end-of-set feedback. Warm, encouraging, natural pace.",
}
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_WORDING_RESPONSE_BYTES = 256 * 1024


class CoachError(Exception):
    """Mapped to an HTTP response by the router. `detail` is a short public code."""

    def __init__(self, status: int, detail: str, headers: dict[str, str] | None = None) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.headers = headers or {}


class RateLimiter:
    """Sliding one-minute window, per process."""

    def __init__(self, limit: int, clock: Callable[[], float] = time.monotonic, window_s: float = 60.0) -> None:
        self.limit = limit
        self.window_s = window_s
        self.clock = clock
        self._hits: deque[float] = deque()

    def acquire(self) -> None:
        now = self.clock()
        while self._hits and now - self._hits[0] >= self.window_s:
            self._hits.popleft()
        if len(self._hits) >= self.limit:
            retry = max(1, int(self.window_s - (now - self._hits[0])) + 1)
            raise CoachError(429, "rate-limited", {"Retry-After": str(retry)})
        self._hits.append(now)


class LruCache:
    def __init__(self, size: int) -> None:
        self.size = size
        self._data: OrderedDict[tuple, bytes] = OrderedDict()
        self.max_bytes = 16 * 1024 * 1024
        self._bytes = 0

    def get(self, key: tuple) -> bytes | None:
        value = self._data.get(key)
        if value is not None:
            self._data.move_to_end(key)
        return value

    def put(self, key: tuple, value: bytes) -> None:
        self._bytes -= len(self._data.get(key, b""))
        self._data[key] = value
        self._bytes += len(value)
        self._data.move_to_end(key)
        while len(self._data) > self.size or self._bytes > self.max_bytes:
            _, removed = self._data.popitem(last=False)
            self._bytes -= len(removed)

    def __len__(self) -> int:
        return len(self._data)


class CoachService:
    def __init__(
        self,
        settings: CoachSettings,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.settings = settings
        self._transport = transport
        self._client: httpx.AsyncClient | None = None
        self.tts_limiter = RateLimiter(settings.tts_rate_per_minute, clock)
        self.wording_limiter = RateLimiter(settings.wording_rate_per_minute, clock)
        self.tts_cache = LruCache(settings.tts_cache_size)

    def status(self) -> dict[str, bool]:
        return {"tts": self.settings.configured, "wording": self.settings.configured}

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.settings.base_url, transport=self._transport, follow_redirects=False
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _require_key(self) -> None:
        if not self.settings.configured:
            raise CoachError(503, "not-configured")

    async def _post(self, path: str, payload: dict, timeout_s: float, what: str) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self.settings.api_key}"}
        limit = MAX_AUDIO_BYTES if what == "tts" else MAX_WORDING_RESPONSE_BYTES
        async def bounded_read():
            async with self._http().stream("POST", path, json=payload, headers=headers, timeout=httpx.Timeout(timeout_s)) as response:
                if response.status_code != 200:
                    logger.warning("coach %s: upstream HTTP %d", what, response.status_code)
                    raise CoachError(503, "upstream-error")
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(data) + len(chunk) > limit: raise CoachError(503, "upstream-error")
                    data.extend(chunk)
                return httpx.Response(200, headers=response.headers, content=bytes(data))
        try:
            return await asyncio.wait_for(bounded_read(), timeout=timeout_s)
        except (TimeoutError, asyncio.TimeoutError, httpx.TimeoutException):
            logger.warning("coach %s: upstream timeout after %.1fs", what, timeout_s)
            raise CoachError(503, "upstream-timeout") from None
        except httpx.HTTPError:
            logger.warning("coach %s: upstream transport error", what)
            raise CoachError(503, "upstream-error") from None

    async def tts(self, request: TtsRequest) -> tuple[bytes, bool]:
        """Return (mp3 bytes, cache_hit)."""
        self._require_key()
        instructions = TTS_INSTRUCTIONS[request.purpose]
        key = (self.settings.tts_model, self.settings.tts_voice, instructions, request.text)
        cached = self.tts_cache.get(key)
        if cached is not None:
            return cached, True
        # Only upstream calls count against the limit: cache hits cost nothing.
        self.tts_limiter.acquire()
        payload = {
            "model": self.settings.tts_model,
            "voice": self.settings.tts_voice,
            "input": request.text,
            "instructions": instructions,
            "response_format": "mp3",
        }
        response = await self._post("/audio/speech", payload, self.settings.tts_timeout_s, "tts")
        audio = response.content
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            logger.warning("coach tts: unexpected audio size %d", len(audio))
            raise CoachError(503, "upstream-error")
        self.tts_cache.put(key, audio)
        return audio, False

    async def wording(self, facts: WordingRequest) -> WordingResponse:
        self._require_key()
        self.wording_limiter.acquire()
        payload = {
            "model": self.settings.text_model,
            "input": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_content(facts)},
            ],
            "text": {
                "format": {"type": "json_schema", "name": "set_feedback", "schema": OUTPUT_SCHEMA, "strict": True}
            },
            "max_output_tokens": 256,
            "store": False,
        }
        response = await self._post("/responses", payload, self.settings.wording_timeout_s, "wording")
        if len(response.content) > MAX_WORDING_RESPONSE_BYTES:
            raise CoachError(503, "upstream-error")
        try:
            body = response.json()
            if not isinstance(body, dict):
                raise InvalidWording("schema")
            return validate_wording(extract_output_text(body), facts)
        except InvalidWording as exc:
            logger.info("coach wording: model output rejected (%s)", exc)
            raise CoachError(422, "invalid-model-output") from None
        except ValueError:
            logger.warning("coach wording: upstream body is not JSON")
            raise CoachError(503, "upstream-error") from None
