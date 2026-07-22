"""
Run the local-simulation "hello-world" Genticspace-hosted agent.

This is the local-simulation half of the hosting proof-of-concept described
in docs/hosting-architecture.md. It runs the exact same app.py that
agents/hello-world/Dockerfile would run in a real container, but as a bare
local process on a non-default port — standing in for a real hosted
deployment until a hosting provider is chosen (see "Open questions" in the
design doc). This is NOT a real cloud deployment.

Usage:
    python -m scripts.run_hello_world_agent [--host 127.0.0.1] [--port 8090]

Then, in another terminal:
    curl http://127.0.0.1:8090/health
    curl -X POST http://127.0.0.1:8090/mcp -H "Content-Type: application/json" \\
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"message":"hi"}}}'
"""
import argparse
import importlib.util
import pathlib

import uvicorn

_AGENT_APP_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "agents" / "hello-world" / "app.py"
)


def _load_app():
    # agents/hello-world isn't a valid dotted Python package name (hyphen),
    # so load app.py directly by file path rather than `import agents.hello-world.app`.
    spec = importlib.util.spec_from_file_location("genticspace_hello_world_agent", _AGENT_APP_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    args = parser.parse_args()

    print(f"[local-simulation] serving agents/hello-world on http://{args.host}:{args.port}")
    print("[local-simulation] this is a local process, NOT a real cloud deployment")
    uvicorn.run(_load_app(), host=args.host, port=args.port, log_level="info")
