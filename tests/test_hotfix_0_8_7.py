"""
Hotfix v0.8.7 Tests - Connection Resilience + Logging.

These tests verify fixes for:
1. Database connection resilience during batch updates
2. Cleaner error logging format

Test Category: Contract + Unit
Related Issues:
- Import freezing due to connection drops
- Verbose error traces in logs

See tests/README.md for full test architecture.
"""

from pathlib import Path

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
