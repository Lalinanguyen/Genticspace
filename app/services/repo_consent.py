"""
Consent-flow state machine for the Repo Completion pipeline. A consent
record is created for any candidate source repo whose license classified as
copyleft/unlicensed/unknown (app/services/license_classifier.py) -- a
permissive-licensed source never touches this module, it's cleared to merge
automatically.

State machine: pending -> declined | consented | expired. Nothing outside
this module is allowed to move a record straight to "consented" -- that only
happens through resolve_consent, so there's exactly one place that ever
writes a binding consent decision.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.config import settings
from app.db.database import get_conn
from app.services.mailer import send_outreach_email

logger = logging.getLogger(__name__)

_ACTIVE_STATUSES = ("pending",)


async def request_consent(source_id: int, rights_holder_email: str, terms: dict) -> dict:
    """Creates a pending consent_records row for a candidate source and
    sends (or, with SMTP unconfigured, logs) the outreach email. terms is a
    small JSON-able dict, e.g. {"type": "revenue_share", "pct": 5} or
    {"type": "flat_fee", "amount_usd": 50} -- stored verbatim as the record
    of what was offered, independent of whatever the rights holder actually
    agrees to later."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO consent_records (source_id, rights_holder_email, status, terms, outreach_sent_at)
            VALUES ($1, $2, 'pending', $3, NOW())
            RETURNING *
            """,
            source_id, rights_holder_email, terms,
        )
        source = await conn.fetchrow(
            "SELECT repo_url FROM repo_completion_sources WHERE id = $1", source_id
        )

    terms_summary = _summarize_terms(terms)
    send_outreach_email(rights_holder_email, source["repo_url"] if source else "the repository", terms_summary)
    logger.info("Consent requested: record %d, source %d, %s", row["id"], source_id, terms_summary)
    return dict(row)


async def resolve_consent(
    record_id: int, decision: Literal["consented", "declined"], terms: dict | None = None
) -> dict | None:
    """The one place a consent_records row is allowed to leave 'pending' as
    a real (non-expiry) decision. Returns None if the record doesn't exist
    or has already left the pending state -- callers should treat that as
    "nothing to do" rather than an error, since a rights holder replying
    twice (e.g. to a stale email thread) shouldn't be able to flip an
    already-resolved decision."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE consent_records
            SET status = $2, responded_at = NOW(), terms = COALESCE($3, terms)
            WHERE id = $1 AND status = 'pending'
            RETURNING *
            """,
            record_id, decision, terms,
        )
    if row:
        logger.info("Consent %s: record %d", decision, record_id)
    return dict(row) if row else None


async def expire_stale_consent_requests() -> None:
    """Periodic job (registered in app/main.py's _JOBS) -- flips pending
    consent requests older than CONSENT_REQUEST_TTL_DAYS to 'expired' so a
    non-response doesn't leave a candidate source in limbo forever. An
    expired request is treated the same as 'declined' by anything gating on
    consent status -- the source just never becomes usable."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.CONSENT_REQUEST_TTL_DAYS)
    async with get_conn() as conn:
        expired = await conn.fetch(
            """
            UPDATE consent_records
            SET status = 'expired'
            WHERE status = 'pending' AND outreach_sent_at < $1
            RETURNING id
            """,
            cutoff,
        )
    if expired:
        logger.info("Consent requests expired: %d", len(expired))


def _summarize_terms(terms: dict) -> str:
    if terms.get("type") == "revenue_share":
        return f"{terms.get('pct', '?')}% revenue share"
    if terms.get("type") == "flat_fee":
        return f"${terms.get('amount_usd', '?')} flat fee"
    return str(terms)
