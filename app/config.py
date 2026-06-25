from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ALCHEMY_API_KEY: str
    DATABASE_URL: str
    API_KEY: str
    CONTRACT_ADDRESS: str = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    INDEX_INTERVAL_MINUTES: int = 10
    INITIAL_LOOKBACK_BLOCKS: int = 500
    ENDPOINT_CHECK_INTERVAL_MINUTES: int = 30

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
