from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ALCHEMY_API_KEY: str
    DATABASE_URL: str
    API_KEY: str
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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
