"""
Hotfix v0.8.13 Tests - Recurring Task Completion + Passkey RPID.

These tests verify fixes for:
1. Recurring task completion showing wrong state
2. Passkey RPID not matching production domain (derived from BASE_URL)

Test Category: Contract + Unit
Related Issues:
- Complete button didn't reflect today's instance state for recurring tasks
- Passkeys failed on iPhone Chrome with "RPID did not match origin" error

See tests/README.md for full test architecture.
"""

from datetime import date
from pathlib import Path
from unittest.mock import MagicMock

# =============================================================================
# Recurring Task Completion Contract Tests
# =============================================================================


class TestRecurringTaskCompletionContract:
    """
    Verify TaskResponse includes today_instance_completed for recurring tasks.

    Bug Fix: The Edit Task dialog's Complete button always showed "Complete"
    for recurring tasks, even after completing today's instance. This happened
    because TaskResponse didn't include instance state.

    Solution: Add today_instance_completed field to TaskResponse that checks
    if today's instance is completed.
    """

    def test_task_response_has_today_instance_completed_field(self):
        """
        TaskResponse MUST have today_instance_completed field.
        """
        tasks_file = Path(__file__).parent.parent / "app" / "routers" / "tasks.py"
        source = tasks_file.read_text()

        assert "today_instance_completed" in source, (
            "TaskResponse must have today_instance_completed field. "
            "Without this, dialog can't show correct state for recurring tasks."
        )

    def test_task_to_response_checks_instances(self):
        """
        _task_to_response MUST check task.instances for today's date.
        """
        tasks_file = Path(__file__).parent.parent / "app" / "routers" / "tasks.py"
        source = tasks_file.read_text()

        # Find the _task_to_response function
        assert "def _task_to_response" in source

        # Get the function body
        func_start = source.index("def _task_to_response")
        func_section = source[func_start : func_start + 2000]

        # Should check if task is recurring
        assert "is_recurring" in func_section, "_task_to_response must check if task is recurring"

        # Should check instances
        assert "instances" in func_section, "_task_to_response must check task.instances for today's instance"

        # Should check instance_date against today
        assert "instance_date" in func_section or "today()" in func_section, (
            "_task_to_response must compare instance date to today"
        )

    def test_today_instance_completed_is_bool_or_none(self):
        """
        today_instance_completed should be bool | None type.
        """
        tasks_file = Path(__file__).parent.parent / "app" / "routers" / "tasks.py"
        source = tasks_file.read_text()

        # Should have proper type annotation
        assert "today_instance_completed: bool | None" in source, (
            "today_instance_completed should be typed as bool | None. None means no instance exists for today."
        )


# =============================================================================
# Passkey RPID Derivation Tests
# =============================================================================


class TestPasskeyRPIDDerivation:
    """
    Verify passkey_rp_id is derived from base_url when not explicitly set.

    Bug Fix: On iPhone Chrome, passkey registration failed with
    "The requested RPID did not match the origin or related origins".
    This happened because passkey_rp_id defaulted to "localhost" in production.

    Solution: Derive passkey_rp_id from base_url hostname automatically.
    """

    def test_config_has_model_validator_for_rp_id(self):
        """
        Config MUST have model_validator to derive passkey_rp_id.
        """
        config_file = Path(__file__).parent.parent / "app" / "config.py"
        source = config_file.read_text()

        assert "model_validator" in source, "config.py must use model_validator to derive passkey_rp_id"

        assert "derive_passkey_rp_id" in source or "passkey_rp_id" in source, (
            "Config must have logic to derive passkey_rp_id from base_url"
        )

    def test_uses_urlparse_for_hostname(self):
        """
        Config MUST use urlparse to extract hostname from base_url.
        """
        config_file = Path(__file__).parent.parent / "app" / "config.py"
        source = config_file.read_text()

        assert "urlparse" in source, "Config must import urlparse to extract hostname from URL"

        assert "hostname" in source, "Config must use parsed.hostname for RP ID (not netloc which includes port)"

    def test_default_rp_id_is_empty(self):
        """
        Default passkey_rp_id should be empty string to trigger derivation.
        """
        config_file = Path(__file__).parent.parent / "app" / "config.py"
        source = config_file.read_text()

        # Should have empty default (not "localhost")
        assert 'passkey_rp_id: str = ""' in source or "passkey_rp_id: str = ''" in source, (
            "passkey_rp_id default should be empty string. This triggers automatic derivation from base_url."
        )

    def test_rp_id_derivation_logic(self):
        """
        Test the actual derivation logic works correctly.
        """
        from app.config import Settings

        # Test with localhost
        settings = Settings(base_url="http://localhost:8000", passkey_rp_id="")
        assert settings.passkey_rp_id == "localhost"

        # Test with production domain
        settings = Settings(base_url="https://whendoist.up.railway.app", passkey_rp_id="")
        assert settings.passkey_rp_id == "whendoist.up.railway.app"

        # Test with custom domain
        settings = Settings(base_url="https://app.example.com", passkey_rp_id="")
        assert settings.passkey_rp_id == "app.example.com"

    def test_explicit_rp_id_not_overwritten(self):
        """
        Explicitly set passkey_rp_id should NOT be overwritten.
        """
        from app.config import Settings

        settings = Settings(base_url="https://whendoist.up.railway.app", passkey_rp_id="custom-rp-id")
        assert settings.passkey_rp_id == "custom-rp-id", (
            "Explicitly set passkey_rp_id should not be overwritten by derivation"
        )


# =============================================================================
# Integration Test: TaskResponse with Instances
# =============================================================================


def _create_mock_task(is_recurring: bool = False, instances: list | None = None):
    """Create a properly mocked task object for testing."""
    task = MagicMock()
    task.id = 1
    task.title = "Test Task"
    task.description = None
    task.domain_id = None
    task.domain = None
    task.parent_id = None
    task.duration_minutes = 30
    task.impact = 2
    task.clarity = "normal"
    task.due_date = None
    task.due_time = None
    task.scheduled_date = None
    task.scheduled_time = None
    task.is_recurring = is_recurring
    task.recurrence_rule = None
    task.recurrence_start = None
    task.recurrence_end = None
    task.status = "pending"
    task.position = 1
    task.created_at = None
    task.completed_at = None
    task.subtasks = []
    task.instances = instances or []
    return task


class TestTaskResponseWithInstances:
    """
    Test that _task_to_response correctly populates today_instance_completed.
    """

    def test_task_without_instances_has_none(self):
        """
        Non-recurring task should have today_instance_completed = None.
        """
        from app.routers.tasks import _task_to_response

        task = _create_mock_task(is_recurring=False)
        response = _task_to_response(task)
        assert response.today_instance_completed is None

    def test_recurring_task_with_completed_today_instance(self):
        """
        Recurring task with completed instance for today should return True.
        """
        from app.routers.tasks import _task_to_response

        # Create mock instance for today
        today_instance = MagicMock()
        today_instance.instance_date = date.today()
        today_instance.status = "completed"

        task = _create_mock_task(is_recurring=True, instances=[today_instance])
        response = _task_to_response(task)
        assert response.today_instance_completed is True

    def test_recurring_task_with_pending_today_instance(self):
        """
        Recurring task with pending instance for today should return False.
        """
        from app.routers.tasks import _task_to_response

        # Create mock instance for today
        today_instance = MagicMock()
        today_instance.instance_date = date.today()
        today_instance.status = "pending"

        task = _create_mock_task(is_recurring=True, instances=[today_instance])
        response = _task_to_response(task)
        assert response.today_instance_completed is False

    def test_recurring_task_without_today_instance(self):
        """
        Recurring task without instance for today should return None.
        """
        from datetime import timedelta

        from app.routers.tasks import _task_to_response

        # Create mock instance for yesterday
        yesterday_instance = MagicMock()
        yesterday_instance.instance_date = date.today() - timedelta(days=1)
        yesterday_instance.status = "completed"

        task = _create_mock_task(is_recurring=True, instances=[yesterday_instance])
        response = _task_to_response(task)
        assert response.today_instance_completed is None
