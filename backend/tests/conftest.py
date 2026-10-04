"""Shared fixtures: the app with a mocked OpenAI transport. No test touches the network."""

from __future__ import annotations

import json
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import CoachSettings
from app.main import create_app

FAKE_KEY = "sk-test-SECRET-0123456789abcdef"
FAKE_MP3 = b"ID3\x04\x00fake-mp3-bytes"


class Upstream:
    """Records requests and answers them with a configurable handler."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.handler: Callable[[httpx.Request], httpx.Response] = self.default

    @staticmethod
    def default(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/audio/speech"):
            return httpx.Response(200, content=FAKE_MP3, headers={"content-type": "audio/mpeg"})
        return httpx.Response(500)

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        result = self.handler(request)
        if hasattr(result, "__await__"):
            result = await result
        return result

    def json_bodies(self) -> list[dict]:
        return [json.loads(r.content) for r in self.requests]


def responses_body(output: dict | str, status: str = "completed") -> dict:
    text = output if isinstance(output, str) else json.dumps(output)
    return {
        "id": "resp_test",
        "status": status,
        "output": [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text}]}],
    }


@pytest.fixture
def upstream() -> Upstream:
    return Upstream()


@pytest.fixture
def make_client(upstream: Upstream):
    clients: list[TestClient] = []

    def factory(api_key: str = FAKE_KEY, **overrides) -> TestClient:
        settings = CoachSettings(api_key=api_key, **overrides)
        client = TestClient(create_app(settings, transport=httpx.MockTransport(upstream)))
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()
