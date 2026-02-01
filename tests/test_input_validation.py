"""
Input validation tests.

Tests for Pydantic validators that enforce:
- Max length constraints on user input
- Empty string rejection
- Control character stripping

v0.20.0: Input Validation
"""

import pytest
from pydantic import ValidationError

from app.constants import (
    DOMAIN_NAME_MAX_LENGTH,
    TASK_DESCRIPTION_MAX_LENGTH,
    TASK_TITLE_MAX_LENGTH,
)
from app.routers.domains import DomainCreate, DomainUpdate
from app.routers.tasks import TaskCreate, TaskUpdate
from app.services.backup_service import BackupDomainSchema, BackupTaskSchema


class TestTaskTitleValidation:
    """Test task title validation."""

    def test_valid_title_accepted(self):
        """Normal title should be accepted."""
        task = TaskCreate(title="Buy groceries")
        assert task.title == "Buy groceries"

    def test_title_whitespace_stripped(self):
        """Whitespace should be stripped from title."""
        task = TaskCreate(title="  Buy groceries  ")
        assert task.title == "Buy groceries"

    def test_empty_title_rejected(self):
        """Empty title should be rejected."""
        with pytest.raises(ValidationError, match="Title cannot be empty"):
            TaskCreate(title="")

    def test_whitespace_only_title_rejected(self):
        """Whitespace-only title should be rejected."""
        with pytest.raises(ValidationError, match="Title cannot be empty"):
            TaskCreate(title="   ")

    def test_max_length_title_accepted(self):
        """Title at max length should be accepted."""
        title = "a" * TASK_TITLE_MAX_LENGTH
        task = TaskCreate(title=title)
        assert len(task.title) == TASK_TITLE_MAX_LENGTH

    def test_over_max_length_title_rejected(self):
        """Title over max length should be rejected."""
        title = "a" * (TASK_TITLE_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {TASK_TITLE_MAX_LENGTH}"):
            TaskCreate(title=title)

    def test_control_characters_stripped_from_title(self):
        """Control characters (except \\n and \\t) should be stripped."""
        # \x00 (null), \x07 (bell), \x1f (unit separator) should be removed
        task = TaskCreate(title="Buy\x00 groc\x07eries\x1f")
        assert task.title == "Buy groceries"

    def test_newline_preserved_in_title(self):
        """Newlines should be preserved in title."""
        task = TaskCreate(title="Buy\ngroceries")
        assert task.title == "Buy\ngroceries"

    def test_tab_preserved_in_title(self):
        """Tabs should be preserved in title."""
        task = TaskCreate(title="Buy\tgroceries")
        assert task.title == "Buy\tgroceries"


class TestTaskDescriptionValidation:
    """Test task description validation."""

    def test_valid_description_accepted(self):
        """Normal description should be accepted."""
        task = TaskCreate(title="Task", description="This is a description")
        assert task.description == "This is a description"

    def test_null_description_accepted(self):
        """Null description should be accepted."""
        task = TaskCreate(title="Task", description=None)
        assert task.description is None

    def test_max_length_description_accepted(self):
        """Description at max length should be accepted."""
        description = "a" * TASK_DESCRIPTION_MAX_LENGTH
        task = TaskCreate(title="Task", description=description)
        assert len(task.description) == TASK_DESCRIPTION_MAX_LENGTH

    def test_over_max_length_description_rejected(self):
        """Description over max length should be rejected."""
        description = "a" * (TASK_DESCRIPTION_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {TASK_DESCRIPTION_MAX_LENGTH}"):
            TaskCreate(title="Task", description=description)

    def test_control_characters_stripped_from_description(self):
        """Control characters (except \\n and \\t) should be stripped."""
        task = TaskCreate(title="Task", description="Line 1\x00\x07\x1fLine 2")
        assert task.description == "Line 1Line 2"

    def test_newline_preserved_in_description(self):
        """Newlines should be preserved in description."""
        task = TaskCreate(title="Task", description="Line 1\nLine 2")
        assert task.description == "Line 1\nLine 2"


class TestTaskUpdateValidation:
    """Test TaskUpdate schema validation."""

    def test_null_title_in_update_accepted(self):
        """Null title in update (no change) should be accepted."""
        update = TaskUpdate(title=None)
        assert update.title is None

    def test_empty_title_in_update_rejected(self):
        """Empty title in update should be rejected."""
        with pytest.raises(ValidationError, match="Title cannot be empty"):
            TaskUpdate(title="")

    def test_over_max_length_title_in_update_rejected(self):
        """Title over max length in update should be rejected."""
        title = "a" * (TASK_TITLE_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {TASK_TITLE_MAX_LENGTH}"):
            TaskUpdate(title=title)


class TestDomainNameValidation:
    """Test domain name validation."""

    def test_valid_name_accepted(self):
        """Normal domain name should be accepted."""
        domain = DomainCreate(name="Work")
        assert domain.name == "Work"

    def test_name_whitespace_stripped(self):
        """Whitespace should be stripped from name."""
        domain = DomainCreate(name="  Work  ")
        assert domain.name == "Work"

    def test_empty_name_rejected(self):
        """Empty name should be rejected."""
        with pytest.raises(ValidationError, match="Name cannot be empty"):
            DomainCreate(name="")

    def test_whitespace_only_name_rejected(self):
        """Whitespace-only name should be rejected."""
        with pytest.raises(ValidationError, match="Name cannot be empty"):
            DomainCreate(name="   ")

    def test_max_length_name_accepted(self):
        """Name at max length should be accepted."""
        name = "a" * DOMAIN_NAME_MAX_LENGTH
        domain = DomainCreate(name=name)
        assert len(domain.name) == DOMAIN_NAME_MAX_LENGTH

    def test_over_max_length_name_rejected(self):
        """Name over max length should be rejected."""
        name = "a" * (DOMAIN_NAME_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {DOMAIN_NAME_MAX_LENGTH}"):
            DomainCreate(name=name)

    def test_control_characters_stripped_from_name(self):
        """Control characters (except \\n and \\t) should be stripped."""
        domain = DomainCreate(name="Work\x00\x07\x1fProjects")
        assert domain.name == "WorkProjects"


class TestDomainUpdateValidation:
    """Test DomainUpdate schema validation."""

    def test_null_name_in_update_accepted(self):
        """Null name in update (no change) should be accepted."""
        update = DomainUpdate(name=None)
        assert update.name is None

    def test_empty_name_in_update_rejected(self):
        """Empty name in update should be rejected."""
        with pytest.raises(ValidationError, match="Name cannot be empty"):
            DomainUpdate(name="")

    def test_over_max_length_name_in_update_rejected(self):
        """Name over max length in update should be rejected."""
        name = "a" * (DOMAIN_NAME_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {DOMAIN_NAME_MAX_LENGTH}"):
            DomainUpdate(name=name)


class TestBackupSchemaValidation:
    """Test backup schema validation includes input limits."""

    def test_backup_task_title_max_length(self):
        """Backup task title should enforce max length."""
        title = "a" * (TASK_TITLE_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {TASK_TITLE_MAX_LENGTH}"):
            BackupTaskSchema(title=title)

    def test_backup_task_description_max_length(self):
        """Backup task description should enforce max length."""
        description = "a" * (TASK_DESCRIPTION_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {TASK_DESCRIPTION_MAX_LENGTH}"):
            BackupTaskSchema(title="Valid", description=description)

    def test_backup_domain_name_max_length(self):
        """Backup domain name should enforce max length."""
        name = "a" * (DOMAIN_NAME_MAX_LENGTH + 1)
        with pytest.raises(ValidationError, match=f"cannot exceed {DOMAIN_NAME_MAX_LENGTH}"):
            BackupDomainSchema(name=name)

    def test_backup_task_control_chars_stripped(self):
        """Backup task should strip control characters."""
        task = BackupTaskSchema(title="Buy\x00groceries")
        assert task.title == "Buygroceries"

    def test_backup_domain_control_chars_stripped(self):
        """Backup domain should strip control characters."""
        domain = BackupDomainSchema(name="Work\x00Projects")
        assert domain.name == "WorkProjects"
