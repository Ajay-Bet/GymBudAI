from __future__ import annotations

import asyncio
import logging

import httpx
import pytest

from app.core.config import load_settings
from app.services.coach import RateLimiter, CoachError
from tests.conftest import FAKE_KEY, FAKE_MP3, responses_body

FACTS = {
    "findings": {
        "strengths": [
            {"code": "completed-reps", "values": {"completedReps": 8}},
            {"code": "steady-tracking", "values": {"coverage": 0.92, "assessableMs": 9200, "sessionMs": 10000}},
        ],
        "improvements": [{"code": "issue-torso-swing", "values": {"reps": 3, "analyzedReps": 7}}],
        "focus": {"code": "issue-torso-swing", "values": {"reps": 3, "analyzedReps": 7}},
    },
    "score": {"available": True, "value": 57, "reason": None, "experimental": True},
}

GOOD_OUTPUT = {"headline": 0, "strengths": [0, 0], "improvements": [0], "focus": 0}


def wording_ok(output: dict | str):
    return lambda request: httpx.Response(200, json=responses_body(output))


# ---------- status / configuration ----------

def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_status_with_key(client):
    response = client.get("/api/coach/status")
    assert response.status_code == 200
    assert response.json() == {"tts": True, "wording": True}
    assert FAKE_KEY not in response.text


def test_status_without_key(make_client):
    assert make_client(api_key="").get("/api/coach/status").json() == {"tts": False, "wording": False}


@pytest.mark.parametrize("path,body", [("/api/coach/tts", {"text": "Hi", "purpose": "cue"}), ("/api/coach/wording", FACTS)])
def test_not_configured_returns_503(make_client, upstream, path, body):
    response = make_client(api_key="").post(path, json=body)
    assert response.status_code == 503
    assert response.json() == {"detail": "not-configured"}
    assert upstream.requests == []


def test_load_settings_reads_env_file_without_overriding_env(tmp_path, monkeypatch):
    for name in ("OPENAI_API_KEY", "OPENAI_TTS_MODEL", "OPENAI_TTS_VOICE", "OPENAI_TEXT_MODEL"):
        monkeypatch.delenv(name, raising=False)
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=sk-from-file-123456\nOPENAI_TTS_VOICE=cedar\n")
    monkeypatch.setenv("OPENAI_TEXT_MODEL", "custom-text-model")
    settings = load_settings(env)
    assert settings.api_key == "sk-from-file-123456"
    assert settings.tts_voice == "cedar"
    assert settings.tts_model == "gpt-4o-mini-tts"
    assert settings.text_model == "custom-text-model"
    assert "sk-from-file" not in repr(settings)


def test_load_settings_defaults_without_file(tmp_path, monkeypatch):
    for name in ("OPENAI_API_KEY", "OPENAI_TTS_MODEL", "OPENAI_TTS_VOICE", "OPENAI_TEXT_MODEL"):
        monkeypatch.delenv(name, raising=False)
    settings = load_settings(tmp_path / "missing.env")
    assert not settings.configured
    assert (settings.tts_model, settings.tts_voice, settings.text_model) == ("gpt-4o-mini-tts", "marin", "gpt-4.1-mini")


# ---------- TTS ----------

def test_tts_success_sends_expected_request(client, upstream):
    response = client.post("/api/coach/tts", json={"text": "Chest tall and still", "purpose": "cue"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["x-coach-cache"] == "miss"
    assert response.content == FAKE_MP3
    [request] = upstream.requests
    assert request.method == "POST" and str(request.url) == "https://api.openai.com/v1/audio/speech"
    assert request.headers["authorization"] == f"Bearer {FAKE_KEY}"
    body = upstream.json_bodies()[0]
    assert body["model"] == "gpt-4o-mini-tts" and body["voice"] == "marin"
    assert body["input"] == "Chest tall and still" and body["response_format"] == "mp3"
    assert body["instructions"]


def test_tts_uses_configured_model_and_voice(make_client, upstream):
    make_client(tts_model="tts-x", tts_voice="cedar").post("/api/coach/tts", json={"text": "Hi", "purpose": "narration"})
    body = upstream.json_bodies()[0]
    assert (body["model"], body["voice"]) == ("tts-x", "cedar")


def test_tts_cache_hit_skips_upstream(client, upstream):
    first = client.post("/api/coach/tts", json={"text": "Elbow by your side", "purpose": "cue"})
    second = client.post("/api/coach/tts", json={"text": "Elbow by your side", "purpose": "cue"})
    assert first.status_code == second.status_code == 200
    assert second.headers["x-coach-cache"] == "hit" and second.content == FAKE_MP3
    assert len(upstream.requests) == 1
    # Different purpose -> different instructions -> different cache key.
    client.post("/api/coach/tts", json={"text": "Elbow by your side", "purpose": "narration"})
    assert len(upstream.requests) == 2


def test_tts_cache_is_lru_bounded(make_client, upstream):
    client = make_client(tts_cache_size=2)
    for text in ("a1", "a2", "a3"):
        client.post("/api/coach/tts", json={"text": text, "purpose": "cue"})
    client.post("/api/coach/tts", json={"text": "a1", "purpose": "cue"})  # evicted -> upstream again
    assert len(upstream.requests) == 4
    assert len(client.app.state.coach.tts_cache) == 2


def test_tts_rate_limit(make_client, upstream):
    client = make_client(tts_rate_per_minute=3)
    codes = [client.post("/api/coach/tts", json={"text": f"cue {i}", "purpose": "cue"}).status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]
    limited = client.post("/api/coach/tts", json={"text": "cue 9", "purpose": "cue"})
    assert limited.json() == {"detail": "rate-limited"} and int(limited.headers["retry-after"]) >= 1
    assert len(upstream.requests) == 3
    # Cached text is still served while limited.
    assert client.post("/api/coach/tts", json={"text": "cue 0", "purpose": "cue"}).status_code == 200


def test_default_rate_limits_are_30_and_10(client):
    coach = client.app.state.coach
    assert (coach.tts_limiter.limit, coach.wording_limiter.limit) == (30, 10)
    assert (coach.settings.tts_timeout_s, coach.settings.wording_timeout_s) == (10.0, 8.0)
    assert coach.tts_cache.size == 128


def test_rate_limiter_window_expires():
    now = [0.0]
    limiter = RateLimiter(2, clock=lambda: now[0])
    limiter.acquire(); limiter.acquire()
    with pytest.raises(CoachError):
        limiter.acquire()
    now[0] = 60.0
    limiter.acquire()


def test_tts_transport_timeout(client, upstream):
    def handler(request):
        raise httpx.ReadTimeout("timed out", request=request)

    upstream.handler = handler
    response = client.post("/api/coach/tts", json={"text": "Hi", "purpose": "cue"})
    assert response.status_code == 503 and response.json() == {"detail": "upstream-timeout"}
    assert len(upstream.requests) == 1  # no retry


def test_tts_overall_timeout(make_client, upstream):
    async def slow(request):
        await asyncio.sleep(2)
        return httpx.Response(200, content=FAKE_MP3)

    upstream.handler = slow
    response = make_client(tts_timeout_s=0.05).post("/api/coach/tts", json={"text": "Hi", "purpose": "cue"})
    assert response.status_code == 503 and response.json() == {"detail": "upstream-timeout"}


@pytest.mark.parametrize("status", [400, 401, 429, 500])
def test_tts_upstream_error_is_503_without_retry(client, upstream, status):
    upstream.handler = lambda request: httpx.Response(status, json={"error": {"message": f"bad key {FAKE_KEY}"}})
    response = client.post("/api/coach/tts", json={"text": "Hi", "purpose": "cue"})
    assert response.status_code == 503 and response.json() == {"detail": "upstream-error"}
    assert FAKE_KEY not in response.text
    assert len(upstream.requests) == 1
    assert len(client.app.state.coach.tts_cache) == 0


def test_tts_network_error(client, upstream):
    def handler(request):
        raise httpx.ConnectError(f"failed {FAKE_KEY}", request=request)

    upstream.handler = handler
    response = client.post("/api/coach/tts", json={"text": "Hi", "purpose": "cue"})
    assert response.status_code == 503 and response.json() == {"detail": "upstream-error"}


def test_tts_empty_audio_is_upstream_error(client, upstream):
    upstream.handler = lambda request: httpx.Response(200, content=b"")
    assert client.post("/api/coach/tts", json={"text": "Hi", "purpose": "cue"}).status_code == 503


@pytest.mark.parametrize(
    "body",
    [
        {"text": "", "purpose": "cue"},
        {"text": "   ", "purpose": "cue"},
        {"text": "x" * 301, "purpose": "cue"},
        {"text": "Hi", "purpose": "shout"},
        {"text": "Hi"},
        {"text": "Hi", "purpose": "cue", "frame": [1, 2, 3]},
        {"text": "bad\x00char", "purpose": "cue"},
        {"text": 5, "purpose": "cue"},
    ],
)
def test_tts_rejects_invalid_requests(client, upstream, body):
    response = client.post("/api/coach/tts", json=body)
    assert response.status_code == 422 and response.json() == {"detail": "invalid-request"}
    assert upstream.requests == []


def test_tts_accepts_300_characters(client):
    assert client.post("/api/coach/tts", json={"text": "x" * 300, "purpose": "narration"}).status_code == 200


def test_tts_body_size_cap(client, upstream):
    response = client.post("/api/coach/tts", content=b'{"text":"' + b"x" * 5000 + b'","purpose":"cue"}',
                           headers={"content-type": "application/json"})
    assert response.status_code == 413 and response.json() == {"detail": "request-too-large"}
    assert upstream.requests == []


# ---------- wording ----------

def test_wording_success(client, upstream):
    upstream.handler = wording_ok(GOOD_OUTPUT)
    response = client.post("/api/coach/wording", json=FACTS)
    assert response.status_code == 200, response.text
    assert response.json()["strengths"][0] == "You completed 8 counted reps."
    assert response.json()["improvements"][0] == "The detector recorded torso movement on 3 of 7 analyzed reps."
    assert len(response.json()["narration"]) <= 300
    [request] = upstream.requests
    assert str(request.url) == "https://api.openai.com/v1/responses"
    body = upstream.json_bodies()[0]
    assert body["model"] == "gpt-4.1-mini" and body["store"] is False
    fmt = body["text"]["format"]
    assert fmt["type"] == "json_schema" and fmt["strict"] is True
    assert fmt["schema"]["additionalProperties"] is False
    user = body["input"][1]["content"]
    assert "torso movement on 3 of 7" in user and "You completed 8" in user


@pytest.mark.parametrize(
    "change",
    [
        {"headline": "Great work with a solid grip"},
        {"narration": "Lift heavier weights next time."},
        {"focus": "Brace your muscles to stay still."},
        {"improvements": ["This could raise injury risk."]},
        {"headline": "A perfect set of 8 reps"},
        {"strengths": ["You finished 8 counted reps.", "Tracking was Flawless."]},
    ],
)
def test_wording_rejects_forbidden_terms(client, upstream, change):
    upstream.handler = wording_ok({**GOOD_OUTPUT, **change})
    response = client.post("/api/coach/wording", json=FACTS)
    assert response.status_code == 422 and response.json() == {"detail": "invalid-model-output"}


@pytest.mark.parametrize(
    "change",
    [
        {"headline": "Nice work: 10 reps done"},
        {"improvements": ["Your torso moved on 4 reps."]},
        {"narration": "You scored 75 today."},
        {"focus": "Do 12 reps next set."},
    ],
)
def test_wording_rejects_invented_numbers(client, upstream, change):
    upstream.handler = wording_ok({**GOOD_OUTPUT, **change})
    assert client.post("/api/coach/wording", json=FACTS).status_code == 422


@pytest.mark.parametrize(
    "change",
    [
        {"strengths": ["You finished 8 counted reps."]},
        {"improvements": []},
        {"improvements": ["Torso moved on 3 reps.", "Extra item."]},
        {"focus": None},
    ],
)
def test_wording_rejects_wrong_counts(client, upstream, change):
    upstream.handler = wording_ok({**GOOD_OUTPUT, **change})
    assert client.post("/api/coach/wording", json=FACTS).status_code == 422


def test_wording_rejects_focus_when_facts_have_none(client, upstream):
    facts = {**FACTS, "findings": {**FACTS["findings"], "focus": None}}
    upstream.handler = wording_ok(GOOD_OUTPUT)
    assert client.post("/api/coach/wording", json=facts).status_code == 422


@pytest.mark.parametrize(
    "change",
    [
        {"headline": "x" * 81},
        {"narration": "y" * 401},
        {"strengths": ["z" * 161, "The camera tracked you well."]},
        {"focus": ""},
    ],
)
def test_wording_rejects_overlong_fields(client, upstream, change):
    upstream.handler = wording_ok({**GOOD_OUTPUT, **change})
    assert client.post("/api/coach/wording", json=FACTS).status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        responses_body("not json"),
        responses_body({"headline": "Hi"}),
        responses_body({**GOOD_OUTPUT, "extra": "x"}),
        responses_body(GOOD_OUTPUT, status="incomplete"),
        {"status": "completed", "output": [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}]},
        {"status": "completed", "output": []},
    ],
)
def test_wording_rejects_malformed_model_output(client, upstream, body):
    upstream.handler = lambda request: httpx.Response(200, json=body)
    assert client.post("/api/coach/wording", json=FACTS).status_code == 422


def test_wording_upstream_error_and_timeout(make_client, upstream):
    client = make_client()
    upstream.handler = lambda request: httpx.Response(502, text="bad gateway")
    assert client.post("/api/coach/wording", json=FACTS).json() == {"detail": "upstream-error"}

    async def slow(request):
        await asyncio.sleep(2)
        return httpx.Response(200, json=responses_body(GOOD_OUTPUT))

    upstream.handler = slow
    response = make_client(wording_timeout_s=0.05).post("/api/coach/wording", json=FACTS)
    assert response.status_code == 503 and response.json() == {"detail": "upstream-timeout"}


def test_wording_rate_limit(make_client, upstream):
    client = make_client(wording_rate_per_minute=2)
    upstream.handler = wording_ok(GOOD_OUTPUT)
    codes = [client.post("/api/coach/wording", json=FACTS).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    assert len(upstream.requests) == 2


@pytest.mark.parametrize(
    "facts",
    [
        {"findings": {"strengths": [{"code": "great-form", "values": {}}], "improvements": [], "focus": None}},
        {"findings": {"strengths": [{"code": "completed-reps", "values": {"count": "eight"}}], "improvements": []}},
        {"findings": {"strengths": [{"code": "completed-reps", "values": {"count": True}}], "improvements": []}},
        {"findings": {"strengths": [{"code": "completed-reps", "values": {"count": 1e9}}], "improvements": []}},
        {"findings": {"strengths": [{"code": "completed-reps", "values": {"bad key!": 1}}], "improvements": []}},
        {"findings": {"strengths": [], "improvements": []}, "note": "free text"},
        {"findings": {"strengths": [], "improvements": []}, "frames": [[0.1, 0.2]]},
        {"findings": {"strengths": [], "improvements": []}, "score": {"available": True, "value": 101}},
        {"findings": {"strengths": [], "improvements": []}, "score": {"available": False, "reason": "because"}},
        {"findings": {"strengths": [], "improvements": []},
         "score": {"available": True, "value": 50, "label": "GymBud detector-based summary"}},
        {"findings": {"strengths": [{"code": "completed-reps", "values": {}}] * 9, "improvements": []}},
    ],
)
def test_wording_rejects_invalid_facts(client, upstream, facts):
    response = client.post("/api/coach/wording", json=facts)
    assert response.status_code == 422 and response.json() == {"detail": "invalid-request"}
    assert upstream.requests == []


def test_wording_body_size_cap(client, upstream):
    response = client.post("/api/coach/wording", content=b" " * 9000 + b"{}", headers={"content-type": "application/json"})
    assert response.status_code == 413
    assert upstream.requests == []


def test_wording_score_unavailable_cannot_be_invented(client, upstream):
    facts = {**FACTS, "score": {"available": False, "value": None, "reason": "too-few-analyzed-reps"}}
    upstream.handler = wording_ok(GOOD_OUTPUT)
    response = client.post("/api/coach/wording", json=facts)
    assert response.status_code == 200
    assert "score" not in response.text
    upstream.handler = wording_ok({**GOOD_OUTPUT, "headline": "Nice score of 57"})
    assert client.post("/api/coach/wording", json=facts).status_code == 422


# ---------- key hygiene ----------

def test_key_never_in_responses_or_logs(make_client, upstream, caplog):
    caplog.set_level(logging.DEBUG)
    client = make_client()
    leaky = {"error": {"message": f"Incorrect API key provided: {FAKE_KEY}"}}
    bodies = []
    upstream.handler = lambda request: httpx.Response(401, json=leaky)
    bodies.append(client.post("/api/coach/tts", json={"text": "Hi", "purpose": "cue"}).text)
    bodies.append(client.post("/api/coach/wording", json=FACTS).text)

    def boom(request):
        raise httpx.ConnectError(f"proxy said {FAKE_KEY}", request=request)

    upstream.handler = boom
    bodies.append(client.post("/api/coach/tts", json={"text": "Other", "purpose": "cue"}).text)
    upstream.handler = wording_ok({**GOOD_OUTPUT, "headline": f"key {FAKE_KEY}"})
    bodies.append(client.post("/api/coach/wording", json=FACTS).text)
    bodies.append(client.get("/api/coach/status").text)
    bodies.append(client.get("/openapi.json").text)

    assert all(FAKE_KEY not in body and "SECRET" not in body for body in bodies)
    assert FAKE_KEY not in caplog.text and "SECRET" not in caplog.text
    assert "upstream HTTP 401" in caplog.text  # errors are still logged, scrubbed
    assert "Incorrect API key provided" not in caplog.text

# Strong semantic grounding: a model can choose alternatives, never author text.
@pytest.mark.parametrize('selection', [
    {'headline': True}, {'headline': -1}, {'headline': 2},
    {'headline': 'Your torso was steady.'},
    {'strengths': [0, 0], 'improvements': ['No torso movement was detected.']},
    {'focus': 'You maintained excellent balance.'},
    {'narration': 'You scored 57 and kept steady knees.'},
])
def test_wording_rejects_semantic_fabrication(client, upstream, selection):
    upstream.handler = wording_ok({**GOOD_OUTPUT, **selection})
    response = client.post('/api/coach/wording', json=FACTS)
    assert response.status_code == 422
    assert response.json()['detail'] == 'invalid-model-output'


def test_wording_all_approved_variants_and_no_findings(client, upstream):
    upstream.handler = wording_ok({'headline': 1, 'strengths': [1, 1], 'improvements': [1], 'focus': 1})
    response = client.post('/api/coach/wording', json=FACTS)
    assert response.status_code == 200
    assert response.json()['headline'] == 'Experimental review with unvalidated rules: Here is what the camera recorded.'
    assert response.json()['focus'] == 'For the next set, aim to keep your torso still.'
    upstream.handler = wording_ok({'headline': 0, 'strengths': [], 'improvements': [], 'focus': None})
    response = client.post('/api/coach/wording', json={'findings': {'strengths': [], 'improvements': [], 'focus': None}})
    assert response.status_code == 200
    assert response.json()['narration'] == 'Your set summary is ready.'


@pytest.mark.parametrize('finding', [
    {'code': 'completed-reps', 'values': {'completedReps': -2}},
    {'code': 'completed-reps', 'values': {'completedReps': 1.5}},
    {'code': 'steady-tracking', 'values': {'coverage': .5, 'assessableMs': 50, 'sessionMs': 100}},
    {'code': 'clean-reps-torso-swing', 'values': {'cleanReps': 5, 'analyzedReps': 2}},
    {'code': 'clean-reps-incomplete-rom', 'values': {'cleanReps': 5, 'analyzedReps': 5}},
])
def test_wording_rejects_invalid_finding_semantics(client, upstream, finding):
    response = client.post('/api/coach/wording', json={'findings': {'strengths': [finding], 'improvements': [], 'focus': None}})
    assert response.status_code == 422
    assert upstream.requests == []


def test_wording_rejects_contradictory_score(client, upstream):
    response = client.post('/api/coach/wording', json={**FACTS, 'score': {'available': False, 'value': 57, 'reason': 'no-validated-rules'}})
    assert response.status_code == 422
    assert upstream.requests == []


class OversizedStream(httpx.AsyncByteStream):
    def __init__(self, size):
        self.size = size
        self.reads = 0
    async def __aiter__(self):
        for _ in range(20):
            self.reads += 1
            yield b'x' * self.size


@pytest.mark.parametrize('path,body,size', [('/api/coach/tts', {'text':'Hi','purpose':'cue'}, 1024 * 1024), ('/api/coach/wording', FACTS, 100 * 1024)])
def test_upstream_stream_is_bounded_before_full_read(client, upstream, path, body, size):
    stream = OversizedStream(size)
    upstream.handler = lambda request: httpx.Response(200, stream=stream)
    response = client.post(path, json=body)
    assert response.status_code == 503
    assert stream.reads < 20


def test_cache_is_bounded_by_bytes():
    from app.services.coach import LruCache
    cache = LruCache(128)
    cache.max_bytes = 10
    cache.put(('a',), b'123456')
    cache.put(('b',), b'123456')
    assert cache.get(('a',)) is None
    assert cache.get(('b',)) == b'123456'
    assert cache._bytes == 6


def test_wording_stream_timeout_has_no_retry(make_client, upstream):
    class SlowStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            await asyncio.sleep(2)
            yield b'{}'
    upstream.handler = lambda request: httpx.Response(200, stream=SlowStream())
    response = make_client(wording_timeout_s=.02).post('/api/coach/wording', json=FACTS)
    assert response.status_code == 503
    assert response.json()['detail'] == 'upstream-timeout'
    assert len(upstream.requests) == 1

@pytest.mark.parametrize('output', [1, {}, 'text'])
def test_wording_rejects_invalid_upstream_container(client, upstream, output):
    upstream.handler = lambda request: httpx.Response(200, json={'status': 'completed', 'output': output})
    response = client.post('/api/coach/wording', json=FACTS)
    assert response.status_code == 422


def test_wording_rejects_invalid_upstream_content(client, upstream):
    upstream.handler = lambda request: httpx.Response(200, json={'status': 'completed', 'output': [{'type': 'message', 'content': 4}]})
    assert client.post('/api/coach/wording', json=FACTS).status_code == 422


def test_request_declared_size_is_bounded_before_integer_parsing(client):
    response = client.post('/api/coach/tts', json={'text': 'Hi', 'purpose': 'cue'}, headers={'content-length': '9' * 5000})
    assert response.status_code == 413
