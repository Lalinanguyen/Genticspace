import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from app.config import settings
from app.db.database import close_db, init_db
from app.routes.admin import router as admin_router
from app.routes.agents import router as agents_router
from app.routes.trust import router as trust_router
from app.services.ard_crawler import crawl_ard
from app.services.endpoint_checker import check_all_endpoints
from app.services.indexer import ingest_agents

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
        check_all_endpoints,
        "interval",
        minutes=settings.ENDPOINT_CHECK_INTERVAL_MINUTES,
        id="check_endpoints",
    )
    scheduler.start()
    logger.info(
        "Scheduler started: index every %dm, endpoint checks every %dm",
        settings.INDEX_INTERVAL_MINUTES,
        settings.ENDPOINT_CHECK_INTERVAL_MINUTES,
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

app.include_router(agents_router)
app.include_router(trust_router)
app.include_router(admin_router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
