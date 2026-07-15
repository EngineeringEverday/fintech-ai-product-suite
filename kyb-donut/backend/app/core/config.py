"""Application configuration loaded from environment."""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime mode for the model layer
    # 'mock' -> deterministic synthetic extractor (no GPU/network)
    # 'donut' -> load DonutProcessor + VisionEncoderDecoder from HF
    MODEL_MODE: str = "mock"
    DONUT_MODEL_NAME: str = "naver-clova-ix/donut-base"
    DONUT_CHECKPOINT_DIR: str = "/data/checkpoints/donut-kyb-best"

    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "sqlite:////data/kyb.db"

    MLFLOW_TRACKING_URI: str = "http://localhost:5500"

    DOC_REVIEW_THRESHOLD: float = 0.80
    NAME_MATCH_THRESHOLD: float = 0.85
    EXPIRY_DAYS_FLAG: int = 30

    UPLOAD_DIR: str = "/data/uploads"

    LOG_LEVEL: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
