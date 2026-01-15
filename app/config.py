from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://whendoist:whendoist@localhost:5432/whendoist"
    secret_key: str = "changeme"
    base_url: str = "http://localhost:8000"

    @field_validator("database_url", mode="before")
    @classmethod
    def transform_database_url(cls, v: str) -> str:
        """Transform Railway's postgresql:// to postgresql+asyncpg:// for SQLAlchemy async."""
        if v and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Todoist OAuthis
    todoist_client_id: str = ""
    todoist_client_secret: str = ""

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # Passkey (WebAuthn) settings
    passkey_rp_id: str = "localhost"  # Production: domain without port (e.g., "whendoist.com")
    passkey_rp_name: str = "Whendoist"

    @property
    def todoist_redirect_uri(self) -> str:
        return f"{self.base_url}/auth/todoist/callback"

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.base_url}/auth/google/callback"

    @property
    def passkey_origin(self) -> str:
        """Origin for WebAuthn verification (derived from base_url)."""
        return self.base_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
