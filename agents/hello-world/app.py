"""
Tracent hosted agent: hello-world.

A hard-coded, single-purpose "echo" agent used as the proof-of-concept for
the Tracent hosting design spike (docs/hosting-architecture.md). It exposes
a minimal MCP-compatible JSON-RPC 2.0 interface over HTTP, per the "Tracent
Hosted Agent Contract" section of that doc:

  - GET  /health  -> liveness probe, used by the deploy pipeline and by
                      Tracent's existing endpoint_checker.
  - POST /mcp     -> JSON-RPC 2.0 endpoint implementing the minimal MCP
                      surface: `initialize`, `tools/list`, `tools/call`
                      (one tool: `echo`, which returns whatever text you
                      send it, unchanged).
  - GET  /        -> human-readable landing page (this is what web_endpoint
                      points at).

No framework beyond FastAPI/uvicorn (already a Tracent dependency) and no
external calls, storage, or secrets — intentionally the smallest possible
thing that satisfies the agent contract, so the deploy pipeline itself is
what's being proven out, not the agent logic.

Run locally:
    uvicorn agents.hello-world.app:app --port 8090
(see scripts/run_hello_world_agent.py for the actual local-simulation runner,
since "hello-world" isn't a valid Python module name for `uvicorn --reload`.)
"""
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

AGENT_NAME = "tracent-hello-world"
PROTOCOL_VERSION = "2024-11-05"  # MCP protocol version this stub speaks

app = FastAPI(title=AGENT_NAME)

_TOOLS = [
    {
        "name": "echo",
        "description": "Echoes back whatever text you send it, unchanged.",
        "inputSchema": {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"],
        },
    }
]


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "agent": AGENT_NAME}


@app.get("/")
async def landing() -> dict:
    return {
        "agent": AGENT_NAME,
        "description": "Hard-coded hello-world agent — proof of concept for Tracent hosting.",
        "mcp_endpoint": "/mcp",
        "protocol_version": PROTOCOL_VERSION,
    }


def _rpc_error(id_: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


def _rpc_result(id_: Any, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "result": result}


@app.post("/mcp")
async def mcp(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(_rpc_error(None, -32700, "Parse error"), status_code=400)

    id_ = body.get("id")
    method = body.get("method")
    params = body.get("params") or {}

    if method == "initialize":
        return _rpc_result(id_, {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {"name": AGENT_NAME, "version": "0.1.0"},
            "capabilities": {"tools": {}},
        })

    if method == "tools/list":
        return _rpc_result(id_, {"tools": _TOOLS})

    if method == "tools/call":
        tool_name = params.get("name")
        if tool_name != "echo":
            return _rpc_error(id_, -32602, f"Unknown tool: {tool_name}")
        message = (params.get("arguments") or {}).get("message", "")
        return _rpc_result(id_, {
            "content": [{"type": "text", "text": message}],
            "isError": False,
        })

    return _rpc_error(id_, -32601, f"Method not found: {method}")
