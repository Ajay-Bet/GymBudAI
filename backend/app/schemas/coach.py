"""Pydantic contracts for the Sprint 4 coaching proxy (`/api/coach/*`).

The wording request carries only finding codes, numbers and the score: never frames, landmarks
or free text from the client.
"""

from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictBool, field_validator, model_validator

ISSUE_TYPES = ("torso-swing", "upper-arm-drift", "incomplete-rom")

FindingCode = Literal[
    "completed-reps",
    "steady-tracking",
    "full-range-completed",
    "clean-reps-torso-swing",
    "clean-reps-upper-arm-drift",
    "clean-reps-incomplete-rom",
    "issue-torso-swing",
    "issue-upper-arm-drift",
    "issue-incomplete-rom",
    "partial-attempts",
    "low-tracking",
    "tracking-interruptions",
]

ScoreReason = Literal["no-validated-rules", "no-completed-reps", "too-few-analyzed-reps", "low-coverage"]

ValueKey = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,31}$")]
Number = StrictInt | StrictFloat

MAX_VALUE = 100_000
MAX_ITEMS = 8
MAX_VALUES = 8

HEADLINE_MAX = 80
ITEM_MAX = 160
NARRATION_MAX = 400


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TtsRequest(_Strict):
    text: str = Field(min_length=1, max_length=300)
    purpose: Literal["cue", "narration"]

    @field_validator("text")
    @classmethod
    def _text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text is empty")
        if any(ord(ch) < 32 and ch not in "\t\n" for ch in value):
            raise ValueError("text contains control characters")
        return value


class Finding(_Strict):
    code: FindingCode
    values: dict[ValueKey, Number] = Field(default_factory=dict, max_length=MAX_VALUES)

    @field_validator("values")
    @classmethod
    def _finite(cls, values: dict[str, float]) -> dict[str, float]:
        for number in values.values():
            if not math.isfinite(number) or abs(number) > MAX_VALUE:
                raise ValueError("values must be finite and bounded")
        return values

    @model_validator(mode="after")
    def _meaning(self):
        code, v = self.code, self.values
        required = ({"completedReps"} if code in ("completed-reps", "full-range-completed") else
                    {"coverage", "assessableMs", "sessionMs"} if code in ("steady-tracking", "low-tracking") else
                    {"cleanReps", "analyzedReps"} if code.startswith("clean-reps-") else
                    {"reps", "analyzedReps"} if code.startswith("issue-") else {"count", "completedReps"})
        if set(v) != required or code.endswith("incomplete-rom"):
            raise ValueError("unsupported finding fields")
        if any(n < 0 for n in v.values()): raise ValueError("negative finding")
        for key, n in v.items():
            if key not in ("coverage", "assessableMs", "sessionMs") and int(n) != n: raise ValueError("integer count required")
        if code in ("steady-tracking", "low-tracking"):
            if not 0 <= v["coverage"] <= 1 or v["assessableMs"] > v["sessionMs"]: raise ValueError("coverage")
            if (code == "steady-tracking" and v["coverage"] < .9) or (code == "low-tracking" and v["coverage"] >= .8): raise ValueError("coverage condition")
        elif code.startswith(("clean-reps-", "issue-")):
            count = v.get("cleanReps", v.get("reps"))
            if not 1 <= count <= v["analyzedReps"]: raise ValueError("rep denominator")
        elif v.get("count", v.get("completedReps", 0)) < 1: raise ValueError("positive count required")
        return self


class Findings(_Strict):
    strengths: list[Finding] = Field(default_factory=list, max_length=MAX_ITEMS)
    improvements: list[Finding] = Field(default_factory=list, max_length=MAX_ITEMS)
    focus: Finding | None = None

    @model_validator(mode="after")
    def _placement(self):
        strength = {"completed-reps", "steady-tracking", "full-range-completed", "clean-reps-torso-swing", "clean-reps-upper-arm-drift"}
        if any(x.code not in strength for x in self.strengths) or any(x.code in strength for x in self.improvements): raise ValueError("finding placement")
        if self.focus != (self.improvements[0] if self.improvements else None): raise ValueError("focus must match first improvement")
        for items in (self.strengths, self.improvements):
            if len({x.code for x in items}) != len(items): raise ValueError("duplicate finding")
        return self


class Score(_Strict):
    available: StrictBool
    value: StrictInt | None = Field(default=None, ge=0, le=100)
    reason: ScoreReason | None = None
    experimental: StrictBool = False

    @model_validator(mode="after")
    def _availability(self):
        if self.available and (self.value is None or self.reason is not None): raise ValueError("available score")
        if not self.available and (self.value is not None or self.reason is None): raise ValueError("unavailable score")
        return self


class WordingRequest(_Strict):
    findings: Findings
    score: Score | None = None


class WordingResponse(_Strict):
    headline: str = Field(min_length=1, max_length=HEADLINE_MAX)
    strengths: list[str]
    improvements: list[str]
    focus: str | None
    narration: str = Field(min_length=1, max_length=NARRATION_MAX)


class CoachStatus(BaseModel):
    tts: bool
    wording: bool
