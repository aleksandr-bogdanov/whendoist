"""
Tests for WebAuthn challenge storage service.

Verifies:
- Challenge storage and retrieval
- Challenge TTL and expiration
- One-time consumption (challenge deleted after retrieval)
- New challenge replaces old
- Multitenancy isolation (User A cannot access User B's challenges)
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import User, WebAuthnChallenge
from app.services.challenge_service import CHALLENGE_TTL_SECONDS, ChallengeService


@pytest.fixture
async def test_user(db_session):
    """Create a test user."""
    user = User(email="test@example.com", name="Test User")
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
async def test_user_2(db_session):
    """Create a second test user for multitenancy tests."""
    user = User(email="test2@example.com", name="Test User 2")
    db_session.add(user)
    await db_session.commit()
    return user


class TestChallengeStorage:
    """Tests for basic challenge storage and retrieval."""

    @pytest.mark.asyncio
    async def test_store_and_retrieve_challenge(self, db_session, test_user):
        """Challenge can be stored and retrieved."""
        service = ChallengeService(db_session, test_user.id)
        challenge = b"test_challenge_bytes_12345"

        await service.store_challenge(challenge)
        await db_session.commit()

        retrieved = await service.get_and_consume_challenge()
        assert retrieved == challenge

    @pytest.mark.asyncio
    async def test_challenge_consumed_after_retrieval(self, db_session, test_user):
        """Challenge is deleted after retrieval (one-time use)."""
        service = ChallengeService(db_session, test_user.id)
        await service.store_challenge(b"test_challenge")
        await db_session.commit()

        # First retrieval succeeds
        first = await service.get_and_consume_challenge()
        await db_session.commit()
        assert first is not None

        # Second retrieval fails (consumed)
        second = await service.get_and_consume_challenge()
        assert second is None

    @pytest.mark.asyncio
    async def test_new_challenge_replaces_old(self, db_session, test_user):
        """Storing a new challenge replaces any existing one."""
        service = ChallengeService(db_session, test_user.id)

        await service.store_challenge(b"first_challenge")
        await db_session.commit()

        await service.store_challenge(b"second_challenge")
        await db_session.commit()

        retrieved = await service.get_and_consume_challenge()
        assert retrieved == b"second_challenge"

        # Only one challenge should exist (the old one was replaced)
        second_retrieval = await service.get_and_consume_challenge()
        assert second_retrieval is None


class TestChallengeTTL:
    """Tests for challenge expiration."""

    @pytest.mark.asyncio
    async def test_challenge_has_expiration(self, db_session, test_user):
        """Challenge is stored with correct expiration time."""
        service = ChallengeService(db_session, test_user.id)
        before = datetime.now(UTC)

        await service.store_challenge(b"test_challenge")
        await db_session.commit()

        # Query the challenge directly to check expiration
        result = await db_session.execute(select(WebAuthnChallenge).where(WebAuthnChallenge.user_id == test_user.id))
        challenge = result.scalar_one()

        after = datetime.now(UTC)
        expected_min = before + timedelta(seconds=CHALLENGE_TTL_SECONDS)
        expected_max = after + timedelta(seconds=CHALLENGE_TTL_SECONDS)

        # SQLite doesn't preserve timezone info, so compare without it
        # The actual expires_at is naive (from SQLite), so strip tz for comparison
        expires_at = challenge.expires_at
        if expires_at.tzinfo is None:
            # SQLite returns naive datetime, make expected naive for comparison
            expected_min = expected_min.replace(tzinfo=None)
            expected_max = expected_max.replace(tzinfo=None)

        assert expires_at >= expected_min
        assert expires_at <= expected_max

    @pytest.mark.asyncio
    async def test_expired_challenge_not_returned(self, db_session, test_user):
        """Expired challenges are not returned."""
        # Manually create an expired challenge
        expired_challenge = WebAuthnChallenge(
            user_id=test_user.id,
            challenge=b"expired_challenge",
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
        db_session.add(expired_challenge)
        await db_session.commit()

        service = ChallengeService(db_session, test_user.id)
        retrieved = await service.get_and_consume_challenge()

        assert retrieved is None

    @pytest.mark.asyncio
    async def test_cleanup_expired_challenges(self, db_session, test_user, test_user_2):
        """cleanup_expired removes all expired challenges."""
        # Create one expired and one valid challenge for each user
        expired_1 = WebAuthnChallenge(
            user_id=test_user.id,
            challenge=b"expired_1",
            expires_at=datetime.now(UTC) - timedelta(seconds=60),
        )
        expired_2 = WebAuthnChallenge(
            user_id=test_user_2.id,
            challenge=b"expired_2",
            expires_at=datetime.now(UTC) - timedelta(seconds=30),
        )
        valid = WebAuthnChallenge(
            user_id=test_user.id,
            challenge=b"valid_challenge",
            expires_at=datetime.now(UTC) + timedelta(seconds=300),
        )
        db_session.add_all([expired_1, expired_2, valid])
        await db_session.commit()

        # Run cleanup
        deleted_count = await ChallengeService.cleanup_expired(db_session)

        assert deleted_count == 2

        # Valid challenge should still exist
        result = await db_session.execute(select(WebAuthnChallenge))
        remaining = result.scalars().all()
        assert len(remaining) == 1
        assert remaining[0].challenge == b"valid_challenge"


class TestChallengeMultitenancy:
    """
    CRITICAL: Tests for user isolation.

    User A must never be able to access User B's challenges.
    """

    @pytest.mark.asyncio
    async def test_users_have_separate_challenges(self, db_session, test_user, test_user_2):
        """Each user has their own isolated challenge."""
        service1 = ChallengeService(db_session, test_user.id)
        service2 = ChallengeService(db_session, test_user_2.id)

        await service1.store_challenge(b"user1_challenge")
        await service2.store_challenge(b"user2_challenge")
        await db_session.commit()

        # Each user retrieves their own challenge
        retrieved1 = await service1.get_and_consume_challenge()
        retrieved2 = await service2.get_and_consume_challenge()

        assert retrieved1 == b"user1_challenge"
        assert retrieved2 == b"user2_challenge"

    @pytest.mark.asyncio
    async def test_user_cannot_consume_other_users_challenge(self, db_session, test_user, test_user_2):
        """User cannot retrieve another user's challenge."""
        service1 = ChallengeService(db_session, test_user.id)
        service2 = ChallengeService(db_session, test_user_2.id)

        # Only store challenge for user 1
        await service1.store_challenge(b"user1_only")
        await db_session.commit()

        # User 2 should not be able to retrieve it
        retrieved_by_user2 = await service2.get_and_consume_challenge()
        assert retrieved_by_user2 is None

        # User 1 can still retrieve their challenge
        retrieved_by_user1 = await service1.get_and_consume_challenge()
        assert retrieved_by_user1 == b"user1_only"

    @pytest.mark.asyncio
    async def test_replacing_challenge_only_affects_own_user(self, db_session, test_user, test_user_2):
        """Storing a new challenge doesn't affect other users' challenges."""
        service1 = ChallengeService(db_session, test_user.id)
        service2 = ChallengeService(db_session, test_user_2.id)

        # Both users store challenges
        await service1.store_challenge(b"user1_first")
        await service2.store_challenge(b"user2_challenge")
        await db_session.commit()

        # User 1 replaces their challenge
        await service1.store_challenge(b"user1_second")
        await db_session.commit()

        # User 2's challenge should be unaffected
        retrieved2 = await service2.get_and_consume_challenge()
        assert retrieved2 == b"user2_challenge"

        # User 1 gets their new challenge
        retrieved1 = await service1.get_and_consume_challenge()
        assert retrieved1 == b"user1_second"


class TestChallengeModelExists:
    """Contract tests to verify model and service exist."""

    def test_webauthn_challenge_model_exists(self):
        """WebAuthnChallenge model should exist in models."""
        from app.models import WebAuthnChallenge

        assert WebAuthnChallenge.__tablename__ == "webauthn_challenges"

    def test_challenge_service_exists(self):
        """ChallengeService should exist and have required methods."""
        from app.services.challenge_service import ChallengeService

        assert hasattr(ChallengeService, "store_challenge")
        assert hasattr(ChallengeService, "get_and_consume_challenge")
        assert hasattr(ChallengeService, "cleanup_expired")

    def test_challenge_ttl_is_reasonable(self):
        """Challenge TTL should be 5 minutes (300 seconds)."""
        from app.services.challenge_service import CHALLENGE_TTL_SECONDS

        assert CHALLENGE_TTL_SECONDS == 300
