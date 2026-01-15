"""
End-to-End Encryption Tests.

Comprehensive tests for the E2E encryption implementation in Whendoist.
Tests cover service layer, API endpoints, multitenancy isolation, and
JavaScript module contracts.

Test Category: Unit (async, uses in-memory SQLite) + Contract (JS verification)
Related Code:
- app/services/preferences_service.py (encryption config)
- app/services/task_service.py (user-scoped CRUD)
- app/routers/preferences.py (encryption endpoints)
- app/routers/tasks.py (all-content, batch-update endpoints)
- app/routers/domains.py (batch-update endpoint)
- static/js/crypto.js (client-side encryption)

Architecture Overview:
- ONE global toggle (encryption_enabled) per user - not per-record flags
- THREE encrypted fields: task.title, task.description, domain.name
- All-or-nothing: when enabled, ALL data is encrypted; when disabled, ALL is plaintext
- Client-side encryption using Web Crypto API (AES-256-GCM)
- Key derived from user passphrase via PBKDF2 (100,000 iterations)
- Key stored in sessionStorage (cleared on tab close)

Security Guarantees Tested:
1. Multitenancy isolation - User A cannot access User B's encrypted data
2. Batch updates respect user_id scoping
3. API endpoints return only authenticated user's data

See tests/README.md for full test architecture.
"""

from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Task, User
from app.services.preferences_service import PreferencesService
from app.services.task_service import TaskService

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(email="test@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def test_user_2(db_session: AsyncSession) -> User:
    """Create a second test user for multitenancy tests."""
    user = User(email="other@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def user_with_encryption(db_session: AsyncSession, test_user: User) -> User:
    """Create a user with encryption enabled."""
    service = PreferencesService(db_session, test_user.id)
    await service.setup_encryption(salt="test-salt-base64-encoded", test_value="encrypted-test-value-here")
    await db_session.commit()
    return test_user


@pytest.fixture
async def test_domain(db_session: AsyncSession, test_user: User) -> Domain:
    """Create a test domain for the user."""
    service = TaskService(db_session, test_user.id)
    domain = await service.create_domain(name="Test Domain", icon="📁")
    await db_session.flush()
    return domain


@pytest.fixture
async def test_tasks(db_session: AsyncSession, test_user: User, test_domain: Domain) -> list[Task]:
    """Create multiple test tasks."""
    service = TaskService(db_session, test_user.id)
    tasks = []
    for i in range(3):
        task = await service.create_task(
            title=f"Task {i + 1}",
            description=f"Description for task {i + 1}",
            domain_id=test_domain.id,
            impact=i + 1,
        )
        tasks.append(task)
    await db_session.flush()
    return tasks


# =============================================================================
# Encryption Preferences Tests
# =============================================================================


class TestEncryptionPreferences:
    """Tests for encryption-related user preferences."""

    async def test_encryption_disabled_by_default(self, db_session: AsyncSession, test_user: User):
        """New users have encryption disabled by default."""
        service = PreferencesService(db_session, test_user.id)
        prefs = await service.get_preferences()

        assert prefs.encryption_enabled is False
        assert prefs.encryption_salt is None
        assert prefs.encryption_test_value is None

    async def test_setup_encryption_enables_flag(self, db_session: AsyncSession, test_user: User):
        """Setting up encryption enables the encryption_enabled flag."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()  # Create defaults

        result = await service.setup_encryption(salt="salt123", test_value="test456")

        assert result.encryption_enabled is True

    async def test_setup_encryption_stores_salt(self, db_session: AsyncSession, test_user: User):
        """Salt is stored for key derivation on subsequent unlocks."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        salt = "random-salt-base64-encoded"
        result = await service.setup_encryption(salt=salt, test_value="test")

        assert result.encryption_salt == salt

    async def test_setup_encryption_stores_test_value(self, db_session: AsyncSession, test_user: User):
        """Test value is stored for passphrase verification."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        test_value = "AES-256-GCM-encrypted-known-plaintext"
        result = await service.setup_encryption(salt="salt", test_value=test_value)

        assert result.encryption_test_value == test_value

    async def test_disable_encryption_clears_all_fields(self, db_session: AsyncSession, test_user: User):
        """Disabling encryption clears salt and test value."""
        service = PreferencesService(db_session, test_user.id)
        await service.get_preferences()

        # Enable first
        await service.setup_encryption(salt="salt", test_value="test")

        # Then disable
        result = await service.disable_encryption()

        assert result.encryption_enabled is False
        assert result.encryption_salt is None
        assert result.encryption_test_value is None

    async def test_encryption_state_persists_across_service_instances(self, db_session: AsyncSession, test_user: User):
        """Encryption state persists when creating new service instances."""
        # Enable encryption
        service1 = PreferencesService(db_session, test_user.id)
        await service1.setup_encryption(salt="persisted-salt", test_value="persisted-test")
        await db_session.commit()

        # Create new service instance
        service2 = PreferencesService(db_session, test_user.id)
        prefs = await service2.get_preferences()

        assert prefs.encryption_enabled is True
        assert prefs.encryption_salt == "persisted-salt"
        assert prefs.encryption_test_value == "persisted-test"


# =============================================================================
# Multitenancy Isolation Tests (CRITICAL)
# =============================================================================


class TestEncryptionMultitenancy:
    """
    CRITICAL: Tests ensuring encryption operations are properly isolated per user.

    These tests verify that:
    1. User A cannot read User B's tasks or domains
    2. User A cannot modify User B's tasks or domains via batch update
    3. Encryption settings are completely isolated per user
    """

    async def test_users_have_separate_encryption_states(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """Each user has their own independent encryption state."""
        service1 = PreferencesService(db_session, test_user.id)
        service2 = PreferencesService(db_session, test_user_2.id)

        # Enable encryption for user 1 only
        await service1.setup_encryption(salt="user1-salt", test_value="user1-test")

        # User 2 should still have encryption disabled
        prefs2 = await service2.get_preferences()
        assert prefs2.encryption_enabled is False
        assert prefs2.encryption_salt is None

    async def test_get_tasks_returns_only_current_users_tasks(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """TaskService.get_tasks() returns only the authenticated user's tasks."""
        # Create tasks for user 1
        service1 = TaskService(db_session, test_user.id)
        await service1.create_task(title="User 1 Task")

        # Create tasks for user 2
        service2 = TaskService(db_session, test_user_2.id)
        await service2.create_task(title="User 2 Task")
        await db_session.flush()

        # User 1 should only see their own tasks
        user1_tasks = await service1.get_tasks(status=None, top_level_only=False)
        assert len(user1_tasks) == 1
        assert user1_tasks[0].title == "User 1 Task"
        assert user1_tasks[0].user_id == test_user.id

        # User 2 should only see their own tasks
        user2_tasks = await service2.get_tasks(status=None, top_level_only=False)
        assert len(user2_tasks) == 1
        assert user2_tasks[0].title == "User 2 Task"
        assert user2_tasks[0].user_id == test_user_2.id

    async def test_get_task_by_id_requires_ownership(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """get_task() returns None when accessing another user's task."""
        # Create task for user 1
        service1 = TaskService(db_session, test_user.id)
        task = await service1.create_task(title="User 1 Private Task")
        await db_session.flush()

        # User 2 tries to access user 1's task
        service2 = TaskService(db_session, test_user_2.id)
        result = await service2.get_task(task.id)

        assert result is None, "User 2 should NOT be able to access User 1's task"

    async def test_get_domains_returns_only_current_users_domains(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """get_domains() returns only the authenticated user's domains."""
        # Create domains for both users
        service1 = TaskService(db_session, test_user.id)
        await service1.create_domain(name="User 1 Domain")

        service2 = TaskService(db_session, test_user_2.id)
        await service2.create_domain(name="User 2 Domain")
        await db_session.flush()

        # User 1 should only see their own domains
        user1_domains = await service1.get_domains()
        assert len(user1_domains) == 1
        assert user1_domains[0].name == "User 1 Domain"

    async def test_get_domain_by_id_requires_ownership(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """get_domain() returns None when accessing another user's domain."""
        # Create domain for user 1
        service1 = TaskService(db_session, test_user.id)
        domain = await service1.create_domain(name="Private Domain")
        await db_session.flush()

        # User 2 tries to access user 1's domain
        service2 = TaskService(db_session, test_user_2.id)
        result = await service2.get_domain(domain.id)

        assert result is None, "User 2 should NOT be able to access User 1's domain"

    async def test_update_task_requires_ownership(self, db_session: AsyncSession, test_user: User, test_user_2: User):
        """update_task() cannot modify another user's task."""
        # Create task for user 1
        service1 = TaskService(db_session, test_user.id)
        task = await service1.create_task(title="Original Title")
        await db_session.flush()
        original_title = task.title

        # User 2 tries to update user 1's task
        service2 = TaskService(db_session, test_user_2.id)
        result = await service2.update_task(task.id, title="Malicious Update")

        assert result is None, "update_task should return None for other user's task"

        # Verify task was not modified
        await db_session.refresh(task)
        assert task.title == original_title

    async def test_update_domain_requires_ownership(self, db_session: AsyncSession, test_user: User, test_user_2: User):
        """update_domain() cannot modify another user's domain."""
        # Create domain for user 1
        service1 = TaskService(db_session, test_user.id)
        domain = await service1.create_domain(name="Original Name")
        await db_session.flush()
        original_name = domain.name

        # User 2 tries to update user 1's domain
        service2 = TaskService(db_session, test_user_2.id)
        result = await service2.update_domain(domain.id, name="Hacked Name")

        assert result is None, "update_domain should return None for other user's domain"

        # Verify domain was not modified
        await db_session.refresh(domain)
        assert domain.name == original_name

    async def test_batch_update_only_affects_owned_tasks(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """
        Simulates batch-update endpoint behavior.

        When a malicious user sends task IDs belonging to another user,
        those tasks should NOT be modified.
        """
        # Create tasks for both users
        service1 = TaskService(db_session, test_user.id)
        task1 = await service1.create_task(title="User 1 Task")

        service2 = TaskService(db_session, test_user_2.id)
        task2 = await service2.create_task(title="User 2 Task")
        await db_session.flush()

        # Simulate User 2 trying to batch-update User 1's task
        # This mimics what the /api/tasks/batch-update endpoint does
        malicious_update_data = [
            {"id": task1.id, "title": "HACKED BY USER 2", "description": "Malicious"},
            {"id": task2.id, "title": "Legitimate Update", "description": "OK"},
        ]

        updated_count = 0
        for item in malicious_update_data:
            # get_task filters by user_id, so returns None for other users' tasks
            task = await service2.get_task(item["id"])
            if not task:
                continue  # Skip tasks that don't belong to this user
            await service2.update_task(task_id=item["id"], title=item["title"])
            updated_count += 1

        await db_session.commit()

        # Only User 2's own task should have been updated
        assert updated_count == 1, "Only 1 task should have been updated"

        # Verify User 1's task was NOT modified
        await db_session.refresh(task1)
        assert task1.title == "User 1 Task", "User 1's task should NOT have been modified"

        # Verify User 2's task WAS modified
        await db_session.refresh(task2)
        assert task2.title == "Legitimate Update", "User 2's task should have been updated"


# =============================================================================
# Data Isolation Tests
# =============================================================================


class TestEncryptionDataIsolation:
    """Tests for ensuring data is properly isolated during encryption operations."""

    async def test_all_content_query_respects_user_scope(
        self, db_session: AsyncSession, test_user: User, test_user_2: User
    ):
        """
        Simulates /api/tasks/all-content behavior.

        This endpoint is used when enabling/disabling encryption to fetch
        all data for batch encryption/decryption. It MUST only return
        the authenticated user's data.
        """
        # Create data for both users
        service1 = TaskService(db_session, test_user.id)
        await service1.create_task(title="User 1 Secret Task")
        await service1.create_domain(name="User 1 Secret Domain")

        service2 = TaskService(db_session, test_user_2.id)
        await service2.create_task(title="User 2 Secret Task")
        await service2.create_domain(name="User 2 Secret Domain")
        await db_session.flush()

        # Simulate all-content fetch for User 1
        # (mimics what /api/tasks/all-content does)
        user1_tasks = await service1.get_tasks(status=None, top_level_only=False)
        user1_domains = await service1.get_domains(include_archived=False)

        # User 1 should only see their own data
        assert len(user1_tasks) == 1
        assert user1_tasks[0].title == "User 1 Secret Task"
        assert len(user1_domains) == 1
        assert user1_domains[0].name == "User 1 Secret Domain"

        # Verify no cross-user data leakage
        for task in user1_tasks:
            assert task.user_id == test_user.id
        for domain in user1_domains:
            assert domain.user_id == test_user.id

    async def test_creating_task_sets_correct_user_id(self, db_session: AsyncSession, test_user: User):
        """Created tasks are always assigned to the authenticated user."""
        service = TaskService(db_session, test_user.id)
        task = await service.create_task(title="New Task")
        await db_session.flush()

        assert task.user_id == test_user.id

    async def test_creating_domain_sets_correct_user_id(self, db_session: AsyncSession, test_user: User):
        """Created domains are always assigned to the authenticated user."""
        service = TaskService(db_session, test_user.id)
        domain = await service.create_domain(name="New Domain")
        await db_session.flush()

        assert domain.user_id == test_user.id


# =============================================================================
# JavaScript Module Contract Tests
# =============================================================================


JS_DIR = Path(__file__).parent.parent / "static" / "js"


class TestCryptoModuleExportsAPI:
    """Verify crypto.js exports the required API for client-side encryption."""

    @pytest.fixture
    def crypto_js(self) -> str:
        return (JS_DIR / "crypto.js").read_text()

    def test_exports_window_crypto_object(self, crypto_js: str):
        """Crypto must be exposed on window object."""
        assert "window.Crypto = Crypto" in crypto_js

    def test_exports_is_encryption_enabled(self, crypto_js: str):
        """Must export isEncryptionEnabled for state checking."""
        assert "isEncryptionEnabled" in crypto_js

    def test_exports_can_crypto(self, crypto_js: str):
        """Must export canCrypto for checking if operations are possible."""
        assert "canCrypto" in crypto_js

    def test_exports_has_stored_key(self, crypto_js: str):
        """Must export hasStoredKey for checking key availability."""
        assert "hasStoredKey" in crypto_js

    def test_exports_setup_encryption(self, crypto_js: str):
        """Must export setupEncryption for initial passphrase setup."""
        assert "setupEncryption" in crypto_js

    def test_exports_unlock_encryption(self, crypto_js: str):
        """Must export unlockEncryption for subsequent unlocks."""
        assert "unlockEncryption" in crypto_js

    def test_exports_encrypt_field(self, crypto_js: str):
        """Must export encryptField for encrypting individual values."""
        assert "encryptField" in crypto_js

    def test_exports_decrypt_field(self, crypto_js: str):
        """Must export decryptField for decrypting individual values."""
        assert "decryptField" in crypto_js

    def test_exports_encrypt_all_data(self, crypto_js: str):
        """Must export encryptAllData for batch encryption on enable."""
        assert "encryptAllData" in crypto_js

    def test_exports_decrypt_all_data(self, crypto_js: str):
        """Must export decryptAllData for batch decryption on disable."""
        assert "decryptAllData" in crypto_js

    def test_exports_clear_stored_key(self, crypto_js: str):
        """Must export clearStoredKey for logout."""
        assert "clearStoredKey" in crypto_js


class TestCryptoModuleArchitecture:
    """Verify crypto.js follows the global toggle architecture."""

    @pytest.fixture
    def crypto_js(self) -> str:
        return (JS_DIR / "crypto.js").read_text()

    def test_uses_window_whendoist_config(self, crypto_js: str):
        """Must check window.WHENDOIST for encryption state."""
        assert "window.WHENDOIST" in crypto_js
        assert "encryptionEnabled" in crypto_js

    def test_uses_session_storage_for_key(self, crypto_js: str):
        """Key must be stored in sessionStorage (cleared on tab close)."""
        assert "sessionStorage" in crypto_js

    def test_uses_pbkdf2_iterations(self, crypto_js: str):
        """Must use PBKDF2 with sufficient iterations (100k+)."""
        assert "PBKDF2_ITERATIONS" in crypto_js
        assert "100000" in crypto_js

    def test_uses_aes_gcm(self, crypto_js: str):
        """Must use AES-GCM for authenticated encryption."""
        assert "AES-GCM" in crypto_js

    def test_uses_web_crypto_api(self, crypto_js: str):
        """Must use Web Crypto API (crypto.subtle)."""
        assert "crypto.subtle" in crypto_js

    def test_has_test_value_constant(self, crypto_js: str):
        """Must have known test value for passphrase verification."""
        assert "WHENDOIST_ENCRYPTION_TEST" in crypto_js

    def test_documents_architecture(self, crypto_js: str):
        """Module should document its architecture."""
        assert "global toggle" in crypto_js.lower() or "window.WHENDOIST" in crypto_js


class TestCryptoModuleIntegration:
    """Verify other modules properly integrate with crypto.js."""

    def test_dashboard_calls_decrypt_on_load(self):
        """dashboard.html should decrypt data on page load if encryption enabled."""
        dashboard_html = (Path(__file__).parent.parent / "app" / "templates" / "dashboard.html").read_text()

        assert "Crypto.canCrypto()" in dashboard_html, "dashboard.html must check Crypto.canCrypto() before decrypting"
        assert "Crypto.decryptField" in dashboard_html, (
            "dashboard.html must use Crypto.decryptField to decrypt task titles"
        )

    def test_settings_has_encryption_setup_flow(self):
        """settings.html should have encryption enable/disable UI."""
        settings_html = (Path(__file__).parent.parent / "app" / "templates" / "settings.html").read_text()

        assert "Crypto.setupEncryption" in settings_html, "settings.html must use Crypto.setupEncryption for enabling"
        assert "encryptAllData" in settings_html or "encryptAllData" in settings_html, (
            "settings.html must use batch encryption when enabling"
        )

    def test_task_dialog_encrypts_on_save(self):
        """task-dialog.js should encrypt fields when saving if encryption enabled."""
        task_dialog_js = (JS_DIR / "task-dialog.js").read_text()

        assert "Crypto" in task_dialog_js, "task-dialog.js must use Crypto module"

    def test_base_template_sets_encryption_config(self):
        """base.html should set window.WHENDOIST config for encryption state."""
        base_html = (Path(__file__).parent.parent / "app" / "templates" / "base.html").read_text()

        assert "window.WHENDOIST" in base_html, "base.html must set window.WHENDOIST global config"
        assert "encryptionEnabled" in base_html, "base.html must include encryptionEnabled in config"


# =============================================================================
# Encryption Flow Tests
# =============================================================================


class TestEncryptionFlows:
    """
    Tests for complete encryption enable/disable flows.

    These test the logical flow without requiring actual cryptographic operations.
    """

    async def test_enable_encryption_flow(
        self, db_session: AsyncSession, test_user: User, test_tasks: list[Task], test_domain: Domain
    ):
        """
        Tests the enable encryption flow:
        1. User has existing plaintext data
        2. User calls setup_encryption to enable
        3. Encryption state is saved
        4. (In real app: client encrypts all data via batch-update)
        """
        pref_service = PreferencesService(db_session, test_user.id)
        task_service = TaskService(db_session, test_user.id)

        # Verify initial state
        prefs = await pref_service.get_preferences()
        assert prefs.encryption_enabled is False

        # Verify we have plaintext data
        tasks = await task_service.get_tasks(status=None, top_level_only=False)
        assert len(tasks) == 3
        domains = await task_service.get_domains()
        assert len(domains) == 1

        # Enable encryption
        await pref_service.setup_encryption(
            salt="generated-salt-32-bytes-base64", test_value="encrypted-WHENDOIST_ENCRYPTION_TEST"
        )
        await db_session.commit()

        # Verify encryption is now enabled
        prefs = await pref_service.get_preferences()
        assert prefs.encryption_enabled is True
        assert prefs.encryption_salt == "generated-salt-32-bytes-base64"

        # In real flow, client would now:
        # 1. Fetch all content via /api/tasks/all-content
        # 2. Encrypt each task title/description and domain name
        # 3. Send encrypted values via /api/tasks/batch-update and /api/domains/batch-update

    async def test_disable_encryption_flow(self, db_session: AsyncSession, user_with_encryption: User):
        """
        Tests the disable encryption flow:
        1. User has encrypted data
        2. User calls disable_encryption
        3. Encryption state is cleared
        4. (In real app: client decrypts all data via batch-update)
        """
        pref_service = PreferencesService(db_session, user_with_encryption.id)

        # Verify encryption is enabled
        prefs = await pref_service.get_preferences()
        assert prefs.encryption_enabled is True

        # Disable encryption
        await pref_service.disable_encryption()
        await db_session.commit()

        # Verify encryption is now disabled
        prefs = await pref_service.get_preferences()
        assert prefs.encryption_enabled is False
        assert prefs.encryption_salt is None
        assert prefs.encryption_test_value is None


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEncryptionEdgeCases:
    """Tests for edge cases and error handling."""

    async def test_batch_update_with_empty_list(self, db_session: AsyncSession, test_user: User):
        """Batch update with empty list should be a no-op."""
        service = TaskService(db_session, test_user.id)

        # Simulate empty batch update
        update_data: list[dict] = []
        updated_count = 0
        for item in update_data:
            task = await service.get_task(item["id"])
            if task:
                await service.update_task(task_id=item["id"], **item)
                updated_count += 1

        assert updated_count == 0

    async def test_batch_update_with_nonexistent_ids(self, db_session: AsyncSession, test_user: User):
        """Batch update with non-existent IDs should skip them."""
        service = TaskService(db_session, test_user.id)

        # Simulate batch update with fake IDs
        update_data = [
            {"id": 99999, "title": "Fake Task 1"},
            {"id": 99998, "title": "Fake Task 2"},
        ]

        updated_count = 0
        for item in update_data:
            task = await service.get_task(item["id"])
            if task:
                await service.update_task(task_id=item["id"], title=item["title"])
                updated_count += 1

        assert updated_count == 0, "No tasks should be updated for non-existent IDs"

    async def test_can_enable_encryption_multiple_times_after_disable(self, db_session: AsyncSession, test_user: User):
        """Can re-enable encryption after disabling with different passphrase."""
        service = PreferencesService(db_session, test_user.id)

        # First enable
        await service.setup_encryption(salt="salt1", test_value="test1")
        assert (await service.get_preferences()).encryption_enabled is True

        # Disable
        await service.disable_encryption()
        assert (await service.get_preferences()).encryption_enabled is False

        # Re-enable with different credentials
        await service.setup_encryption(salt="salt2-different", test_value="test2-different")
        prefs = await service.get_preferences()

        assert prefs.encryption_enabled is True
        assert prefs.encryption_salt == "salt2-different"
        assert prefs.encryption_test_value == "test2-different"

    async def test_encryption_state_independent_of_other_preferences(self, db_session: AsyncSession, test_user: User):
        """Modifying encryption doesn't affect other preferences."""
        service = PreferencesService(db_session, test_user.id)

        # Set some preferences
        await service.update_preferences(
            completed_retention_days=7,
            show_completed_in_list=False,
        )

        # Enable encryption
        await service.setup_encryption(salt="salt", test_value="test")

        # Verify other preferences unchanged
        prefs = await service.get_preferences()
        assert prefs.completed_retention_days == 7
        assert prefs.show_completed_in_list is False
        assert prefs.encryption_enabled is True

        # Disable encryption
        await service.disable_encryption()

        # Verify other preferences still unchanged
        prefs = await service.get_preferences()
        assert prefs.completed_retention_days == 7
        assert prefs.show_completed_in_list is False


# =============================================================================
# Data Model Tests
# =============================================================================


class TestEncryptionDataModel:
    """Tests verifying the data model supports encryption correctly."""

    async def test_task_model_has_no_per_record_encryption_flags(self, db_session: AsyncSession, test_user: User):
        """Task model should NOT have per-record encryption flags."""
        service = TaskService(db_session, test_user.id)
        task = await service.create_task(title="Test")
        await db_session.flush()

        # These attributes should NOT exist (removed in encryption rewrite)
        assert not hasattr(task, "title_encrypted"), "title_encrypted flag should not exist"
        assert not hasattr(task, "description_encrypted"), "description_encrypted flag should not exist"

    async def test_domain_model_has_no_per_record_encryption_flags(self, db_session: AsyncSession, test_user: User):
        """Domain model should NOT have per-record encryption flags."""
        service = TaskService(db_session, test_user.id)
        domain = await service.create_domain(name="Test")
        await db_session.flush()

        # This attribute should NOT exist (removed in encryption rewrite)
        assert not hasattr(domain, "name_encrypted"), "name_encrypted flag should not exist"

    async def test_user_preferences_has_encryption_fields(self, db_session: AsyncSession, test_user: User):
        """UserPreferences model has encryption-related fields."""
        service = PreferencesService(db_session, test_user.id)
        prefs = await service.get_preferences()

        # These fields MUST exist
        assert hasattr(prefs, "encryption_enabled"), "encryption_enabled field must exist"
        assert hasattr(prefs, "encryption_salt"), "encryption_salt field must exist"
        assert hasattr(prefs, "encryption_test_value"), "encryption_test_value field must exist"
