"""Coaching proxy configuration, read from the environment and an optional `backend/.env`.

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
