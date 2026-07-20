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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Starting background index on startup")
    asyncio.create_task(ingest_agents("erc8004"))
    asyncio.create_task(crawl_ard())
    asyncio.create_task(scrape_huggingface())
    asyncio.create_task(scrape_huggingface_profiles())
    asyncio.create_task(scrape_github())
    asyncio.create_task(scrape_github_profiles())
    asyncio.create_task(scrape_readmes())
    asyncio.create_task(scrape_npm())
    asyncio.create_task(scrape_futurepedia())
    asyncio.create_task(backfill_erc8004())
    asyncio.create_task(backfill_github())
    asyncio.create_task(backfill_huggingface())
    asyncio.create_task(backfill_npm())
    asyncio.create_task(backfill_futurepedia())
    asyncio.create_task(backfill_connects())

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

app.include_router(agents_router)
app.include_router(trust_router)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(public_router)
app.include_router(profiles_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
