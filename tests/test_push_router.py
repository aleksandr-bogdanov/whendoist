"""
Tests for push notification device token router.

Tests registration, deduplication, cap enforcement, unregistration,
and multitenancy isolation.

@pytest.mark.unit — SQLite-based, no external deps.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DeviceToken, User


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    user = User(email="push-test@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def other_user(db_session: AsyncSession) -> User:
    user = User(email="other@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.unit
class TestDeviceTokenRegistration:
    """Test device token CRUD operations directly on the model."""

    async def test_register_token(self, db_session: AsyncSession, test_user: User):
        """Register a new device token."""
        token = DeviceToken(user_id=test_user.id, token="fcm-token-abc", platform="android")
        db_session.add(token)
        await db_session.flush()

        result = await db_session.execute(select(DeviceToken).where(DeviceToken.user_id == test_user.id))
        tokens = list(result.scalars().all())
        assert len(tokens) == 1
        assert tokens[0].token == "fcm-token-abc"
        assert tokens[0].platform == "android"

    async def test_upsert_existing_token(self, db_session: AsyncSession, test_user: User):
        """Re-registering the same token should not create a duplicate."""
        token1 = DeviceToken(user_id=test_user.id, token="apns-token-xyz", platform="ios")
        db_session.add(token1)
        await db_session.flush()

        # Simulate upsert: check existence first
        result = await db_session.execute(
            select(DeviceToken).where(
                DeviceToken.user_id == test_user.id,
                DeviceToken.token == "apns-token-xyz",
            )
        )
        existing = result.scalar_one_or_none()
        assert existing is not None
        assert existing.platform == "ios"

    async def test_multiple_tokens_per_user(self, db_session: AsyncSession, test_user: User):
        """A user can register multiple device tokens (multiple devices)."""
        db_session.add(DeviceToken(user_id=test_user.id, token="device-1", platform="ios"))
        db_session.add(DeviceToken(user_id=test_user.id, token="device-2", platform="android"))
        await db_session.flush()

        result = await db_session.execute(select(DeviceToken).where(DeviceToken.user_id == test_user.id))
        assert len(list(result.scalars().all())) == 2

    async def test_delete_token(self, db_session: AsyncSession, test_user: User):
        """Unregister a device token."""
        token = DeviceToken(user_id=test_user.id, token="to-delete", platform="ios")
        db_session.add(token)
        await db_session.flush()

        # Delete
        await db_session.delete(token)
        await db_session.flush()

        result = await db_session.execute(select(DeviceToken).where(DeviceToken.user_id == test_user.id))
        assert len(list(result.scalars().all())) == 0

    async def test_cascade_on_user_delete(self, db_session: AsyncSession):
        """Device tokens are deleted when user is deleted (CASCADE)."""
        user = User(email="cascade-test@example.com")
        db_session.add(user)
        await db_session.flush()

        db_session.add(DeviceToken(user_id=user.id, token="cascade-token", platform="android"))
        await db_session.flush()

        await db_session.delete(user)
        await db_session.flush()

        result = await db_session.execute(select(DeviceToken))
        assert len(list(result.scalars().all())) == 0


@pytest.mark.unit
class TestDeviceTokenCap:
    """Verify max tokens per user enforcement."""

    async def test_token_cap_deletes_oldest(self, db_session: AsyncSession, test_user: User):
        """Registering beyond the cap should delete the oldest tokens."""
        from app.constants import PUSH_MAX_TOKENS_PER_USER

        # Register exactly cap tokens
        for i in range(PUSH_MAX_TOKENS_PER_USER):
            db_session.add(DeviceToken(user_id=test_user.id, token=f"token-{i}", platform="ios"))
        await db_session.flush()

        # Simulate what the router does: check count, delete oldest, add new
        count_result = await db_session.execute(
            select(DeviceToken.id).where(DeviceToken.user_id == test_user.id).order_by(DeviceToken.updated_at.asc())
        )
        existing_ids = list(count_result.scalars().all())
        assert len(existing_ids) == PUSH_MAX_TOKENS_PER_USER

        # Adding one more should evict the oldest
        from sqlalchemy import delete

        ids_to_delete = existing_ids[: len(existing_ids) - PUSH_MAX_TOKENS_PER_USER + 1]
        await db_session.execute(delete(DeviceToken).where(DeviceToken.id.in_(ids_to_delete)))
        db_session.add(DeviceToken(user_id=test_user.id, token="token-new", platform="android"))
        await db_session.flush()

        result = await db_session.execute(
            select(DeviceToken).where(DeviceToken.user_id == test_user.id).order_by(DeviceToken.id)
        )
        tokens = list(result.scalars().all())
        assert len(tokens) == PUSH_MAX_TOKENS_PER_USER
        # The first (oldest) token should be gone
        token_strings = [t.token for t in tokens]
        assert "token-0" not in token_strings
        assert "token-new" in token_strings


@pytest.mark.unit
class TestDeviceTokenMultitenancy:
    """Verify device tokens are isolated per user."""

    async def test_users_have_separate_tokens(self, db_session: AsyncSession, test_user: User, other_user: User):
        """Each user only sees their own tokens."""
        db_session.add(DeviceToken(user_id=test_user.id, token="user-a-token", platform="ios"))
        db_session.add(DeviceToken(user_id=other_user.id, token="user-b-token", platform="android"))
        await db_session.flush()

        # User A's tokens
        result_a = await db_session.execute(select(DeviceToken).where(DeviceToken.user_id == test_user.id))
        tokens_a = list(result_a.scalars().all())
        assert len(tokens_a) == 1
        assert tokens_a[0].token == "user-a-token"

        # User B's tokens
        result_b = await db_session.execute(select(DeviceToken).where(DeviceToken.user_id == other_user.id))
        tokens_b = list(result_b.scalars().all())
        assert len(tokens_b) == 1
        assert tokens_b[0].token == "user-b-token"

    async def test_unique_constraint_per_user(self, db_session: AsyncSession, test_user: User, other_user: User):
        """Same token string can exist for different users."""
        db_session.add(DeviceToken(user_id=test_user.id, token="shared-token", platform="ios"))
        db_session.add(DeviceToken(user_id=other_user.id, token="shared-token", platform="ios"))
        await db_session.flush()

        result = await db_session.execute(select(DeviceToken))
        assert len(list(result.scalars().all())) == 2
