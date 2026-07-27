import hashlib
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable

from app.db.database import get_conn

logger = logging.getLogger(__name__)


def _lock_key(job_id: str) -> int:
    """Stable 64-bit signed key for pg_advisory_lock, derived from job_id."""
    digest = hashlib.sha256(job_id.encode()).digest()[:8]
    return int.from_bytes(digest, "big", signed=True)


async def is_due(job_id: str, interval_hours: float) -> bool:
    """Whether job_id hasn't successfully completed within interval_hours,
    per the durable job_runs record (not APScheduler's in-memory timer, which
    resets on every restart -- and this app redeploys far more often than
    most of these jobs' intervals, so the in-memory timer alone never let
    them reach a first successful run)."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT last_finished_at FROM job_runs WHERE job_id = $1", job_id
        )
    if not row or row["last_finished_at"] is None:
        return True
    age = datetime.now(timezone.utc) - row["last_finished_at"]
    return age.total_seconds() >= interval_hours * 3600


async def _mark_started(job_id: str) -> None:
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO job_runs (job_id, last_started_at)
            VALUES ($1, NOW())
            ON CONFLICT (job_id) DO UPDATE SET last_started_at = NOW()
            """,
            job_id,
        )


async def _mark_finished(job_id: str) -> None:
    async with get_conn() as conn:
        await conn.execute(
            "UPDATE job_runs SET last_finished_at = NOW() WHERE job_id = $1", job_id
        )


async def run_locked(job_id: str, coro_fn: Callable[..., Awaitable[None]], *args) -> None:
    """Run coro_fn(*args) guarded by a Postgres advisory lock keyed on job_id,
    so if both machines' schedulers (or a catch-up check and a scheduled tick)
    fire the same job at once, only one actually executes it -- the other
    returns immediately rather than double-hitting GitHub/HF/Anthropic.
    last_finished_at is only updated on success, so a failed run stays "due"
    and gets retried rather than silently going quiet for a full interval."""
    key = _lock_key(job_id)
    async with get_conn() as conn:
        acquired = await conn.fetchval("SELECT pg_try_advisory_lock($1)", key)
        if not acquired:
            logger.debug("Job %s already running on another instance, skipping", job_id)
            return
        try:
            await _mark_started(job_id)
            try:
                await coro_fn(*args)
            except Exception:
                logger.exception("Job %s raised an exception", job_id)
            else:
                await _mark_finished(job_id)
        finally:
            await conn.fetchval("SELECT pg_advisory_unlock($1)", key)


async def catch_up_overdue_jobs(jobs: list[tuple[str, Callable, tuple, float]]) -> None:
    """Run each overdue job once, sequentially (not concurrently -- firing
    all jobs at once previously OOM-killed this instance), so a restart
    doesn't have to wait out a fresh full interval before genuinely stalled
    backfills get a chance to make progress."""
    for job_id, fn, args, interval_hours in jobs:
        try:
            if await is_due(job_id, interval_hours):
                logger.info("Catch-up: %s is overdue, running now", job_id)
                await run_locked(job_id, fn, *args)
            else:
                logger.debug("Catch-up: %s not due yet", job_id)
        except Exception:
            logger.exception("Catch-up check failed for %s", job_id)
