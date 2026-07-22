"""
Direct-SQL seeding helpers shared across test modules.

These write straight to the tables app/db/database.py's init_db() creates,
bypassing the API — used to set up fixture data (e.g. an already-approved
agent with specific trust fields) that the routes under test don't
themselves have a way to create, so tests can assert on route *behavior*
against known, precise inputs.
"""
import itertools
import json
from typing import Optional

_counter = itertools.count(1)


def unique_id(prefix: str = "trc_test") -> str:
    return f"{prefix}_{next(_counter)}"


async def insert_agent(
    conn,
    *,
    genticspace_id: str,
    source: str = "test",
    source_id: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    verified: bool = False,
    trust_tier: Optional[str] = None,
    risk_score: float = 0.0,
    safe_to_transact: bool = False,
    moderation_status: str = "approved",
    submitter_email: Optional[str] = None,
    moderation_note: Optional[str] = None,
    is_private: bool = False,
    a2a_endpoint: Optional[str] = None,
    mcp_endpoint: Optional[str] = None,
    x402_support: bool = False,
    submitted_by: Optional[int] = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO agents (
            genticspace_id, source, source_id, name, description,
            verified, trust_tier, risk_score, safe_to_transact,
            moderation_status, submitter_email, moderation_note, is_private,
            a2a_endpoint, mcp_endpoint, x402_support, submitted_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        """,
        genticspace_id, source, source_id or genticspace_id, name, description,
        verified, trust_tier, risk_score, safe_to_transact,
        moderation_status, submitter_email, moderation_note, is_private,
        a2a_endpoint, mcp_endpoint, x402_support, submitted_by,
    )


async def insert_skill(
    conn,
    *,
    genticspace_id: str,
    skill_name: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[list] = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO agent_skills (genticspace_id, skill_name, description, tags)
        VALUES ($1, $2, $3, $4)
        """,
        genticspace_id, skill_name, description, json.dumps(tags or []),
    )


async def insert_flag(
    conn,
    *,
    genticspace_id: str,
    flag_type: str = "ownership_transfer",
    severity: str = "high",
    detail: Optional[str] = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO reputation_flags (genticspace_id, flag_type, severity, detail)
        VALUES ($1, $2, $3, $4)
        """,
        genticspace_id, flag_type, severity, detail,
    )
