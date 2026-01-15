"""
Hotfix v0.8.7 Tests - Thoughts + Connection Resilience + Logging.

These tests verify fixes for:
1. Thought Cabinet showing locks for plaintext Todoist imports
2. Database connection resilience during batch updates
3. Cleaner error logging format

Test Category: Contract + Unit
Related Issues:
- Thoughts showing 🔒 for Todoist imports
- Import freezing due to connection drops
- Verbose error traces in logs

See tests/README.md for full test architecture.
"""

from pathlib import Path

# =============================================================================
# Thoughts Decryption Contract Tests
# =============================================================================


class TestThoughtsDecryptionContract:
    """
    Verify thoughts.html handles plaintext data when encryption is enabled.

    Bug Fix: Thought Cabinet had same decryption bug as dashboard - skipping
    UI update when decrypted === original, leaving 🔒 visible.
    """

    def test_has_looks_encrypted_helper(self):
        """
        Thoughts MUST have looksEncrypted() helper to detect encrypted data.
        """
        thoughts_file = Path(__file__).parent.parent / "app" / "templates" / "thoughts.html"
        source = thoughts_file.read_text()

        assert "function looksEncrypted(value)" in source, (
            "Thoughts must have looksEncrypted() helper function. Without this, plaintext thoughts show as 🔒."
        )

    def test_checks_if_encrypted_before_decrypt(self):
        """
        Thoughts MUST check if data looks encrypted before decrypting.
        """
        thoughts_file = Path(__file__).parent.parent / "app" / "templates" / "thoughts.html"
        source = thoughts_file.read_text()

        assert "async function decryptThoughtTitles()" in source, "decryptThoughtTitles function must exist"

        decrypt_section = source.split("async function decryptThoughtTitles()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "looksEncrypted(title)" in decrypt_section, (
            "Thoughts must check looksEncrypted(title) before decrypting. "
            "Without this check, plaintext data causes UI update to be skipped."
        )

    def test_no_equality_skip_for_thought_titles(self):
        """
        Thoughts must NOT skip update when decrypted === encrypted.
        """
        thoughts_file = Path(__file__).parent.parent / "app" / "templates" / "thoughts.html"
        source = thoughts_file.read_text()

        decrypt_section = source.split("async function decryptThoughtTitles()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "decryptedTitle === encryptedTitle" not in decrypt_section, (
            "Thoughts must NOT skip update when decryptedTitle === encryptedTitle."
        )

    def test_displays_plaintext_on_error(self):
        """
        Thoughts MUST display original value on decryption error.
        """
        thoughts_file = Path(__file__).parent.parent / "app" / "templates" / "thoughts.html"
        source = thoughts_file.read_text()

        decrypt_section = source.split("async function decryptThoughtTitles()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "catch" in decrypt_section, "Thoughts must have error handling for decryption"
        assert "textEl.textContent = title" in decrypt_section, (
            "Thoughts must display original title on decryption error."
        )


# =============================================================================
# Batch Update Resilience Tests
# =============================================================================


class TestBatchUpdateResilience:
    """
    Verify batch update endpoints commit incrementally for connection resilience.

    Bug Fix: Large batch updates would fail completely if connection dropped.
    Now commits periodically and continues on individual failures.
    """

    def test_tasks_batch_commits_incrementally(self):
        """
        Tasks batch update MUST commit every N items.
        """
        tasks_file = Path(__file__).parent.parent / "app" / "routers" / "tasks.py"
        source = tasks_file.read_text()

        # Find batch_update_tasks function
        assert "async def batch_update_tasks" in source

        batch_section = source.split("async def batch_update_tasks")[1]
        batch_section = batch_section.split("\n@router")[0]

        # Should have batch_size and periodic commits
        assert "batch_size" in batch_section, "Tasks batch update should define batch_size"
        assert "% batch_size" in batch_section, "Tasks batch update should commit every batch_size items"

    def test_tasks_batch_handles_individual_errors(self):
        """
        Tasks batch update MUST handle individual item failures.
        """
        tasks_file = Path(__file__).parent.parent / "app" / "routers" / "tasks.py"
        source = tasks_file.read_text()

        batch_section = source.split("async def batch_update_tasks")[1]
        batch_section = batch_section.split("\n@router")[0]

        # Should have try/except for individual items
        assert "errors = []" in batch_section or "errors.append" in batch_section, (
            "Tasks batch update should collect errors instead of failing entire batch"
        )

    def test_domains_batch_commits_per_item(self):
        """
        Domains batch update MUST commit after each item.

        Domains are fewer than tasks, so we commit each one individually.
        """
        domains_file = Path(__file__).parent.parent / "app" / "routers" / "domains.py"
        source = domains_file.read_text()

        batch_section = source.split("async def batch_update_domains")[1]
        batch_section = batch_section.split("\n@router")[0] if "\n@router" in batch_section else batch_section

        # Should commit within the loop
        assert "await db.commit()" in batch_section, "Domains batch update should commit per item"

        # Verify commit is inside the loop (indented more than function def)
        lines = batch_section.split("\n")
        commit_in_loop = False
        for line in lines:
            if "await db.commit()" in line and line.startswith("        "):  # 8+ spaces = inside loop
                commit_in_loop = True
                break
        assert commit_in_loop, "Domains batch update should commit inside the loop, not just at end"


# =============================================================================
# Logging Format Tests
# =============================================================================


class TestLoggingFormat:
    """
    Verify exception logging is clean and readable.

    Bug Fix: Error traces were too verbose with full SQLAlchemy internals.
    Now shows only app code frames with max limit.
    """

    def test_has_max_frames_limit(self):
        """
        Exception formatter MUST limit number of frames shown.
        """
        logging_file = Path(__file__).parent.parent / "app" / "logging_config.py"
        source = logging_file.read_text()

        assert "MAX_FRAMES" in source, "Exception formatter should have MAX_FRAMES limit"

    def test_filters_app_frames_only(self):
        """
        Exception formatter MUST filter to show only app code frames.
        """
        logging_file = Path(__file__).parent.parent / "app" / "logging_config.py"
        source = logging_file.read_text()

        assert '"/app/"' in source, "Exception formatter should filter for /app/ paths"
        assert '"/site-packages/"' in source, "Exception formatter should exclude /site-packages/ paths"

    def test_has_connection_error_handler(self):
        """
        Exception formatter MUST have special handling for connection errors.
        """
        logging_file = Path(__file__).parent.parent / "app" / "logging_config.py"
        source = logging_file.read_text()

        assert "ConnectionDoesNotExistError" in source or "connection was closed" in source, (
            "Exception formatter should detect connection errors"
        )
        assert "_format_connection_error" in source, (
            "Exception formatter should have special handler for connection errors"
        )
