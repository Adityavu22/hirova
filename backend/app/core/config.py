from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """1. Typed environment configuration keeps secrets outside source control."""

    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    app_name: str = "Hirova API"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:3000"
    database_url: str = "sqlite+aiosqlite:///./hirova.db"
    qdrant_url: str | None = None
    qdrant_api_key: str | None = None
    llm_provider: Literal["groq", "gemini", "demo"] = "demo"
    groq_api_key: str | None = None
    gemini_api_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_model: str = "gemini-2.5-flash"
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    langsmith_tracing: bool = Field(default=False, alias="LANGSMITH_TRACING")
    langsmith_api_key: str | None = None
    langsmith_project: str = "hirova-career-copilot"
    max_upload_mb: int = 10

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """2. Cache one immutable settings object per process."""

    return Settings()
