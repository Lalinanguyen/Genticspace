import asyncio
import json
import logging
import secrets
from typing import Any

import httpx

from app.config import settings
from app.db.database import get_conn
from app.sources import EvmSource, get_evm_source

logger = logging.getLogger(__name__)

_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
_NULL_ADDRESS = "0x0000000000000000000000000000000000000000"
_TOKEN_URI_SELECTOR = "0xc87b56dd"
_OWNER_OF_SELECTOR = "0x6352211e"


def _alchemy_url(cfg: EvmSource) -> str:
    return f"https://{cfg.alchemy_subdomain}.g.alchemy.com/v2/{settings.ALCHEMY_API_KEY}"


async def _rpc(cfg: EvmSource, method: str, params: list) -> Any:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_alchemy_url(cfg), json=payload)
        resp.raise_for_status()
        data = resp.json()
    if "error" in data:
        raise RuntimeError(f"RPC error: {data['error']}")
    return data["result"]


async def _get_latest_block(cfg: EvmSource) -> int:
    result = await _rpc(cfg, "eth_blockNumber", [])
    return int(result, 16)


async def _get_logs_chunk(cfg: EvmSource, from_block: int, to_block: int) -> list[dict]:
    params = [{
        "fromBlock": hex(from_block),
        "toBlock": hex(to_block),
        "address": cfg.contract_address,
        "topics": [_TRANSFER_TOPIC],
    }]
    try:
        return await _rpc(cfg, "eth_getLogs", params)
    except Exception as exc:
        logger.warning("eth_getLogs %d-%d failed: %s", from_block, to_block, exc)
        return []


async def _find_contract_deploy_block(cfg: EvmSource) -> int:
    latest = await _get_latest_block(cfg)
    lo, hi = 0, latest
    while lo < hi:
        mid = (lo + hi) // 2
        try:
            result = await _rpc(cfg, "eth_getCode", [cfg.contract_address, hex(mid)])
            if result and result != "0x":
                hi = mid
            else:
                lo = mid + 1
        except Exception:
            lo = mid + 1
    return lo


async def _get_token_uri(cfg: EvmSource, token_id: int) -> str | None:
    padded = hex(token_id)[2:].zfill(64)
    data = _TOKEN_URI_SELECTOR + padded
    params = [{"to": cfg.contract_address, "data": data}, "latest"]
    try:
        result = await _rpc(cfg, "eth_call", params)
        if not result or result == "0x":
            return None
        raw = bytes.fromhex(result[2:])
        offset = int.from_bytes(raw[:32], "big")
        length = int.from_bytes(raw[offset: offset + 32], "big")
        uri = raw[offset + 32: offset + 32 + length].decode("utf-8", errors="replace")
        return uri.strip()
    except Exception as exc:
        logger.warning("tokenURI(%d) failed: %s", token_id, exc)
        return None


async def _fetch_metadata(uri: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(uri)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Metadata fetch failed for %s: %s", uri, exc)
        return None


def _parse_services(metadata: dict) -> tuple[str | None, str | None, str | None]:
    a2a = mcp = web = None
    for svc in metadata.get("services", []):
        name = (svc.get("name") or "").lower()
        endpoint = svc.get("endpoint")
        if name == "a2a":
            a2a = endpoint
        elif name == "mcp":
            mcp = endpoint
        elif name == "web":
            web = endpoint
    return a2a, mcp, web


def _generate_genticspace_id() -> str:
    suffix = secrets.token_urlsafe(10)[:10]
    return f"trc_{suffix}"


async def _get_last_indexed_block(source: str) -> int | None:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT last_indexed_block FROM index_state WHERE source = $1", source
        )
    return row["last_indexed_block"] if row else None


async def _set_last_indexed_block(source: str, block: int) -> None:
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO index_state (source, last_indexed_block, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (source) DO UPDATE
              SET last_indexed_block = EXCLUDED.last_indexed_block,
                  updated_at = NOW()
            """,
            source,
            block,
        )


async def ingest_agents(source: str = "erc8004") -> None:
    cfg = get_evm_source(source)
    if cfg is None:
        logger.error("ingest_agents called for unconfigured/unknown source=%s", source)
        return

    logger.info("Starting ingest for source=%s", source)

    try:
        latest_block = await _get_latest_block(cfg)
    except Exception as exc:
        logger.error("Failed to fetch latest block: %s", exc)
        return

    last_indexed = await _get_last_indexed_block(source)
    if last_indexed is None:
        if cfg.start_block > 0:
            from_block = cfg.start_block
        else:
            logger.info("Finding contract deployment block via binary search...")
            from_block = await _find_contract_deploy_block(cfg)
            logger.info("Contract deployed at block %d", from_block)
        await _set_last_indexed_block(source, from_block - 1)
    else:
        from_block = last_indexed + 1

    if from_block > latest_block:
        logger.info("No new blocks to index (from=%d, latest=%d)", from_block, latest_block)
        return

    total_blocks = latest_block - from_block + 1
    logger.info("Indexing blocks %d → %d (%d blocks)", from_block, latest_block, total_blocks)

    chunk_size = settings.CHUNK_SIZE
    all_logs: list[dict] = []
    chunks_done = 0
    checkpoint_every = 1000

    for chunk_start in range(from_block, latest_block + 1, chunk_size):
        chunk_end = min(chunk_start + chunk_size - 1, latest_block)
        logs = await _get_logs_chunk(cfg, chunk_start, chunk_end)
        all_logs.extend(logs)
        chunks_done += 1
        if chunks_done % checkpoint_every == 0:
            await _set_last_indexed_block(source, chunk_end)
            logger.info("Progress: block %d/%d, %d logs so far",
                        chunk_end - from_block, total_blocks, len(all_logs))

    token_events: dict[int, list[dict]] = {}
    for log in all_logs:
        if len(log.get("topics", [])) < 3:
            continue
        token_id = int(log["topics"][2], 16)
        token_events.setdefault(token_id, []).append(log)

    logger.info("Found %d unique token IDs in %d logs", len(token_events), len(all_logs))

    for token_id, events in token_events.items():
        try:
            await _process_token(cfg, token_id, events)
            await asyncio.sleep(0.1)
        except Exception as exc:
            logger.error("Error processing token %d: %s", token_id, exc)

    await _set_last_indexed_block(source, latest_block)
    logger.info("Ingest complete for source=%s, checkpoint block=%d", source, latest_block)


async def _process_token(cfg: EvmSource, token_id: int, events: list[dict]) -> None:
    from app.services.verifier import run_auto_verification

    source = cfg.name
    source_id = str(token_id)

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT genticspace_id FROM agents WHERE source = $1 AND source_id = $2",
            source, source_id,
        )
        if existing:
            genticspace_id = existing["genticspace_id"]
        else:
            genticspace_id = _generate_genticspace_id()

        mint_event = None
        for event in events:
            from_addr = "0x" + event["topics"][1][-40:]
            to_addr = "0x" + event["topics"][2 if len(event["topics"]) > 2 else 2][-40:]
            from_raw = "0x" + event["topics"][1][-40:]
            to_raw = "0x" + event["topics"][2][-40:] if len(event["topics"]) > 2 else None

            from_addr = "0x" + event["topics"][1][-40:]
            to_addr = "0x" + event["topics"][2][-40:]
            is_mint = from_addr.lower() == _NULL_ADDRESS.lower()
            transfer_type = "mint" if is_mint else "transfer"
            block_number = int(event["blockNumber"], 16)
            tx_hash = event.get("transactionHash", "")

            if is_mint:
                mint_event = {"to": to_addr, "block": block_number, "tx": tx_hash}

            if not existing:
                await conn.execute(
                    """
                    INSERT INTO agents (genticspace_id, source, source_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (source, source_id) DO NOTHING
                    """,
                    genticspace_id, source, source_id,
                )
                existing = True

            await conn.execute(
                """
                INSERT INTO transfer_events
                  (genticspace_id, source, from_address, to_address, block_number, tx_hash, is_mint, transfer_type)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (tx_hash, genticspace_id) DO NOTHING
                """,
                genticspace_id, source, from_addr, to_addr, block_number, tx_hash, is_mint, transfer_type,
            )

    uri = await _get_token_uri(cfg, token_id)
    metadata = await _fetch_metadata(uri) if uri else None

    owner_address = mint_event["to"] if mint_event else None
    registered_block = mint_event["block"] if mint_event else None
    registered_tx = mint_event["tx"] if mint_event else None

    name = description = image_url = None
    is_active = True
    x402_support = False
    provider_org = provider_url = None
    updated_at = None
    a2a_endpoint = mcp_endpoint = web_endpoint = None
    skills: list[dict] = []

    if metadata:
        name = metadata.get("name")
        description = metadata.get("description")
        image_url = metadata.get("image")
        is_active = metadata.get("active", True)
        x402_support = metadata.get("x402Support", False)
        updated_at = metadata.get("updatedAt")
        provider = metadata.get("provider", {})
        provider_org = provider.get("organization")
        provider_url = provider.get("url")
        a2a_endpoint, mcp_endpoint, web_endpoint = _parse_services(metadata)
        skills = metadata.get("skills", [])

    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO agents (
                genticspace_id, source, source_id,
                owner_address, name, description, image_url, metadata_uri,
                is_active, x402_support,
                a2a_endpoint, mcp_endpoint, web_endpoint,
                provider_org, provider_url,
                registered_block, registered_tx, updated_at,
                last_indexed
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, NOW()
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                owner_address    = EXCLUDED.owner_address,
                name             = EXCLUDED.name,
                -- ERC-8004 tokens rarely carry off-chain metadata; don't let
                -- a re-index wipe the backfilled description with NULL.
                description      = COALESCE(NULLIF(trim(EXCLUDED.description), ''), agents.description),
                image_url        = COALESCE(EXCLUDED.image_url, agents.image_url),
                metadata_uri     = EXCLUDED.metadata_uri,
                is_active        = EXCLUDED.is_active,
                x402_support     = EXCLUDED.x402_support,
                a2a_endpoint     = EXCLUDED.a2a_endpoint,
                mcp_endpoint     = EXCLUDED.mcp_endpoint,
                web_endpoint     = EXCLUDED.web_endpoint,
                provider_org     = EXCLUDED.provider_org,
                provider_url     = EXCLUDED.provider_url,
                registered_block = COALESCE(agents.registered_block, EXCLUDED.registered_block),
                registered_tx    = COALESCE(agents.registered_tx, EXCLUDED.registered_tx),
                updated_at       = EXCLUDED.updated_at,
                last_indexed     = NOW()
            """,
            genticspace_id, source, source_id,
            owner_address, name, description, image_url, uri,
            is_active, x402_support,
            a2a_endpoint, mcp_endpoint, web_endpoint,
            provider_org, provider_url,
            registered_block, registered_tx, updated_at,
        )

        await conn.execute(
            "DELETE FROM agent_skills WHERE genticspace_id = $1", genticspace_id
        )
        for skill in skills:
            tags_str = json.dumps(skill.get("tags", []))
            await conn.execute(
                """
                INSERT INTO agent_skills (genticspace_id, skill_id, skill_name, description, tags)
                VALUES ($1, $2, $3, $4, $5)
                """,
                genticspace_id,
                skill.get("id"),
                skill.get("name"),
                skill.get("description"),
                tags_str,
            )

    await run_auto_verification(genticspace_id)
    logger.info("Indexed token %d → %s", token_id, genticspace_id)
