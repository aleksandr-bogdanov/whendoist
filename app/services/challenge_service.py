"""
WebAuthn challenge storage service.

Provides database-backed challenge storage to support multiple uvicorn workers.
Challenges are temporary and expire after 5 minutes.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import CHALLENGE_TTL_SECONDS
from app.models import WebAuthnChallenge


class ChallengeService:
    """Service for managing WebAuthn challenges in the database."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def store_challenge(self, challenge: bytes) -> None:
        """
        Store a challenge with TTL, replacing any existing challenge for this user.

        Each user can only have one active challenge at a time to prevent
        challenge accumulation and simplify cleanup.
        """
        # Delete any existing challenges for this user
        await self.db.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.user_id == self.user_id))

        # Store new challenge with expiration
        expires_at = datetime.now(UTC) + timedelta(seconds=CHALLENGE_TTL_SECONDS)
        record = WebAuthnChallenge(
            user_id=self.user_id,
            challenge=challenge,
            expires_at=expires_at,
        )
        self.db.add(record)
        await self.db.flush()

    async def get_and_consume_challenge(self) -> bytes | None:
        """
        Get and delete the challenge for this user (one-time use).

        Returns None if no valid (non-expired) challenge exists.
        """
        result = await self.db.execute(
            select(WebAuthnChallenge).where(
                WebAuthnChallenge.user_id == self.user_id,
                WebAuthnChallenge.expires_at > datetime.now(UTC),
            )
        )
        record = result.scalar_one_or_none()

        if record:
            challenge = record.challenge
            await self.db.delete(record)
            await self.db.flush()
            return challenge
        return None

    @classmethod
    async def cleanup_expired(cls, db: AsyncSession) -> int:
        """
        Delete all expired challenges from the database.

        This should be run periodically (e.g., on app startup or via scheduled task).
        Returns the number of deleted challenges.
        """
        result = await db.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at < datetime.now(UTC)))
        await db.commit()
        return result.rowcount or 0  # type: ignore[union-attr]
