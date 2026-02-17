"""
Todoist import service tests.

Unit tests using SQLite for fast, isolated testing of import logic.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.todoist import TodoistTask
from app.services.todoist_import import ImportResult, TodoistImportService


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(email="import-test@example.com", name="Import Test User")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def import_service(db_session: AsyncSession, test_user: User) -> TodoistImportService:
    """Create import service (token unused — we call internal methods directly)."""
    return TodoistImportService(db_session, test_user.id, todoist_token="unused")


def _make_task(
    id: str,
    content: str = "Task",
    parent_id: str | None = None,
    project_id: str = "proj1",
    is_recurring: bool = False,
    recurrence_string: str = "",
) -> TodoistTask:
    """Helper to build a TodoistTask for testing."""
    from app.services.todoist import TodoistDue

    due = None
    if is_recurring:
        from datetime import date

        due = TodoistDue(date=date(2026, 1, 1), is_recurring=True, string=recurrence_string or "every day")

    return TodoistTask(
        id=id,
        content=content,
        description="",
        project_id=project_id,
        labels=[],
        due=due,
        duration_minutes=None,
        priority=1,
        order=1,
        parent_id=parent_id,
        assignee_id=None,
    )


@pytest.mark.unit
class TestTodoistImportFlattening:
    """Test that Todoist import flattens deep nesting to depth-1."""

    async def test_import_flattens_deep_nesting(
        self, db_session: AsyncSession, import_service: TodoistImportService, test_user: User
    ):
        """Grandchildren are remapped to be direct children of root ancestor."""
        # Create 3-level hierarchy: A -> B -> C
        tasks = [
            _make_task("A", "Root Parent"),
            _make_task("B", "Child", parent_id="A"),
            _make_task("C", "Grandchild", parent_id="B"),
        ]

        domain_map: dict[str, int] = {}  # No domain mapping needed
        result = ImportResult()

        await import_service._import_tasks(tasks, domain_map, result, skip_existing=True)
        await db_session.commit()

        # Verify all 3 tasks were created
        assert result.tasks_created == 3

        # Fetch tasks from DB
        from sqlalchemy import select

        from app.models import Task

        all_tasks = (
            (await db_session.execute(select(Task).where(Task.user_id == test_user.id).order_by(Task.external_id)))
            .scalars()
            .all()
        )

        tasks_by_ext_id = {t.external_id: t for t in all_tasks}

        # A is top-level
        assert tasks_by_ext_id["A"].parent_id is None
        # B is child of A
        assert tasks_by_ext_id["B"].parent_id == tasks_by_ext_id["A"].id
        # C is ALSO child of A (flattened from grandchild)
        assert tasks_by_ext_id["C"].parent_id == tasks_by_ext_id["A"].id

    async def test_import_flattens_4_levels(
        self, db_session: AsyncSession, import_service: TodoistImportService, test_user: User
    ):
        """4-level hierarchy is flattened: great-grandchildren become direct children."""
        tasks = [
            _make_task("A", "Root"),
            _make_task("B", "Child", parent_id="A"),
            _make_task("C", "Grandchild", parent_id="B"),
            _make_task("D", "Great-grandchild", parent_id="C"),
        ]

        result = ImportResult()
        await import_service._import_tasks(tasks, {}, result, skip_existing=True)
        await db_session.commit()

        from sqlalchemy import select

        from app.models import Task

        all_tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        tasks_by_ext_id = {t.external_id: t for t in all_tasks}
        root_id = tasks_by_ext_id["A"].id

        # All descendants are direct children of root
        assert tasks_by_ext_id["B"].parent_id == root_id
        assert tasks_by_ext_id["C"].parent_id == root_id
        assert tasks_by_ext_id["D"].parent_id == root_id

    async def test_import_strips_parent_recurrence(
        self, db_session: AsyncSession, import_service: TodoistImportService, test_user: User
    ):
        """Tasks with children have their recurrence stripped during import."""
        tasks = [
            _make_task("A", "Recurring Parent", is_recurring=True, recurrence_string="every day"),
            _make_task("B", "Child", parent_id="A"),
        ]

        result = ImportResult()
        await import_service._import_tasks(tasks, {}, result, skip_existing=True)
        await db_session.commit()

        from sqlalchemy import select

        from app.models import Task

        all_tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        tasks_by_ext_id = {t.external_id: t for t in all_tasks}

        # Parent's recurrence is stripped
        assert tasks_by_ext_id["A"].is_recurring is False
        assert tasks_by_ext_id["A"].recurrence_rule is None

    async def test_import_preserves_subtask_recurrence(
        self, db_session: AsyncSession, import_service: TodoistImportService, test_user: User
    ):
        """Subtask recurrence is preserved — only parents lose recurrence."""
        tasks = [
            _make_task("A", "Parent"),
            _make_task("B", "Recurring Subtask", parent_id="A", is_recurring=True, recurrence_string="every week"),
        ]

        result = ImportResult()
        await import_service._import_tasks(tasks, {}, result, skip_existing=True)
        await db_session.commit()

        from sqlalchemy import select

        from app.models import Task

        all_tasks = (await db_session.execute(select(Task).where(Task.user_id == test_user.id))).scalars().all()
        tasks_by_ext_id = {t.external_id: t for t in all_tasks}

        # Subtask keeps its recurrence
        assert tasks_by_ext_id["B"].is_recurring is True
        assert tasks_by_ext_id["B"].recurrence_rule is not None
