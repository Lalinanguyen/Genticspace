import logging
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.db.auth import verify_api_key
from app.db.database import get_conn
from app.services.ard_crawler import crawl_ard
from app.services.description_backfill import (
    backfill_connects,
    backfill_erc8004,
    backfill_github,
    backfill_huggingface,
)
from app.services.github_profile_scraper import scrape_github_profiles
from app.services.github_scraper import scrape_github
from app.services.huggingface_profile_scraper import scrape_huggingface_profiles
from app.services.huggingface_scraper import scrape_huggingface
from app.services.futurepedia_scraper import backfill_futurepedia, scrape_futurepedia
from app.services.indexer import ingest_agents
from app.services.npm_scraper import backfill_npm, scrape_npm
from app.services.readme_scraper import scrape_readmes
from app.services.verifier import run_verification_review

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_api_key)])


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------

@router.get("/admin/stats", tags=["admin"])
async def admin_stats():
    async with get_conn() as conn:
        total_agents = await conn.fetchval("SELECT COUNT(*) FROM agents")
        verified_count = await conn.fetchval("SELECT COUNT(*) FROM agents WHERE verified = TRUE")
        flagged_count = await conn.fetchval(
            "SELECT COUNT(DISTINCT tracent_id) FROM reputation_flags"
        )
        index_rows = await conn.fetch("SELECT source, last_indexed_block FROM index_state")

    return {
        "total_agents": total_agents,
        "verified_count": verified_count,
        "flagged_count": flagged_count,
        "index_state": [dict(r) for r in index_rows],
    }


@router.post("/admin/index", tags=["admin"])
async def admin_trigger_index(background_tasks: BackgroundTasks):
    background_tasks.add_task(ingest_agents, "erc8004")
    return {"status": "indexing started", "source": "erc8004"}


@router.post("/admin/crawl-ard", tags=["admin"])
async def admin_trigger_crawl_ard(background_tasks: BackgroundTasks):
    background_tasks.add_task(crawl_ard)
    return {"status": "crawl started", "source": "ard"}


@router.post("/admin/scrape-huggingface", tags=["admin"])
async def admin_trigger_scrape_huggingface(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_huggingface)
    return {"status": "scrape started", "source": "huggingface"}


@router.post("/admin/scrape-huggingface-profiles", tags=["admin"])
async def admin_trigger_scrape_huggingface_profiles(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_huggingface_profiles)
    return {"status": "scrape started", "source": "huggingface_profiles"}


@router.post("/admin/scrape-github", tags=["admin"])
async def admin_trigger_scrape_github(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_github)
    return {"status": "scrape started", "source": "github"}


@router.get("/admin/huggingface-profiles", tags=["admin"])
async def admin_list_huggingface_profiles():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT username, profile_type, display_name, avatar_url, bio,
                   is_pro, is_verified, num_models, num_datasets, num_spaces, num_followers,
                   detected_libs, agent_count, first_seen, last_updated
            FROM huggingface_profiles
            ORDER BY num_followers DESC NULLS LAST
            """
        )
    return {"profiles": [dict(r) for r in rows]}


@router.post("/admin/scrape-github-profiles", tags=["admin"])
async def admin_trigger_scrape_github_profiles(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_github_profiles)
    return {"status": "scrape started", "source": "github_profiles"}


@router.post("/admin/scrape-readmes", tags=["admin"])
async def admin_trigger_scrape_readmes(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_readmes)
    return {"status": "scrape started", "source": "readmes"}


@router.post("/admin/scrape-npm", tags=["admin"])
async def admin_trigger_scrape_npm(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_npm)
    return {"status": "scrape started", "source": "npm"}


@router.post("/admin/scrape-futurepedia", tags=["admin"])
async def admin_trigger_scrape_futurepedia(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_futurepedia)
    return {"status": "scrape started", "source": "futurepedia"}


@router.post("/admin/backfill-descriptions", tags=["admin"])
async def admin_trigger_backfill_descriptions(background_tasks: BackgroundTasks):
    background_tasks.add_task(backfill_erc8004)
    background_tasks.add_task(backfill_github)
    background_tasks.add_task(backfill_huggingface)
    background_tasks.add_task(backfill_npm)
    background_tasks.add_task(backfill_futurepedia)
    background_tasks.add_task(backfill_connects)
    return {
        "status": "backfill started",
        "sources": ["erc8004", "github", "huggingface", "npm", "futurepedia", "connects"],
    }


@router.post("/admin/backfill-npm", tags=["admin"])
async def admin_trigger_backfill_npm(background_tasks: BackgroundTasks):
    background_tasks.add_task(backfill_npm)
    return {"status": "backfill started", "source": "npm"}


@router.post("/admin/backfill-futurepedia", tags=["admin"])
async def admin_trigger_backfill_futurepedia(background_tasks: BackgroundTasks):
    background_tasks.add_task(backfill_futurepedia)
    return {"status": "backfill started", "source": "futurepedia"}


@router.get("/admin/github-profiles", tags=["admin"])
async def admin_list_github_profiles():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT username, profile_type, display_name, avatar_url, bio,
                   company, location, blog_url, twitter_handle,
                   public_repos, followers, following,
                   detected_languages, detected_libs, repos_analyzed,
                   first_seen, last_updated
            FROM github_profiles
            ORDER BY followers DESC NULLS LAST
            """
        )
    return {"profiles": [dict(r) for r in rows]}


class ArdDomainBody(BaseModel):
    domain: str


@router.post("/admin/ard-domains", tags=["admin"])
async def admin_add_ard_domain(body: ArdDomainBody):
    domain = body.domain.strip().lower()
    if not domain:
        raise HTTPException(400, "domain must not be empty")
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO ard_domains (domain, active)
            VALUES ($1, TRUE)
            ON CONFLICT (domain) DO UPDATE SET active = TRUE
            """,
            domain,
        )
    return {"domain": domain, "status": "added"}


@router.get("/admin/ard-domains", tags=["admin"])
async def admin_list_ard_domains():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT domain, added_at, last_crawled, agent_count, active
            FROM ard_domains
            ORDER BY domain
            """
        )
    return {"domains": [dict(r) for r in rows]}


class ReviewBody(BaseModel):
    action: Literal["approve", "reject"]
    reviewer_note: Optional[str] = None


@router.post("/admin/verify/{tracent_id}", tags=["admin"])
async def admin_verify(tracent_id: str, body: ReviewBody):
    async with get_conn() as conn:
        req = await conn.fetchrow(
            """
            SELECT id FROM verification_requests
            WHERE tracent_id = $1 AND status = 'pending'
            ORDER BY submitted_at DESC LIMIT 1
            """,
            tracent_id,
        )
    if not req:
        raise HTTPException(404, f"No pending verification request for {tracent_id}")

    try:
        await run_verification_review(req["id"], body.action, body.reviewer_note or "")
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return {"request_id": req["id"], "action": body.action, "status": body.action + "d"}


@router.get("/admin/reviews", tags=["admin"])
async def admin_list_reviews():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT vr.*, a.name AS agent_name
            FROM verification_requests vr
            JOIN agents a ON a.tracent_id = vr.tracent_id
            WHERE vr.status = 'pending'
            ORDER BY vr.submitted_at ASC
            """
        )
    return {"reviews": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Verification request routes (public — auth still required via router dep)
# ---------------------------------------------------------------------------

class VerifyRequestBody(BaseModel):
    tracent_id: str
    requester_email: str


@router.post("/verify/request", tags=["verification"])
async def submit_verification_request(body: VerifyRequestBody):
    async with get_conn() as conn:
        agent = await conn.fetchrow(
            "SELECT tracent_id FROM agents WHERE tracent_id = $1", body.tracent_id
        )
        if not agent:
            raise HTTPException(404, f"Agent {body.tracent_id} not found")

        row = await conn.fetchrow(
            """
            INSERT INTO verification_requests (tracent_id, requester_email)
            VALUES ($1, $2)
            RETURNING id, status
            """,
            body.tracent_id, body.requester_email,
        )
    return {"request_id": row["id"], "status": row["status"]}


@router.get("/verify/status/{tracent_id}", tags=["verification"])
async def verification_status(tracent_id: str):
    async with get_conn() as conn:
        agent = await conn.fetchrow(
            "SELECT verified, trust_tier, verified_at FROM agents WHERE tracent_id = $1",
            tracent_id,
        )
        if not agent:
            raise HTTPException(404, f"Agent {tracent_id} not found")

        latest_request = await conn.fetchrow(
            """
            SELECT id, status, submitted_at, reviewed_at, reviewer_note
            FROM verification_requests
            WHERE tracent_id = $1
            ORDER BY submitted_at DESC LIMIT 1
            """,
            tracent_id,
        )

    result = {
        "tracent_id": tracent_id,
        "verified": agent["verified"],
        "trust_tier": agent["trust_tier"],
        "verified_at": agent["verified_at"],
        "latest_request": dict(latest_request) if latest_request else None,
    }
    return result
