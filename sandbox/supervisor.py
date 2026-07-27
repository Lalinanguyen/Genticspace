"""In-machine entrypoint for a Tracent sandbox run.

Reads the run spec from env (populated by app/services/sandbox_runner.py),
clones the target repo, runs its declared build/run commands (from its
tracent.yaml manifest), streams output back to the ingest endpoint, and exits.
The Fly Machine this runs in is single-purpose and auto_destroy'd by the
platform once the process exits, so there is no cleanup step here beyond
reporting a terminal status.
"""

import asyncio
import os
import socket
import subprocess
import sys

import httpx

RUN_ID = os.environ["RUN_ID"]
REPO_URL = os.environ["REPO_URL"]
SOURCE_REF = os.environ.get("SOURCE_REF") or "main"
BUILD_COMMAND = os.environ.get("BUILD_COMMAND") or ""
RUN_COMMAND = os.environ["RUN_COMMAND"]
MAX_RUN_SECONDS = int(os.environ.get("MAX_RUN_SECONDS", "180"))
MAX_LOG_BYTES = int(os.environ.get("MAX_LOG_BYTES", "200000"))
INGEST_URL = os.environ["INGEST_URL"]
INGEST_TOKEN = os.environ["INGEST_TOKEN"]

WORKDIR = "/workspace/repo"
BUILD_TIMEOUT_SECONDS = 120
SANDBOX_USER = "sandbox"

_log_bytes_sent = 0


async def send(chunk: str = "", status: str | None = None, exit_code: int | None = None) -> None:
    global _log_bytes_sent
    if _log_bytes_sent >= MAX_LOG_BYTES:
        chunk = ""
    else:
        _log_bytes_sent += len(chunk.encode("utf-8", errors="ignore"))
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                INGEST_URL,
                json={"chunk": chunk, "status": status, "exit_code": exit_code},
                headers={"Authorization": f"Bearer {INGEST_TOKEN}"},
            )
    except Exception as exc:
        print(f"[supervisor] log ingest failed: {exc}", file=sys.stderr)


def lock_down_network() -> None:
    """Restricts (but does not fully cut) outbound network access for both
    the build and run steps -- each executes unreviewed third-party code
    (a manifest-declared build command, then the agent itself) against a
    freshly cloned repo. Both get DNS plus plain HTTP/HTTPS egress -- enough
    to install from PyPI/npm and to call real external APIs the way a real
    deployment would -- plus the log-ingest host. Everything else (arbitrary
    TCP/UDP ports -- SMTP relay, DB protocols, port scanning, etc.) stays
    dropped. This machine is also in its own Fly org, off production's
    private 6PN network, so even with HTTP(S) egress there's no network
    path to internal Tracent infra."""
    host = INGEST_URL.split("/")[2].split(":")[0]
    try:
        ingest_ip = socket.gethostbyname(host)
    except Exception as exc:
        print(f"[supervisor] could not resolve ingest host, logs may stop: {exc}", file=sys.stderr)
        ingest_ip = None

    subprocess.run(["iptables", "-P", "OUTPUT", "DROP"], check=False)
    subprocess.run(["iptables", "-A", "OUTPUT", "-o", "lo", "-j", "ACCEPT"], check=False)
    if ingest_ip:
        subprocess.run(
            ["iptables", "-A", "OUTPUT", "-d", ingest_ip, "-p", "tcp", "--dport", "443", "-j", "ACCEPT"],
            check=False,
        )
    # DNS, so the run step can resolve hostnames for its own API calls.
    subprocess.run(["iptables", "-A", "OUTPUT", "-p", "udp", "--dport", "53", "-j", "ACCEPT"], check=False)
    subprocess.run(["iptables", "-A", "OUTPUT", "-p", "tcp", "--dport", "53", "-j", "ACCEPT"], check=False)
    # General HTTP(S) egress for the agent's own network calls.
    subprocess.run(["iptables", "-A", "OUTPUT", "-p", "tcp", "--dport", "80", "-j", "ACCEPT"], check=False)
    subprocess.run(["iptables", "-A", "OUTPUT", "-p", "tcp", "--dport", "443", "-j", "ACCEPT"], check=False)


async def _pump_output(proc: asyncio.subprocess.Process) -> None:
    assert proc.stdout
    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        await send(chunk=line.decode("utf-8", errors="ignore"))


async def run_step(command: str, timeout_seconds: int, label: str) -> int | None:
    """Returns the exit code, or None if the step timed out."""
    if not command.strip():
        return 0
    await send(chunk=f"$ {command}\n")
    # Runs as an unprivileged user -- only the supervisor process itself
    # (cloning, iptables) needs root inside this throwaway machine.
    proc = await asyncio.create_subprocess_exec(
        "su", "-s", "/bin/bash", SANDBOX_USER, "-c", command,
        cwd=WORKDIR,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        await asyncio.wait_for(_pump_output(proc), timeout=timeout_seconds)
        return await proc.wait()
    except asyncio.TimeoutError:
        proc.kill()
        await send(chunk=f"\n[{label} timed out after {timeout_seconds}s]\n")
        return None


async def clone_repo() -> int:
    """Clones as the unprivileged `sandbox` user, not root -- the target
    remote and its response are attacker-influenced input, same category of
    risk run_step() already avoids for build/run. WORKDIR is created (as
    root, by main()) and handed to `sandbox` before git ever touches it."""
    await send(chunk=f"Cloning {REPO_URL} @ {SOURCE_REF}...\n", status="running")
    subprocess.run(["chown", "-R", f"{SANDBOX_USER}:{SANDBOX_USER}", WORKDIR], check=False)
    proc = await asyncio.create_subprocess_exec(
        "git", "clone", "--depth", "1", "--branch", SOURCE_REF, REPO_URL, WORKDIR,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        user=SANDBOX_USER,
    )
    await _pump_output(proc)
    return await proc.wait()


async def main() -> None:
    os.makedirs(WORKDIR, exist_ok=True)

    clone_code = await clone_repo()
    if clone_code != 0:
        await send(status="failed", exit_code=clone_code)
        return

    # Build runs a manifest-declared command against a cloned third-party
    # repo -- arbitrary code execution (setup.py, npm postinstall). Lock
    # down egress before it runs, not after: previously this ran with full,
    # unrestricted network. Reuses the same DNS+HTTP(S) ruleset already
    # proven for the run step; nothing needs a wider allowlist to install
    # from PyPI/npm since those are plain HTTPS.
    lock_down_network()

    build_code = await run_step(BUILD_COMMAND, BUILD_TIMEOUT_SECONDS, "build")
    if build_code is None:
        await send(status="timeout")
        return
    if build_code != 0:
        await send(status="failed", exit_code=build_code)
        return

    run_code = await run_step(RUN_COMMAND, MAX_RUN_SECONDS, "run")
    if run_code is None:
        await send(status="timeout")
        return
    await send(status="succeeded" if run_code == 0 else "failed", exit_code=run_code)


if __name__ == "__main__":
    asyncio.run(main())
