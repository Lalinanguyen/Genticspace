"""In-memory stand-in for the asyncpg connection used by auth/jwt_auth.

Real Postgres isn't available in this environment (no Docker, no local
install), so instead of hitting a live database these tests fake the
`get_conn()` connection with a small object that understands exactly the
queries app/routes/auth.py and app/db/jwt_auth.py issue. That's enough to
exercise the full request/response behavior of the auth flow (including
password hashing, OTP attempt-limiting, and token issuance) without a real
database. If those modules' SQL changes, the matching branch below needs to
change with it.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

USER_COLUMNS = [
    "id", "email", "account_type", "name", "company_name", "experience_level",
    "use_case", "purposes", "bio", "github_username", "x_handle", "linkedin_handle",
    "website_url", "huggingface_handle", "other_link", "email_verified", "created_at",
    "industry", "is_private", "show_follower_count", "notify_new_follower", "notify_agent_review",
]
SIGNUP_RETURNING_COLUMNS = USER_COLUMNS[:17]  # id .. created_at


def _norm(query: str) -> str:
    return " ".join(query.split())


def _project(row: dict, columns: list[str]) -> dict:
    return {c: row.get(c) for c in columns}


class FakeDB:
    def __init__(self):
        self._next_id = {"users": 1, "email_otps": 1, "password_reset_tokens": 1, "consent_records": 1}
        self.users: list[dict] = []
        self.email_otps: list[dict] = []
        self.password_reset_tokens: list[dict] = []
        self.repo_completion_sources: dict[int, dict] = {}
        self.consent_records: dict[int, dict] = {}

    def alloc_id(self, table: str) -> int:
        rid = self._next_id[table]
        self._next_id[table] += 1
        return rid


class FakeConn:
    def __init__(self, db: FakeDB):
        self.db = db

    async def execute(self, query, *params):
        q = _norm(query)

        if q.startswith("INSERT INTO email_otps"):
            email, code_hash, expires_at = params
            self.db.email_otps.append({
                "id": self.db.alloc_id("email_otps"),
                "email": email, "code_hash": code_hash, "expires_at": expires_at,
                "attempts": 0, "consumed": False,
                "created_at": datetime.now(timezone.utc),
            })
            return

        if q.startswith("UPDATE email_otps SET attempts"):
            (otp_id,) = params
            for row in self.db.email_otps:
                if row["id"] == otp_id:
                    row["attempts"] += 1
            return

        if q.startswith("UPDATE email_otps SET consumed"):
            (otp_id,) = params
            for row in self.db.email_otps:
                if row["id"] == otp_id:
                    row["consumed"] = True
            return

        if q.startswith("INSERT INTO password_reset_tokens"):
            user_id, token_hash, expires_at = params
            self.db.password_reset_tokens.append({
                "id": self.db.alloc_id("password_reset_tokens"),
                "user_id": user_id, "token_hash": token_hash, "expires_at": expires_at,
                "consumed": False,
            })
            return

        if q.startswith("UPDATE users SET password_hash"):
            password_hash, user_id = params
            for row in self.db.users:
                if row["id"] == user_id:
                    row["password_hash"] = password_hash
            return

        if q.startswith("UPDATE password_reset_tokens SET consumed"):
            (token_id,) = params
            for row in self.db.password_reset_tokens:
                if row["id"] == token_id:
                    row["consumed"] = True
            return

        raise NotImplementedError(f"FakeConn.execute unhandled query: {q!r}")

    async def fetch(self, query, *params):
        q = _norm(query)

        if q.startswith("UPDATE consent_records SET status = 'expired'"):
            (cutoff,) = params
            expired = []
            for row in self.db.consent_records.values():
                if row["status"] == "pending" and row["outreach_sent_at"] and row["outreach_sent_at"] < cutoff:
                    row["status"] = "expired"
                    expired.append({"id": row["id"]})
            return expired

        raise NotImplementedError(f"FakeConn.fetch unhandled query: {q!r}")

    async def fetchval(self, query, *params):
        q = _norm(query)

        if q.startswith("SELECT code_hash FROM email_otps"):
            (otp_id,) = params
            return next((r["code_hash"] for r in self.db.email_otps if r["id"] == otp_id), None)

        if q.startswith("SELECT id FROM users WHERE email"):
            (email,) = params
            return next((r["id"] for r in self.db.users if r["email"] == email), None)

        raise NotImplementedError(f"FakeConn.fetchval unhandled query: {q!r}")

    async def fetchrow(self, query, *params):
        q = _norm(query)
        now = datetime.now(timezone.utc)

        if q.startswith("SELECT id, attempts FROM email_otps"):
            (email,) = params
            candidates = [
                r for r in self.db.email_otps
                if r["email"] == email and not r["consumed"] and r["expires_at"] > now
            ]
            if not candidates:
                return None
            latest = max(candidates, key=lambda r: r["created_at"])
            return {"id": latest["id"], "attempts": latest["attempts"]}

        if q.startswith("SELECT id FROM users WHERE email"):
            (email,) = params
            row = next((r for r in self.db.users if r["email"] == email), None)
            return {"id": row["id"]} if row else None

        if q.startswith("INSERT INTO users"):
            (
                email, password_hash, account_type, name, company_name, experience_level,
                use_case, purposes, bio, github, x, linkedin, website, huggingface, other,
            ) = params
            row = {
                "id": self.db.alloc_id("users"),
                "email": email, "password_hash": password_hash, "account_type": account_type,
                "name": name, "company_name": company_name, "experience_level": experience_level,
                "use_case": use_case, "purposes": purposes, "bio": bio,
                "github_username": github, "x_handle": x, "linkedin_handle": linkedin,
                "website_url": website, "huggingface_handle": huggingface, "other_link": other,
                "email_verified": True, "created_at": now,
                "industry": None, "is_private": False, "show_follower_count": True,
                "notify_new_follower": True, "notify_agent_review": True,
            }
            self.db.users.append(row)
            return _project(row, SIGNUP_RETURNING_COLUMNS)

        if q.startswith("SELECT * FROM users WHERE email"):
            (email,) = params
            row = next((r for r in self.db.users if r["email"] == email), None)
            return dict(row) if row else None

        if q.startswith("SELECT id, email, account_type"):
            (user_id,) = params
            row = next((r for r in self.db.users if r["id"] == user_id), None)
            return _project(row, USER_COLUMNS) if row else None

        if q.startswith("SELECT id, user_id FROM password_reset_tokens"):
            (token_hash,) = params
            row = next(
                (
                    r for r in self.db.password_reset_tokens
                    if r["token_hash"] == token_hash and not r["consumed"] and r["expires_at"] > now
                ),
                None,
            )
            return {"id": row["id"], "user_id": row["user_id"]} if row else None

        if q.startswith("SELECT repo_url FROM repo_completion_sources"):
            (source_id,) = params
            row = self.db.repo_completion_sources.get(source_id)
            return {"repo_url": row["repo_url"]} if row else None

        if q.startswith("INSERT INTO consent_records"):
            source_id, rights_holder_email, terms = params
            row = {
                "id": self.db.alloc_id("consent_records"),
                "source_id": source_id, "rights_holder_email": rights_holder_email,
                "rights_holder_login": None, "status": "pending", "terms": terms,
                "outreach_sent_at": now, "responded_at": None, "created_at": now,
            }
            self.db.consent_records[row["id"]] = row
            return dict(row)

        if q.startswith("UPDATE consent_records"):
            record_id, decision, terms = params
            row = self.db.consent_records.get(record_id)
            if not row or row["status"] != "pending":
                return None
            row["status"] = decision
            row["responded_at"] = now
            if terms is not None:
                row["terms"] = terms
            return dict(row)

        raise NotImplementedError(f"FakeConn.fetchrow unhandled query: {q!r}")


def make_fake_get_conn(db: FakeDB):
    @asynccontextmanager
    async def _get_conn():
        yield FakeConn(db)
    return _get_conn
