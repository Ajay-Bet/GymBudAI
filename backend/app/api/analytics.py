"""Authenticated owner analytics over a bounded inclusive local date interval."""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import Auth, DbSession
from app.schemas.analytics import AnalyticsResponse
from app.services.analytics import analytics

router = APIRouter(prefix='/api/analytics', tags=['analytics'])


@router.get('/me', response_model=AnalyticsResponse)
def get_analytics(current: Auth, db: DbSession,
                  start_date: Annotated[date, Query(alias='startDate')],
                  end_date: Annotated[date, Query(alias='endDate')],
                  timezone: Annotated[str, Query(min_length=1, max_length=100)]) -> AnalyticsResponse:
    return analytics(db, current.user.id, start_date, end_date, timezone)
