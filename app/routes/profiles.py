import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr

from app.db.database import get_conn
from app.db.jwt_auth import get_current_user, get_current_user_optional
from app.services.mailer import send_contact_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["profiles"])


# ---------------------------------------------------------------------------
# Individual user public profile
# ---------------------------------------------------------------------------
@router.get("/users/{user_id}")
async def get_user_profile(user_id: int, current_user: Optional[dict] = Depends(get_current_user_optional)):
    is_owner = bool(current_user and current_user["id"] == user_id)

    async with get_conn() as conn:
        user = await conn.fetchrow(
            """
            SELECT id, name, account_type, bio, purposes, experience_level,
                   github_username, x_handle, linkedin_handle, website_url,
                   huggingface_handle, other_link, is_private, show_follower_count,
                   created_at
            FROM users WHERE id = $1
            """,
            user_id,
        )
        if not user:
            raise HTTPException(404, "User not found")

        profile = dict(user)
        private = profile["is_private"] and not is_owner
        profile["is_owner"] = is_owner

        follower_count = await conn.fetchval(
            "SELECT COUNT(*) FROM follows WHERE followed_user_id = $1", user_id
        )
        if profile["show_follower_count"] or is_owner:
            profile["follower_count"] = follower_count
        else:
            profile["follower_count"] = None

        profile["is_following"] = False
        if current_user and not is_owner:
            profile["is_following"] = bool(
                await conn.fetchval(
                    "SELECT 1 FROM follows WHERE follower_id = $1 AND followed_user_id = $2",
                    current_user["id"], user_id,
                )
            )

        if private:
            return {
                "id": profile["id"],
                "name": profile["name"],
                "is_private": True,
                "is_owner": False,
                "follower_count": profile["follower_count"],
                "is_following": profile["is_following"],
            }

        visibility_clause = "" if is_owner else "AND a.is_private IS NOT TRUE"

        contributions = await conn.fetch(
            f"""
            SELECT a.* FROM agents a
            WHERE a.submitted_by = $1 {visibility_clause}
            ORDER BY a.first_seen DESC
            """,
            user_id,
        )
        favorites = await conn.fetch(
            f"""
            SELECT a.* FROM agent_favorites f
            JOIN agents a ON a.tracent_id = f.tracent_id
            WHERE f.user_id = $1 {visibility_clause}
            ORDER BY f.created_at DESC
            """,
            user_id,
        )
        reviews = await conn.fetch(
            """
            SELECT r.id, r.rating, r.text, r.created_at, a.tracent_id, a.name AS agent_name
            FROM reviews r JOIN agents a ON a.tracent_id = r.tracent_id
            WHERE r.user_id = $1
            ORDER BY r.created_at DESC
            """,
            user_id,
        )
        companies = await conn.fetch(
            """
            SELECT DISTINCT org_source AS source, followed_org AS name
            FROM follows WHERE follower_id = $1 AND followed_org IS NOT NULL
            """,
            user_id,
        )

    profile["contributions"] = [dict(r) for r in contributions]
    profile["favorites"] = [dict(r) for r in favorites]
    profile["reviews"] = [dict(r) for r in reviews]
    profile["companies_followed"] = [dict(r) for r in companies]
    return profile


# ---------------------------------------------------------------------------
# Company / provider-org public profile
# ---------------------------------------------------------------------------
@router.get("/orgs/{source}/{org}")
async def get_org_profile(
    source: str, org: str, current_user: Optional[dict] = Depends(get_current_user_optional)
):
    async with get_conn() as conn:
        agents = await conn.fetch(
            """
            SELECT * FROM agents
            WHERE source = $1 AND provider_org = $2 AND is_private IS NOT TRUE
            ORDER BY first_seen DESC
            """,
            source, org,
        )
        if not agents:
            raise HTTPException(404, "Company profile not found")

        followers = await conn.fetchval(
            """
            SELECT CASE
                WHEN $1 = 'huggingface' THEN (SELECT num_followers FROM huggingface_profiles WHERE username = $2)
                WHEN $1 = 'github' THEN (SELECT followers FROM github_profiles WHERE username = $2)
                ELSE NULL
            END
            """,
            source, org,
        )

        tracent_ids = [a["tracent_id"] for a in agents]
        reviews = await conn.fetch(
            """
            SELECT r.id, r.rating, r.text, r.created_at, a.tracent_id, a.name AS agent_name,
                   u.name AS author_name
            FROM reviews r
            JOIN agents a ON a.tracent_id = r.tracent_id
            JOIN users u ON u.id = r.user_id
            WHERE r.tracent_id = ANY($1::text[])
            ORDER BY r.created_at DESC
            LIMIT 50
            """,
            tracent_ids,
        )
        avg_rating = await conn.fetchval(
            "SELECT AVG(rating) FROM reviews WHERE tracent_id = ANY($1::text[])", tracent_ids
        )

        is_following = False
        if current_user:
            is_following = bool(
                await conn.fetchval(
                    "SELECT 1 FROM follows WHERE follower_id = $1 AND org_source = $2 AND followed_org = $3",
                    current_user["id"], source, org,
                )
            )

    industry_tags: list[str] = []
    for a in agents:
        for tag in a["industry_tags"] or []:
            if tag not in industry_tags:
                industry_tags.append(tag)

    return {
        "source": source,
        "name": org,
        "agents": [dict(a) for a in agents],
        "agent_count": len(agents),
        "followers": followers or 0,
        "industry_tags": industry_tags,
        "reviews": [dict(r) for r in reviews],
        "avg_rating": float(avg_rating) if avg_rating is not None else None,
        "is_following": is_following,
    }


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------
@router.post("/agents/{tracent_id}/favorite")
async def favorite_agent(tracent_id: str, current_user: dict = Depends(get_current_user)):
    async with get_conn() as conn:
        exists = await conn.fetchval("SELECT 1 FROM agents WHERE tracent_id = $1", tracent_id)
        if not exists:
            raise HTTPException(404, f"Agent {tracent_id} not found")
        await conn.execute(
            """
            INSERT INTO agent_favorites (user_id, tracent_id) VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            current_user["id"], tracent_id,
        )
    return {"status": "favorited"}


@router.delete("/agents/{tracent_id}/favorite")
async def unfavorite_agent(tracent_id: str, current_user: dict = Depends(get_current_user)):
    async with get_conn() as conn:
        await conn.execute(
            "DELETE FROM agent_favorites WHERE user_id = $1 AND tracent_id = $2",
            current_user["id"], tracent_id,
        )
    return {"status": "unfavorited"}


# ---------------------------------------------------------------------------
# Follows
# ---------------------------------------------------------------------------
@router.post("/follow/user/{user_id}")
async def follow_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if user_id == current_user["id"]:
        raise HTTPException(400, "You can't follow yourself")
    async with get_conn() as conn:
        exists = await conn.fetchval("SELECT 1 FROM users WHERE id = $1", user_id)
        if not exists:
            raise HTTPException(404, "User not found")
        await conn.execute(
            """
            INSERT INTO follows (follower_id, followed_user_id) VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            current_user["id"], user_id,
        )
    return {"status": "following"}


@router.delete("/follow/user/{user_id}")
async def unfollow_user(user_id: int, current_user: dict = Depends(get_current_user)):
    async with get_conn() as conn:
        await conn.execute(
            "DELETE FROM follows WHERE follower_id = $1 AND followed_user_id = $2",
            current_user["id"], user_id,
        )
    return {"status": "unfollowed"}


class FollowOrgBody(BaseModel):
    source: str
    org: str


@router.post("/follow/org")
async def follow_org(body: FollowOrgBody, current_user: dict = Depends(get_current_user)):
    async with get_conn() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM agents WHERE source = $1 AND provider_org = $2 LIMIT 1",
            body.source, body.org,
        )
        if not exists:
            raise HTTPException(404, "Company not found")
        await conn.execute(
            """
            INSERT INTO follows (follower_id, org_source, followed_org) VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            """,
            current_user["id"], body.source, body.org,
        )
    return {"status": "following"}


@router.delete("/follow/org")
async def unfollow_org(source: str, org: str, current_user: dict = Depends(get_current_user)):
    async with get_conn() as conn:
        await conn.execute(
            "DELETE FROM follows WHERE follower_id = $1 AND org_source = $2 AND followed_org = $3",
            current_user["id"], source, org,
        )
    return {"status": "unfollowed"}


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
class ReviewBody(BaseModel):
    rating: int
    text: Optional[str] = None


@router.get("/agents/{tracent_id}/reviews")
async def list_agent_reviews(tracent_id: str):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT r.id, r.rating, r.text, r.created_at, u.id AS user_id, u.name AS author_name
            FROM reviews r JOIN users u ON u.id = r.user_id
            WHERE r.tracent_id = $1
            ORDER BY r.created_at DESC
            """,
            tracent_id,
        )
        avg_rating = await conn.fetchval("SELECT AVG(rating) FROM reviews WHERE tracent_id = $1", tracent_id)
    return {
        "reviews": [dict(r) for r in rows],
        "avg_rating": float(avg_rating) if avg_rating is not None else None,
    }


@router.post("/agents/{tracent_id}/reviews")
async def upsert_agent_review(
    tracent_id: str, body: ReviewBody, current_user: dict = Depends(get_current_user)
):
    if not 1 <= body.rating <= 5:
        raise HTTPException(400, "Rating must be between 1 and 5")

    async with get_conn() as conn:
        exists = await conn.fetchval("SELECT 1 FROM agents WHERE tracent_id = $1", tracent_id)
        if not exists:
            raise HTTPException(404, f"Agent {tracent_id} not found")

        row = await conn.fetchrow(
            """
            INSERT INTO reviews (tracent_id, user_id, rating, text)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (tracent_id, user_id) DO UPDATE SET
                rating = EXCLUDED.rating, text = EXCLUDED.text
            RETURNING id, rating, text, created_at
            """,
            tracent_id, current_user["id"], body.rating, body.text,
        )
    return dict(row)


# ---------------------------------------------------------------------------
# Contact
# ---------------------------------------------------------------------------
class ContactBody(BaseModel):
    email: EmailStr
    topic: Optional[str] = None
    message: str


@router.post("/contact")
async def contact(body: ContactBody):
    if not body.message.strip():
        raise HTTPException(400, "Message is required")

    async with get_conn() as conn:
        await conn.execute(
            "INSERT INTO contact_messages (email, topic, message) VALUES ($1, $2, $3)",
            body.email, body.topic, body.message.strip(),
        )
    send_contact_email(body.email, body.topic or "", body.message.strip())
    return {"status": "sent"}
