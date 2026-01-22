from functools import lru_cache
from urllib.parse import urlparse

from pydantic import field_validator, model_validator
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

    # Database pool settings
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 300

    # Passkey (WebAuthn) settings
    # If not explicitly set, derived from base_url
    passkey_rp_id: str = ""
    passkey_rp_name: str = "Whendoist"

    @model_validator(mode="after")
    def derive_passkey_rp_id(self) -> "Settings":
        """Derive passkey_rp_id from base_url if not explicitly set."""
        if not self.passkey_rp_id:
            parsed = urlparse(self.base_url)
            # RP ID is the hostname without port
            self.passkey_rp_id = parsed.hostname or "localhost"
        return self

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
