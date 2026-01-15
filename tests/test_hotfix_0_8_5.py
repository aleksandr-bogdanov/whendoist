"""
Hotfix v0.8.5 Tests - Encryption Column Sizes and OAuth Redirect.

These tests verify the fixes for the following issues:
1. Task.title and Domain.name columns must be TEXT (not VARCHAR)
   to accommodate encrypted data which is ~1.4x larger than plaintext
2. Todoist OAuth callback must redirect to /settings, not /dashboard
3. JS module contract: import encryption must update both tasks AND domains

Test Category: Unit + Contract
Related Issues:
- Encrypted text exceeds VARCHAR(500) limit
- Todoist connection redirects to wrong page
- Import encryption doesn't save encrypted domains

See tests/README.md for full test architecture.
"""

from pathlib import Path

import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Domain, Task

# =============================================================================
# Model Column Type Tests
# =============================================================================


class TestEncryptedColumnTypes:
    """
    Verify that columns storing encrypted data use TEXT (unlimited length).

    Encrypted data format: base64(IV || ciphertext || authTag)
    - 12 bytes IV
    - Original text length (as ciphertext)
    - 16 bytes auth tag
    - All base64 encoded (~1.33x expansion)

    A 500-character plaintext title becomes ~700+ characters when encrypted.
    VARCHAR(500) is insufficient - must use TEXT.
    """

    def test_task_title_is_text_type(self):
        """
        Task.title column MUST be TEXT to store encrypted content.

        Bug Fix: Previously VARCHAR(500), which caused StringDataRightTruncationError
        when saving encrypted task titles after Todoist import.
        """
        # Get the column type from the model metadata
        mapper = inspect(Task)
        title_column = mapper.columns["title"]

        # SQLAlchemy Text type should be used
        type_name = str(title_column.type).upper()
        assert "TEXT" in type_name or "CLOB" in type_name, (
            f"Task.title should be TEXT type, got {title_column.type}. VARCHAR(500) is too small for encrypted content."
        )

    def test_task_description_is_text_type(self):
        """Task.description column MUST be TEXT to store encrypted content."""
        mapper = inspect(Task)
        desc_column = mapper.columns["description"]
        type_name = str(desc_column.type).upper()
        assert "TEXT" in type_name or "CLOB" in type_name, (
            f"Task.description should be TEXT type, got {desc_column.type}"
        )

    def test_domain_name_is_text_type(self):
        """
        Domain.name column MUST be TEXT to store encrypted content.

        Bug Fix: Previously VARCHAR(255), which could cause truncation
        when saving encrypted domain names.
        """
        mapper = inspect(Domain)
        name_column = mapper.columns["name"]
        type_name = str(name_column.type).upper()
        assert "TEXT" in type_name or "CLOB" in type_name, (
            f"Domain.name should be TEXT type, got {name_column.type}. VARCHAR(255) is too small for encrypted content."
        )


# =============================================================================
# OAuth Redirect Tests
# =============================================================================


class TestTodoistOAuthRedirect:
    """
    Verify Todoist OAuth callback redirects to /settings page.

    Bug Fix: Previously redirected to /dashboard, but users connect Todoist
    from the Settings page and expect to return there.
    """

    def test_callback_returns_to_settings(self):
        """
        Todoist OAuth callback MUST redirect to /settings.

        Contract test: Verify the redirect URL in auth.py source code.
        """
        auth_file = Path(__file__).parent.parent / "app" / "routers" / "auth.py"
        source = auth_file.read_text()

        # Find the todoist_callback function
        assert "async def todoist_callback" in source, "todoist_callback function must exist"

        # The redirect after successful OAuth should be to /settings
        # Find the section after token commit
        callback_section = source.split("async def todoist_callback")[1]

        # Check that after db.commit(), we redirect to /settings
        assert (
            'RedirectResponse(url="/settings"' in callback_section
            or "RedirectResponse(url='/settings'" in callback_section
        ), (
            "Todoist OAuth callback must redirect to /settings after successful auth. "
            "Found redirect to /dashboard or other page instead."
        )


# =============================================================================
# JS Module Contract Tests
# =============================================================================


class TestImportEncryptionContract:
    """
    Verify import encryption updates BOTH tasks AND domains.

    Bug Fix: Previously only tasks were batch-updated after import,
    leaving domains as plaintext even when encryption was enabled.
    """

    def test_import_encrypts_domains(self):
        """
        Import encryption MUST update domains via batch-update endpoint.

        Contract test: Verify the JS code calls /api/domains/batch-update
        after encrypting imported data.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        # Find the executeImport function
        assert "async function executeImport()" in source, "executeImport function must exist"

        # Extract the import section
        import_section = source.split("async function executeImport()")[1].split("async function")[0]

        # Check for domains batch-update call
        assert "/api/domains/batch-update" in import_section, (
            "Import encryption must call /api/domains/batch-update to save encrypted domain names. "
            "Without this, domains remain as plaintext even when encryption is enabled."
        )

    def test_import_handles_encryption_errors(self):
        """
        Import encryption MUST handle and report errors properly.

        Contract test: Verify error handling exists for batch-update failures.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        import_section = source.split("async function executeImport()")[1].split("async function")[0]

        # Should check response status
        assert "!taskResp.ok" in import_section or "!domainResp.ok" in import_section, (
            "Import encryption must check batch-update response status. "
            "Without this, silent failures leave data as plaintext."
        )

        # Should report errors to user
        assert "encryptErrors" in import_section or "Encryption" in import_section, (
            "Import encryption must report errors to the user"
        )


# =============================================================================
# Integration Tests
# =============================================================================


@pytest.mark.asyncio
class TestEncryptedContentStorage:
    """
    Integration tests for storing encrypted content.

    These tests verify that long encrypted strings can be stored
    without truncation errors.
    """

    async def test_can_store_long_encrypted_title(self, db_session: AsyncSession):
        """
        Task.title can store a long encrypted string without truncation.

        Simulates a typical encrypted value: base64-encoded ciphertext
        which is longer than the original plaintext.
        """
        from app.models import User
        from app.services.task_service import TaskService

        # Create user
        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Simulate encrypted content that would fail with VARCHAR(500)
        # Real encrypted data from the bug report: 500+ chars of base64
        # AES-GCM output: 12 bytes IV + ciphertext + 16 bytes tag, all base64 encoded
        encrypted_title = (
            "TlWEWWs5QBHUi8f8VL9+Fx0CeKmiIpjGU+6oqTFYoBpJy4F2hfxt7ele3im+Mijee"
            "+Mci4pQsV3P5WBn6xoqUd8/e04kcWNczYlSmCP+8MvaCBOoOG6bHXatSEEhOCIj9pL"
            "opiRSowOfnIkWogRERx/7JpfV+daGlhOhx3IPhrmdKQe39RH7qc+go6vs2vYRVkEqe"
            "zZ8RHowQEYc8UpLIAC1gM+GRm2W35AENLvGzo0Jz+VJANh+MaNokTxvgv74aQP6v80"
            "R04DmNRcKOno1B6yWXZTX0cBflnEGkmwrv+abcdefghijklmnopqrstuvwxyz12345"
            "67890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
            "+/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=="
        )

        # This should not raise StringDataRightTruncationError
        task = await service.create_task(title=encrypted_title)
        await db_session.flush()

        assert task.id is not None
        assert task.title == encrypted_title
        assert len(task.title) > 500, f"Test string only {len(encrypted_title)} chars, need >500"

    async def test_can_store_long_encrypted_domain_name(self, db_session: AsyncSession):
        """
        Domain.name can store a long encrypted string without truncation.
        """
        from app.models import User
        from app.services.task_service import TaskService

        # Create user
        user = User(email="test@example.com")
        db_session.add(user)
        await db_session.flush()

        service = TaskService(db_session, user.id)

        # Simulate encrypted domain name (260+ chars, would fail with VARCHAR(255))
        encrypted_name = (
            "TlWEWWs5QBHUi8f8VL9+Fx0CeKmiIpjGU+6oqTFYoBpJy4F2hfxt7ele3im+Mijee"
            "+Mci4pQsV3P5WBn6xoqUd8/e04kcWNczYlSmCP+8MvaCBOoOG6bHXatSEEhOCIj9pL"
            "opiRSowOfnIkWogRERx/7JpfV+daGlhOhx3IPhrmdKQe39RH7qc+go6vs2vYRVkEqe"
            "zZ8RHowQEYc8UpLIAC1gM+GRm2W35AENLvGzo0Jz+VJANh+MaNokTxvgv74aQP"
        )

        domain = await service.create_domain(name=encrypted_name)
        await db_session.flush()

        assert domain.id is not None
        assert domain.name == encrypted_name
        assert len(domain.name) > 255, f"Test string only {len(encrypted_name)} chars, need >255"
