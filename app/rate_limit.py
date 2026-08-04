"""
Shared slowapi Limiter instance.

Lives in its own module (rather than in app.main) so route modules can
import it for per-route @limiter.limit(...) overrides without creating a
circular import with app.main (which wires the limiter into the FastAPI
app/middleware).

Default: 60 requests/minute per client IP, applied to every route via
SlowAPIMiddleware (see app/main.py). Public writes (POST /public/agents
contribute, POST /auth/signup, POST /auth/request-otp, POST /agents/submit)
opt into a stricter per-route limit — see those routers for the reasoning.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address


def _real_client_ip(request) -> str:
    """
    Behind Fly.io's edge proxy, request.client.host is always the proxy's
    internal address, not the real visitor — keying on it would collapse
    every visitor into one shared rate-limit bucket. Fly sets Fly-Client-IP
    on every request; fall back to X-Forwarded-For, then the raw TCP peer
    for local dev (docs/deploy without Fly, or `uvicorn --reload`).
    """
    fly_ip = request.headers.get("Fly-Client-IP")
    if fly_ip:
        return fly_ip
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_real_client_ip, default_limits=["60/minute"])
