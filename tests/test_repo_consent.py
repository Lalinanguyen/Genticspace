from datetime import datetime, timedelta, timezone

import pytest

from app.services import repo_consent
from tests.fake_db import FakeDB, make_fake_get_conn


@pytest.fixture
def db():
    return FakeDB()


@pytest.fixture(autouse=True)
def _wire_db(db, monkeypatch):
    monkeypatch.setattr(repo_consent, "get_conn", make_fake_get_conn(db))


@pytest.fixture
def sent_outreach(monkeypatch):
    sent = []
    monkeypatch.setattr(
        repo_consent, "send_outreach_email",
        lambda email, repo_url, terms_summary: sent.append((email, repo_url, terms_summary)),
    )
    return sent


def _seed_source(db, source_id=1, repo_url="https://github.com/owner/repo"):
    db.repo_completion_sources[source_id] = {"id": source_id, "repo_url": repo_url}


async def test_request_consent_creates_pending_record_and_sends_outreach(db, sent_outreach):
    _seed_source(db)

    record = await repo_consent.request_consent(1, "owner@example.com", {"type": "revenue_share", "pct": 5})

    assert record["status"] == "pending"
    assert record["source_id"] == 1
    assert record["rights_holder_email"] == "owner@example.com"
    assert record["outreach_sent_at"] is not None
    assert sent_outreach == [("owner@example.com", "https://github.com/owner/repo", "5% revenue share")]


async def test_request_consent_summarizes_flat_fee_terms(db, sent_outreach):
    _seed_source(db)

    await repo_consent.request_consent(1, "owner@example.com", {"type": "flat_fee", "amount_usd": 50})

    assert sent_outreach[0][2] == "$50 flat fee"


async def test_resolve_consent_transitions_pending_to_consented(db, sent_outreach):
    _seed_source(db)
    record = await repo_consent.request_consent(1, "owner@example.com", {"type": "flat_fee", "amount_usd": 50})

    resolved = await repo_consent.resolve_consent(record["id"], "consented")

    assert resolved["status"] == "consented"
    assert resolved["responded_at"] is not None


async def test_resolve_consent_transitions_pending_to_declined(db, sent_outreach):
    _seed_source(db)
    record = await repo_consent.request_consent(1, "owner@example.com", {"type": "flat_fee", "amount_usd": 50})

    resolved = await repo_consent.resolve_consent(record["id"], "declined")

    assert resolved["status"] == "declined"


async def test_resolve_consent_is_a_noop_on_already_resolved_record(db, sent_outreach):
    _seed_source(db)
    record = await repo_consent.request_consent(1, "owner@example.com", {"type": "flat_fee", "amount_usd": 50})
    await repo_consent.resolve_consent(record["id"], "declined")

    # A second, later reply shouldn't be able to flip an already-resolved decision.
    second = await repo_consent.resolve_consent(record["id"], "consented")

    assert second is None
    assert db.consent_records[record["id"]]["status"] == "declined"


async def test_resolve_consent_returns_none_for_unknown_record(db):
    assert await repo_consent.resolve_consent(999, "consented") is None


async def test_expire_stale_consent_requests_flips_only_old_pending_records(db, sent_outreach, monkeypatch):
    _seed_source(db, source_id=1)
    _seed_source(db, source_id=2, repo_url="https://github.com/owner/other")

    stale = await repo_consent.request_consent(1, "old@example.com", {"type": "flat_fee", "amount_usd": 10})
    fresh = await repo_consent.request_consent(2, "new@example.com", {"type": "flat_fee", "amount_usd": 10})

    # Backdate the first record's outreach past the TTL; leave the second alone.
    db.consent_records[stale["id"]]["outreach_sent_at"] = (
        datetime.now(timezone.utc) - timedelta(days=repo_consent.settings.CONSENT_REQUEST_TTL_DAYS + 1)
    )

    await repo_consent.expire_stale_consent_requests()

    assert db.consent_records[stale["id"]]["status"] == "expired"
    assert db.consent_records[fresh["id"]]["status"] == "pending"
