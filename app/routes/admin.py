import logging
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.db.auth import hash_api_key, verify_admin_key
from app.db.database import get_conn
from app.services.ard_crawler import crawl_ard
from app.services.deployment_guide import backfill_deployment_guides
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
from app.services.yc_scraper import scrape_ycombinator

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_admin_key)])


async def log_admin_action(conn, actor: str, action: str, target: Optional[str], detail: Optional[str] = None) -> None:
    await conn.execute(
        "INSERT INTO admin_actions (actor, action, target, detail) VALUES ($1, $2, $3, $4)",
        actor, action, target, detail,
    )


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
        job_rows = await conn.fetch(
            "SELECT job_id, last_started_at, last_finished_at FROM job_runs ORDER BY job_id"
        )

    return {
        "total_agents": total_agents,
        "verified_count": verified_count,
        "flagged_count": flagged_count,
        "index_state": [dict(r) for r in index_rows],
        "job_runs": [dict(r) for r in job_rows],
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


@router.post("/admin/scrape-ycombinator", tags=["admin"])
async def admin_trigger_scrape_ycombinator(background_tasks: BackgroundTasks):
    background_tasks.add_task(scrape_ycombinator)
    return {"status": "scrape started", "source": "ycombinator"}


@router.post("/admin/backfill-npm", tags=["admin"])
async def admin_trigger_backfill_npm(background_tasks: BackgroundTasks):
    background_tasks.add_task(backfill_npm)
    return {"status": "backfill started", "source": "npm"}


@router.post("/admin/backfill-futurepedia", tags=["admin"])
async def admin_trigger_backfill_futurepedia(background_tasks: BackgroundTasks):
    background_tasks.add_task(backfill_futurepedia)
    return {"status": "backfill started", "source": "futurepedia"}


@router.post("/admin/backfill-deployment-guides", tags=["admin"])
async def admin_trigger_backfill_deployment_guides(background_tasks: BackgroundTasks):
    background_tasks.add_task(backfill_deployment_guides)
    return {"status": "backfill started", "source": "deployment_guides"}


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
async def admin_verify(tracent_id: str, body: ReviewBody, actor: str = Depends(verify_admin_key)):
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

        await log_admin_action(conn, actor, f"verification_{body.action}", tracent_id, body.reviewer_note)

    return {"request_id": req["id"], "action": body.action, "status": body.action + "d"}


# ---------------------------------------------------------------------------
# Pending verification requests — this used to live at GET /admin/reviews,
# which was misleading: it has never queried the `reviews` table (agent
# star-ratings), only `verification_requests`. Renamed so /admin/reviews
# below can mean what it says.
# ---------------------------------------------------------------------------
@router.get("/admin/verification-requests", tags=["admin"])
async def admin_list_verification_requests():
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
    return {"verification_requests": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Agent reviews (real reviews table — star ratings left by users).
# ---------------------------------------------------------------------------
@router.get("/admin/reviews", tags=["admin"])
async def admin_list_reviews():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT r.id, r.tracent_id, a.name AS agent_name, r.user_id, u.name AS author_name,
                   r.rating, r.text, r.created_at
            FROM reviews r
            JOIN agents a ON a.tracent_id = r.tracent_id
            JOIN users u ON u.id = r.user_id
            ORDER BY r.created_at DESC
            """
        )
    return {"reviews": [dict(r) for r in rows]}


@router.delete("/admin/reviews/{review_id}", tags=["admin"])
async def admin_delete_review(review_id: int, actor: str = Depends(verify_admin_key)):
    async with get_conn() as conn:
        deleted = await conn.fetchval(
            "DELETE FROM reviews WHERE id = $1 RETURNING id", review_id
        )
        if not deleted:
            raise HTTPException(404, f"Review {review_id} not found")
        await log_admin_action(conn, actor, "review_delete", str(review_id))
    return {"status": "deleted", "review_id": review_id}


# ---------------------------------------------------------------------------
# Reputation flags (auto-generated by app/services/verifier.py's
# _upsert_flag). "Resolving" one here means an admin has manually decided
# it's a non-issue -- it just deletes the row; if the underlying condition
# still holds next time run_auto_verification runs, _upsert_flag will
# re-create it, same as any other flag.
# ---------------------------------------------------------------------------
@router.get("/admin/flags", tags=["admin"])
async def admin_list_flags():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT f.id, f.tracent_id, a.name AS agent_name, f.flag_type, f.severity,
                   f.detail, f.flagged_at
            FROM reputation_flags f
            JOIN agents a ON a.tracent_id = f.tracent_id
            ORDER BY f.flagged_at DESC
            """
        )
    return {"flags": [dict(r) for r in rows]}


@router.delete("/admin/flags/{flag_id}", tags=["admin"])
async def admin_resolve_flag(flag_id: int, actor: str = Depends(verify_admin_key)):
    async with get_conn() as conn:
        deleted = await conn.fetchval(
            "DELETE FROM reputation_flags WHERE id = $1 RETURNING id", flag_id
        )
        if not deleted:
            raise HTTPException(404, f"Flag {flag_id} not found")
        await log_admin_action(conn, actor, "flag_resolve", str(flag_id))
    return {"status": "resolved", "flag_id": flag_id}


# ---------------------------------------------------------------------------
# Self-listed agent moderation (submitted_by IS NOT NULL — the Contribute flow).
# ---------------------------------------------------------------------------
@router.get("/admin/listings", tags=["admin"])
async def admin_list_listings():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT a.tracent_id, a.name, a.description, a.is_active, a.verified,
                   a.trust_tier, a.risk_score, a.submitted_by, u.email AS submitted_by_email,
                   a.first_seen
            FROM agents a
            JOIN users u ON u.id = a.submitted_by
            WHERE a.submitted_by IS NOT NULL
            ORDER BY a.first_seen DESC
            """
        )
    return {"listings": [dict(r) for r in rows]}


@router.post("/admin/listings/{tracent_id}/unpublish", tags=["admin"])
async def admin_unpublish_listing(tracent_id: str, actor: str = Depends(verify_admin_key)):
    async with get_conn() as conn:
        updated = await conn.fetchval(
            """
            UPDATE agents SET is_active = FALSE
            WHERE tracent_id = $1 AND submitted_by IS NOT NULL
            RETURNING tracent_id
            """,
            tracent_id,
        )
        if not updated:
            raise HTTPException(404, f"Self-listed agent {tracent_id} not found")
        await log_admin_action(conn, actor, "listing_unpublish", tracent_id)
    return {"status": "unpublished", "tracent_id": tracent_id}


@router.delete("/admin/listings/{tracent_id}", tags=["admin"])
async def admin_delete_listing(tracent_id: str, actor: str = Depends(verify_admin_key)):
    async with get_conn() as conn:
        deleted = await conn.fetchval(
            """
            DELETE FROM agents WHERE tracent_id = $1 AND submitted_by IS NOT NULL
            RETURNING tracent_id
            """,
            tracent_id,
        )
        if not deleted:
            raise HTTPException(404, f"Self-listed agent {tracent_id} not found")
        await log_admin_action(conn, actor, "listing_delete", tracent_id)
    return {"status": "deleted", "tracent_id": tracent_id}


# ---------------------------------------------------------------------------
# Sandbox mode admin kill switch (see sandbox_cohort in app/db/database.py).
# This table is admission-only scaffolding — it doesn't mean anything
# actually executes yet. `enable` exists only so the admin UI has a row to
# toggle; `disable` is the real requirement (force sandbox off for an agent).
# ---------------------------------------------------------------------------
@router.get("/admin/sandbox", tags=["admin"])
async def admin_list_sandbox_cohort():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT sc.tracent_id, a.name AS agent_name, sc.status,
                   sc.admitted_by, sc.admitted_at, sc.manifest_path
            FROM sandbox_cohort sc
            JOIN agents a ON a.tracent_id = sc.tracent_id
            ORDER BY sc.admitted_at DESC
            """
        )
    return {"sandbox_cohort": [dict(r) for r in rows]}


@router.post("/admin/sandbox/{tracent_id}/enable", tags=["admin"])
async def admin_enable_sandbox(tracent_id: str, actor: str = Depends(verify_admin_key)):
    async with get_conn() as conn:
        agent = await conn.fetchval("SELECT 1 FROM agents WHERE tracent_id = $1", tracent_id)
        if not agent:
            raise HTTPException(404, f"Agent {tracent_id} not found")
        await conn.execute(
            """
            INSERT INTO sandbox_cohort (tracent_id, admitted_by, status)
            VALUES ($1, $2, 'approved')
            ON CONFLICT (tracent_id) DO UPDATE SET status = 'approved'
            """,
            tracent_id, actor,
        )
        await log_admin_action(conn, actor, "sandbox_enable", tracent_id)
    return {"tracent_id": tracent_id, "status": "approved"}


@router.post("/admin/sandbox/{tracent_id}/disable", tags=["admin"])
async def admin_disable_sandbox(tracent_id: str, actor: str = Depends(verify_admin_key)):
    async with get_conn() as conn:
        updated = await conn.fetchval(
            "UPDATE sandbox_cohort SET status = 'disabled' WHERE tracent_id = $1 RETURNING tracent_id",
            tracent_id,
        )
        if not updated:
            raise HTTPException(404, f"No sandbox cohort entry for {tracent_id}")
        await log_admin_action(conn, actor, "sandbox_disable", tracent_id)
    return {"tracent_id": tracent_id, "status": "disabled"}


# ---------------------------------------------------------------------------
# API key management. Minting a key requires an existing admin key (master
# or per-client). The raw key is returned exactly once, here; only its
# sha256 hash is persisted.
# ---------------------------------------------------------------------------
class ApiKeyCreateBody(BaseModel):
    owner_email: str
    label: Optional[str] = None
    scope: Literal["admin", "partner"] = "partner"


@router.post("/admin/api-keys", tags=["admin"], status_code=201)
async def admin_create_api_key(body: ApiKeyCreateBody, actor: str = Depends(verify_admin_key)):
    raw_key = secrets.token_hex(32)
    key_hash = hash_api_key(raw_key)

    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO api_keys (key_hash, owner_email, label, scope)
            VALUES ($1, $2, $3, $4)
            RETURNING id, owner_email, label, scope, created_at
            """,
            key_hash, body.owner_email, body.label, body.scope,
        )
        await log_admin_action(conn, actor, "api_key_create", body.owner_email, f"scope={body.scope}")

    return {
        "id": row["id"],
        "api_key": raw_key,
        "owner_email": row["owner_email"],
        "label": row["label"],
        "scope": row["scope"],
        "created_at": row["created_at"],
        "note": "Store this key now — it will not be shown again. Only its hash is stored server-side.",
    }


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
