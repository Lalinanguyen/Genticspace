import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import close_db, init_db
from app.routes.admin import router as admin_router
from app.routes.agents import router as agents_router
from app.routes.auth import router as auth_router
from app.routes.profiles import router as profiles_router
from app.routes.public import router as public_router
from app.routes.sandbox import internal_router as sandbox_internal_router
from app.routes.sandbox import router as sandbox_router
from app.routes.trust import router as trust_router
from app.services.ard_crawler import crawl_ard
from app.services.deployment_guide import backfill_deployment_guides
from app.services.description_backfill import (
    backfill_connects,
    backfill_erc8004,
    backfill_github,
    backfill_huggingface,
)
from app.services.endpoint_checker import check_all_endpoints
from app.services.github_profile_scraper import scrape_github_profiles
from app.services.github_scraper import scrape_github
from app.services.huggingface_profile_scraper import scrape_huggingface_profiles
from app.services.futurepedia_scraper import backfill_futurepedia, scrape_futurepedia
from app.services.huggingface_scraper import scrape_huggingface
from app.services.indexer import ingest_agents
from app.services.job_scheduling import catch_up_overdue_jobs, run_locked
from app.services.npm_scraper import backfill_npm, scrape_npm
from app.services.readme_scraper import scrape_readmes
from app.services.sandbox_manifest import scan_sandbox_manifests
from app.services.sandbox_runner import reap_stale_runs
from app.services.yc_scraper import scrape_ycombinator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# (job_id, function, args, interval_hours) for every scheduled background
# job. Both the APScheduler interval tick and the startup catch-up pass run
# jobs through job_scheduling.run_locked, which wraps each call in a Postgres
# advisory lock (so the 2 machines behind this app never double-run the same
# job) and records last_finished_at in the job_runs table (so "is this job
# overdue" survives restarts instead of resetting on every redeploy).
_JOBS: list[tuple[str, object, tuple, float]] = [
    ("index_erc8004", ingest_agents, ("erc8004",), settings.INDEX_INTERVAL_MINUTES / 60),
    ("ard_crawler", crawl_ard, (), 24),
    ("huggingface_scraper", scrape_huggingface, (), settings.HF_SCRAPE_INTERVAL_HOURS),
    ("huggingface_profile_scraper", scrape_huggingface_profiles, (), settings.HF_SCRAPE_INTERVAL_HOURS),
    ("github_scraper", scrape_github, (), settings.GITHUB_SCRAPE_INTERVAL_HOURS),
    ("github_profile_scraper", scrape_github_profiles, (), settings.GITHUB_SCRAPE_INTERVAL_HOURS),
    ("readme_scraper", scrape_readmes, (), settings.README_SCRAPE_INTERVAL_HOURS),
    ("check_endpoints", check_all_endpoints, (), settings.ENDPOINT_CHECK_INTERVAL_MINUTES / 60),
    ("npm_scraper", scrape_npm, (), settings.NPM_SCRAPE_INTERVAL_HOURS),
    ("futurepedia_scraper", scrape_futurepedia, (), settings.FUTUREPEDIA_SCRAPE_INTERVAL_HOURS),
    ("backfill_erc8004", backfill_erc8004, (), 6),
    ("backfill_github", backfill_github, (), settings.GITHUB_ENRICH_INTERVAL_HOURS),
    ("backfill_huggingface", backfill_huggingface, (), settings.HF_ENRICH_INTERVAL_HOURS),
    ("backfill_connects", backfill_connects, (), 6),
    ("backfill_npm", backfill_npm, (), settings.NPM_ENRICH_INTERVAL_HOURS),
    ("backfill_futurepedia", backfill_futurepedia, (), settings.FUTUREPEDIA_ENRICH_INTERVAL_HOURS),
    ("ycombinator_scraper", scrape_ycombinator, (), settings.YC_SCRAPE_INTERVAL_HOURS),
    (
        "deployment_guide_backfill",
        backfill_deployment_guides,
        (),
        settings.DEPLOYMENT_GUIDE_BACKFILL_INTERVAL_HOURS,
    ),
    ("sandbox_manifest_scan", scan_sandbox_manifests, (), settings.SANDBOX_MANIFEST_SCAN_INTERVAL_HOURS),
    ("sandbox_reaper", reap_stale_runs, (), settings.SANDBOX_REAP_INTERVAL_MINUTES / 60),
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # Startup used to fire all ~15 scrapers/backfills as concurrent tasks on
    # every boot, which OOM-killed this instance (shared-cpu-1x, 512MB;
    # confirmed via `fly machine status`, exit_code=137, oom_killed=true).
    # This app also redeploys roughly every few hours in practice, which
    # reset APScheduler's in-memory interval timer on every restart -- so
    # multi-hour-interval jobs (GitHub enrichment, README scraping, etc.)
    # were never actually reaching a first successful full pass in
    # production. catch_up_overdue_jobs runs each *genuinely* overdue job
    # (per the durable job_runs table, not the in-memory timer) exactly once,
    # sequentially rather than concurrently, so a restart makes real progress
    # without reintroducing the concurrent-burst OOM.
    asyncio.create_task(catch_up_overdue_jobs(_JOBS))
    logger.info("Catch-up pass for overdue jobs started in background")

    scheduler = AsyncIOScheduler()
    for job_id, fn, args, interval_hours in _JOBS:
        scheduler.add_job(
            run_locked,
            "interval",
            hours=interval_hours,
            args=[job_id, fn, *args],
            id=job_id,
            max_instances=1,
        )
    scheduler.start()
    logger.info("Scheduler started with %d jobs", len(_JOBS))

    yield

    scheduler.shutdown(wait=False)
    await close_db()
    logger.info("Tracent shut down cleanly")


app = FastAPI(
    title="Tracent Registry",
    description="Trust and verification registry for AI agents.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(trust_router)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(public_router)
app.include_router(profiles_router)
app.include_router(sandbox_router)
app.include_router(sandbox_internal_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
