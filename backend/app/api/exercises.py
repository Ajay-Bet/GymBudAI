"""`/api/exercises` (no authentication required)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.workouts import ExerciseOut
from app.services.workouts import list_exercises

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseOut])
def exercises(db: DbSession) -> list[ExerciseOut]:
    return [ExerciseOut.model_validate(exercise) for exercise in list_exercises(db)]
