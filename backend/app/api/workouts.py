"""`/api/workouts/*`: create, submit a set, finalize, edit notes, list, detail (GB 503, GB 504).
Every operation is scoped to the authenticated owner; anything else is 404 `not-found`."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime

from app.api.deps import Auth, DbSession
from app.schemas.workouts import (
    SetDetail,
    WorkoutCreateIn,
    WorkoutDetail,
    WorkoutFinalizeIn,
    WorkoutList,
    WorkoutPatchIn,
    WorkoutSetIn,
)
from app.services import workouts as service

router = APIRouter(prefix="/api/workouts", tags=["workouts"])

_ERRORS = {401: {"description": "Not signed in"}, 404: {"description": "Not found or not owned"}}


def _json(model, status: int) -> JSONResponse:
    return JSONResponse(model.model_dump(mode="json", by_alias=True), status_code=status)


@router.post("", response_model=WorkoutDetail, status_code=201,
             responses={200: {"model": WorkoutDetail, "description": "Existing workout (idempotent retry)"}, 409: {}, 422: {}})
def create_workout(body: WorkoutCreateIn, current: Auth, db: DbSession):
    workout, created = service.create_workout(db, current.user.id, body)
    return _json(service.build_detail(db, workout), 201 if created else 200)


@router.get("", response_model=WorkoutList)
def list_workouts(
    current: Auth,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=service.LIST_LIMIT_MAX)] = 20,
    before: Annotated[AwareDatetime | None, Query()] = None,
) -> WorkoutList:
    return service.list_workouts(db, current.user.id, limit, before)


@router.get("/{workout_id}", response_model=WorkoutDetail, responses=_ERRORS)
def get_workout(workout_id: str, current: Auth, db: DbSession) -> WorkoutDetail:
    return service.workout_detail(db, current.user.id, service.parse_workout_id(workout_id))


@router.post("/{workout_id}/sets", response_model=SetDetail, status_code=201,
             responses={**_ERRORS, 200: {"model": SetDetail, "description": "Identical replay"}, 409: {}, 413: {}})
def submit_set(workout_id: str, body: WorkoutSetIn, current: Auth, db: DbSession):
    workout_set, created = service.submit_set(db, current.user.id, service.parse_workout_id(workout_id), body)
    return _json(service.build_set_details(db, [workout_set])[0], 201 if created else 200)


@router.post("/{workout_id}/finalize", response_model=WorkoutDetail, responses=_ERRORS)
def finalize_workout(workout_id: str, body: WorkoutFinalizeIn, current: Auth, db: DbSession) -> WorkoutDetail:
    workout = service.finalize_workout(db, current.user.id, service.parse_workout_id(workout_id), body.ended_at)
    return service.build_detail(db, workout)


@router.patch("/{workout_id}", response_model=WorkoutDetail, responses=_ERRORS)
def update_workout(workout_id: str, body: WorkoutPatchIn, current: Auth, db: DbSession) -> WorkoutDetail:
    workout = service.update_notes(db, current.user.id, service.parse_workout_id(workout_id), body.notes)
    return service.build_detail(db, workout)


