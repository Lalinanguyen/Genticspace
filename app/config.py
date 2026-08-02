from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ALCHEMY_API_KEY: str
    DATABASE_URL: str
    # ADMIN_API_KEY/PARTNER_API_KEY replace the old single API_KEY (two-tier
    # admin/partner key scopes -- see app/db/auth.py). All three are optional
    # here; the fallback below fills in ADMIN_API_KEY/PARTNER_API_KEY from
    # the legacy API_KEY if either new var isn't set, so this rename doesn't
    # require rotating secrets before it's safe to deploy. Set distinct
    # ADMIN_API_KEY/PARTNER_API_KEY values whenever you're ready to actually
    # separate the two scopes -- no code change needed then.
    API_KEY: str | None = None
    ADMIN_API_KEY: str | None = None
    PARTNER_API_KEY: str | None = None
    CONTRACT_ADDRESS: str = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    INDEX_INTERVAL_MINUTES: int = 10
    INITIAL_LOOKBACK_BLOCKS: int = 500
    CONTRACT_START_BLOCK: int = 0
    CHUNK_SIZE: int = 10
    ENDPOINT_CHECK_INTERVAL_MINUTES: int = 30

    JWT_SECRET: str
    JWT_EXPIRES_MINUTES: int = 10080
    CORS_ORIGINS: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "noreply@tracent.xyz"
    CONTACT_INBOX: str | None = None

    GITHUB_TOKEN: str | None = None

    HUGGINGFACE_TOKEN: str | None = None
    HF_SCRAPE_INTERVAL_HOURS: int = 12
    HF_SCRAPE_MAX_PER_QUERY: int = 1000
    HF_SCRAPE_CONCURRENCY: int = 4
    HF_SCRAPE_MAX_CANDIDATES: int = 1500

    GITHUB_SCRAPE_INTERVAL_HOURS: int = 12
    GITHUB_SCRAPE_MAX_CANDIDATES: int = 1500
    GITHUB_SCRAPE_CONCURRENCY: int = 4

    README_SCRAPE_INTERVAL_HOURS: int = 24
    README_SCRAPE_BATCH_SIZE: int = 300

    ANTHROPIC_API_KEY: str | None = None

    SENTRY_DSN: str | None = None

    GITHUB_ENRICH_INTERVAL_HOURS: int = 24
    GITHUB_ENRICH_BATCH_SIZE: int = 300

    HF_ENRICH_INTERVAL_HOURS: int = 12
    HF_ENRICH_BATCH_SIZE: int = 150

    NPM_SCRAPE_INTERVAL_HOURS: int = 24
    NPM_SCRAPE_MAX_CANDIDATES: int = 1000
    NPM_SCRAPE_CONCURRENCY: int = 8

    NPM_ENRICH_INTERVAL_HOURS: int = 24
    NPM_ENRICH_BATCH_SIZE: int = 200

    FUTUREPEDIA_SCRAPE_INTERVAL_HOURS: int = 24
    FUTUREPEDIA_SCRAPE_BATCH_SIZE: int = 100
    FUTUREPEDIA_SCRAPE_CONCURRENCY: int = 2
    FUTUREPEDIA_SCRAPE_DELAY_SECONDS: float = 1.0

    FUTUREPEDIA_ENRICH_INTERVAL_HOURS: int = 24
    FUTUREPEDIA_ENRICH_BATCH_SIZE: int = 150

    YC_SCRAPE_INTERVAL_HOURS: int = 24

    # Proactively backfills installation instructions for every agent instead
    # of only generating them the first time someone views that agent's page.
    # Batched and interval-gated like the other backfills since each guide is
    # a real Anthropic API call.
    DEPLOYMENT_GUIDE_BACKFILL_INTERVAL_HOURS: int = 24
    DEPLOYMENT_GUIDE_BACKFILL_BATCH_SIZE: int = 150

    # Sandbox mode: runs an agent's repo in an ephemeral Fly Machine, in a
    # separate Fly org from tracent-registry so a sandboxed machine has no
    # network path to production regardless of misconfiguration.
    FLY_API_TOKEN: str | None = None
    FLY_SANDBOX_APP: str = "tracent-sandbox"
    SANDBOX_IMAGE: str = "registry.fly.io/tracent-sandbox:latest"
    SANDBOX_INGEST_BASE_URL: str = "https://api.genticspace.com"
    SANDBOX_MEMORY_MB: int = 512
    SANDBOX_MAX_RUN_SECONDS: int = 180
    SANDBOX_MAX_LOG_BYTES: int = 200_000
    SANDBOX_MAX_CONCURRENT_PER_USER: int = 1
    SANDBOX_DAILY_RUNS_PER_USER: int = 20
    SANDBOX_GLOBAL_MAX_CONCURRENT: int = 10
    SANDBOX_RUN_TTL_SECONDS: int = 300
    SANDBOX_MANIFEST_SCAN_INTERVAL_HOURS: int = 12
    SANDBOX_MANIFEST_SCAN_BATCH_SIZE: int = 200
    SANDBOX_REAP_INTERVAL_MINUTES: int = 5

    # Sandbox mode, AI-driven lane: runs a repo through a live agent session on
    # Anthropic's Managed Agents platform instead of a fixed manifest command.
    # Used when an agent has real README/codebase material but no
    # genticspace.yaml (see app/services/sandbox_manifest.py). The
    # manifest-based Fly Machine lane above stays as the free, deterministic
    # fast path for repos that opt in with a real manifest. Off by default -
    # real per-run LLM cost, beta platform - flip on deliberately once
    # SANDBOX_AGENT_ID is set (see scripts/create_sandbox_installer_agent.py).
    SANDBOX_AI_ENABLED: bool = False
    SANDBOX_CLAUDE_API_KEY: str | None = None  # falls back to ANTHROPIC_API_KEY if unset
    SANDBOX_AGENT_ID: str | None = None
    SANDBOX_AGENT_VERSION: int | None = None
    SANDBOX_AI_MAX_RUN_SECONDS: int = 480
    SANDBOX_AI_DAILY_RUNS_PER_USER: int = 5

    # User-uploaded images (agent listing photo/screenshot). Stored on a Fly
    # volume rather than object storage for now -- see fly.toml's [[mounts]]
    # and the note there about why this app is pinned to a single machine.
    UPLOADS_DIR: str = "/data/uploads"
    UPLOADS_MAX_BYTES: int = 5_000_000
    UPLOADS_PUBLIC_BASE_URL: str = "http://localhost:8000"

    # Repo Completion pipeline (see app/services/license_classifier.py and
    # app/services/repo_consent.py). Off by default -- this phase is data
    # model + classifier + a consent state machine only, no real candidate
    # sourcing or outreach wired into the Contribute flow yet.
    REPO_COMPLETION_ENABLED: bool = False
    CONSENT_REQUEST_TTL_DAYS: int = 14

    # Phase 2: the actual merge run (app/services/managed_agents.py::
    # start_completion_run). The completion agent itself pushes its result
    # from inside the sandbox (git push using the vault-injected token),
    # not a separate Python-side publish step. COMPLETION_AGENT_ID/VERSION
    # follow the same one-time-created, reused-by-ID pattern as the sandbox
    # installer agent (see scripts/create_repo_completer_agent.py).
    # COMPLETION_GITHUB_TOKEN needs repo-creation + push scope under
    # COMPLETION_GITHUB_ORG -- deliberately a separate token from the
    # read-only GITHUB_TOKEN scraping uses, never the same credential.
    COMPLETION_AGENT_ID: str | None = None
    COMPLETION_AGENT_VERSION: int | None = None
    COMPLETION_GITHUB_TOKEN: str | None = None
    COMPLETION_GITHUB_ORG: str | None = None
    # "user" or "org" -- GitHub's repo-creation REST endpoint differs
    # (POST /user/repos vs POST /orgs/{org}/repos), and the completion
    # agent needs to be told which one applies rather than guess from the
    # owner name alone (both share the same URL namespace).
    COMPLETION_GITHUB_OWNER_TYPE: str = "user"
    # Created once by scripts/create_repo_completer_agent.py alongside the
    # agent, then reused by ID across every run -- one Vault holding the
    # static push token, not a fresh one per run (that would mean a growing
    # pile of orphaned vaults with no cleanup, the same class of gap
    # CodeRabbit already flagged for per-run Environments on the sandbox lane).
    COMPLETION_VAULT_ID: str | None = None
    COMPLETION_MAX_RUN_SECONDS: int = 900

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

if not settings.ADMIN_API_KEY or not settings.PARTNER_API_KEY:
    if not settings.API_KEY:
        raise RuntimeError(
            "Set ADMIN_API_KEY and PARTNER_API_KEY (or the legacy API_KEY as a "
            "shared fallback for both) before starting the app."
        )
    settings.ADMIN_API_KEY = settings.ADMIN_API_KEY or settings.API_KEY
    settings.PARTNER_API_KEY = settings.PARTNER_API_KEY or settings.API_KEY
