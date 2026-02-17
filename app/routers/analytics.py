"""
Analytics API endpoints.

Provides JSON API for completion statistics, trends, patterns, and insights.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import require_user
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analytics"])


# =============================================================================
# Response Models
# =============================================================================


class StreaksResponse(BaseModel):
    current: int
    longest: int
    this_week: int


class WeekComparisonResponse(BaseModel):
    this_week: int
    last_week: int
    change_pct: int


class DailyCompletionItem(BaseModel):
    date: str
    count: int


class DomainBreakdownItem(BaseModel):
    domain_id: int
    domain_name: str
    domain_icon: str
    count: int


class DayOfWeekItem(BaseModel):
    day: str
    count: int


class HourOfDayItem(BaseModel):
    hour: int
    count: int


class ImpactDistributionItem(BaseModel):
    impact: int
    label: str
    count: int
    color: str


class HeatmapItem(BaseModel):
    x: str
    y: int


class VelocityItem(BaseModel):
    date: str
    count: int
    avg: float


class RecurringStatItem(BaseModel):
    task_id: int
    title: str
    completed: int
    total: int
    rate: int


class AgingBuckets(BaseModel):
    same_day: int
    within_week: int
    within_month: int
    over_month: int


class AgingStatsResponse(BaseModel):
    buckets: AgingBuckets
    avg_days: float
    median_days: int
    total_completed: int


class RecentCompletionItem(BaseModel):
    id: int
    task_id: int
    title: str
    completed_at_display: str
    domain_name: str
    domain_icon: str
    is_instance: bool


class AnalyticsResponse(BaseModel):
    total_completed: int
    total_pending: int
    completion_rate: float
    daily_completions: list[DailyCompletionItem]
    by_domain: list[DomainBreakdownItem]
    by_day_of_week: list[DayOfWeekItem]
    by_hour: list[HourOfDayItem]
    impact_distribution: list[ImpactDistributionItem]
    heatmap_data: list[HeatmapItem]
    velocity_data: list[VelocityItem]
    streaks: StreaksResponse
    week_comparison: WeekComparisonResponse
    recurring_stats: list[RecurringStatItem]
    aging_stats: AgingStatsResponse


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(
    days: int = Query(default=30, ge=7, le=90),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return comprehensive analytics data for the specified time range."""
    end_date = date.today()
    start_date = end_date - timedelta(days=days)

    service = AnalyticsService(db, user.id)
    stats = await service.get_comprehensive_stats(start_date, end_date)
    return stats


@router.get("/recent-completions", response_model=list[RecentCompletionItem])
async def get_recent_completions(
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return most recently completed tasks."""
    service = AnalyticsService(db, user.id)
    return await service.get_recent_completions(limit=limit)
