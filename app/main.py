import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.db.database import close_db, cleanup_expired_auth_tokens, init_db
from app.routes.admin import router as admin_router
from app.routes.agents import router as agents_router
from app.routes.auth import limiter, router as auth_router
from app.routes.profiles import router as profiles_router
from app.routes.public import router as public_router
from app.routes.trust import router as trust_router
from app.services.ard_crawler import crawl_ard
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
from app.services.npm_scraper import backfill_npm, scrape_npm
from app.services.readme_scraper import scrape_readmes
from app.services.yc_scraper import scrape_ycombinator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Startup used to fire all ~15 scrapers/backfills as concurrent tasks on
    # every boot. On this instance size (shared-cpu-1x, 512MB) that was
    # enough to OOM-kill the machine (confirmed via `fly machine status`,
    # exit_code=137, oom_killed=true) -- and since a restart re-triggers the
    # same startup burst, an OOM kill became a self-sustaining crash loop
    # that took the live site down. The catalog is already substantially
    # populated, so nothing here needs to run *immediately* on boot: the
    # APScheduler jobs below already cover every one of these on their own
    # interval (6-24h), so a fresh deploy/restart just waits for the next
    # scheduled tick instead of paying the full memory cost up front.
    # Revisit if the instance size ever changes.
    logger.info("Skipping immediate startup scrape/backfill burst; scheduler will pick these up on interval")

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        ingest_agents,
        "interval",
        minutes=settings.INDEX_INTERVAL_MINUTES,
        args=["erc8004"],
        id="index_erc8004",
    )
    scheduler.add_job(
        crawl_ard,
        "interval",
        hours=24,
        id="ard_crawler",
    )
    scheduler.add_job(
        scrape_huggingface,
        "interval",
        hours=settings.HF_SCRAPE_INTERVAL_HOURS,
        id="huggingface_scraper",
    )
    scheduler.add_job(
        scrape_huggingface_profiles,
        "interval",
        hours=settings.HF_SCRAPE_INTERVAL_HOURS,
        id="huggingface_profile_scraper",
    )
    scheduler.add_job(
        scrape_github,
        "interval",
        hours=settings.GITHUB_SCRAPE_INTERVAL_HOURS,
        id="github_scraper",
    )
    scheduler.add_job(
        scrape_github_profiles,
        "interval",
        hours=settings.GITHUB_SCRAPE_INTERVAL_HOURS,
        id="github_profile_scraper",
    )
    scheduler.add_job(
        scrape_readmes,
        "interval",
        hours=settings.README_SCRAPE_INTERVAL_HOURS,
        id="readme_scraper",
    )
    scheduler.add_job(
        check_all_endpoints,
        "interval",
        minutes=settings.ENDPOINT_CHECK_INTERVAL_MINUTES,
        id="check_endpoints",
    )
    scheduler.add_job(
        scrape_npm,
        "interval",
        hours=settings.NPM_SCRAPE_INTERVAL_HOURS,
        id="npm_scraper",
    )
    scheduler.add_job(
        scrape_futurepedia,
        "interval",
        hours=settings.FUTUREPEDIA_SCRAPE_INTERVAL_HOURS,
        id="futurepedia_scraper",
    )
    scheduler.add_job(
        backfill_erc8004,
        "interval",
        hours=6,
        id="backfill_erc8004",
    )
    scheduler.add_job(
        backfill_github,
        "interval",
        hours=settings.GITHUB_ENRICH_INTERVAL_HOURS,
        id="backfill_github",
    )
    scheduler.add_job(
        backfill_huggingface,
        "interval",
        hours=settings.HF_ENRICH_INTERVAL_HOURS,
        id="backfill_huggingface",
    )
    scheduler.add_job(
        backfill_connects,
        "interval",
        hours=6,
        id="backfill_connects",
    )
    scheduler.add_job(
        backfill_npm,
        "interval",
        hours=settings.NPM_ENRICH_INTERVAL_HOURS,
        id="backfill_npm",
    )
    scheduler.add_job(
        backfill_futurepedia,
        "interval",
        hours=settings.FUTUREPEDIA_ENRICH_INTERVAL_HOURS,
        id="backfill_futurepedia",
    )
    scheduler.add_job(
        scrape_ycombinator,
        "interval",
        hours=settings.YC_SCRAPE_INTERVAL_HOURS,
        id="ycombinator_scraper",
    )
    scheduler.add_job(
        cleanup_expired_auth_tokens,
        "interval",
        hours=settings.AUTH_TOKEN_CLEANUP_INTERVAL_HOURS,
        id="cleanup_expired_auth_tokens",
    )
    scheduler.start()
    logger.info(
        "Scheduler started: index every %dm, endpoint checks every %dm, HF scrape every %dh",
        settings.INDEX_INTERVAL_MINUTES,
        settings.ENDPOINT_CHECK_INTERVAL_MINUTES,
        settings.HF_SCRAPE_INTERVAL_HOURS,
    )

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

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _handle_rate_limit_exceeded(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Too many requests. Please try again later."},
    )
    return limiter._inject_headers(response, request.state.view_rate_limit)


app.include_router(agents_router)
app.include_router(trust_router)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(public_router)
app.include_router(profiles_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
