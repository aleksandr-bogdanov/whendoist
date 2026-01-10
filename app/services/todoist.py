"""
Todoist API v1 client.

Provides async access to tasks, projects, and labels via Todoist API v1.
"""

from dataclasses import dataclass
from datetime import date, datetime

import httpx

TODOIST_API_URL = "https://api.todoist.com/api/v1"


@dataclass
class TodoistDue:
    """Task due date/time information."""

    date: date
    datetime_: datetime | None = None
    is_recurring: bool = False
    string: str = ""


@dataclass
class TodoistTask:
    """Todoist task with all relevant properties."""

    id: str
    content: str
    description: str
    project_id: str
    labels: list[str]  # Label names (not IDs)
    due: TodoistDue | None
    duration_minutes: int | None
    priority: int  # 1=normal (P4), 4=urgent (P1)
    order: int
    parent_id: str | None  # None for top-level tasks, set for subtasks
    assignee_id: str | None  # None if unassigned, user ID if assigned


@dataclass
class TodoistProject:
    """Todoist project."""

    id: str
    name: str
    color: str
    order: int


@dataclass
class TodoistLabel:
    """Todoist label."""

    id: str
    name: str
    color: str


class TodoistClient:
    """
    Async Todoist API v1 client.

    Usage:
        async with TodoistClient(access_token) as client:
            tasks = await client.get_tasks()
    """

    def __init__(self, access_token: str):
        self.access_token = access_token
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "TodoistClient":
        self._client = httpx.AsyncClient(
            base_url=TODOIST_API_URL,
            headers={"Authorization": f"Bearer {self.access_token}"},
        )
        return self

    async def __aexit__(self, *args) -> None:
        if self._client:
            await self._client.aclose()

    def _ensure_client(self) -> httpx.AsyncClient:
        """Return the HTTP client, raising if not initialized."""
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with TodoistClient(...) as client:'")
        return self._client

    def _parse_due(self, due_data: dict | None) -> TodoistDue | None:
        """Parse due date from API response."""
        if not due_data:
            return None

        due_date_str = due_data.get("date", "")
        due_datetime_str = due_data.get("datetime")

        # Parse date
        if due_datetime_str:
            # Full datetime
            dt = datetime.fromisoformat(due_datetime_str.replace("Z", "+00:00"))
            return TodoistDue(
                date=dt.date(),
                datetime_=dt,
                is_recurring=due_data.get("is_recurring", False),
                string=due_data.get("string", ""),
            )
        elif due_date_str:
            # Date only
            d = date.fromisoformat(due_date_str)
            return TodoistDue(
                date=d,
                datetime_=None,
                is_recurring=due_data.get("is_recurring", False),
                string=due_data.get("string", ""),
            )
        return None

    def _parse_task(self, data: dict) -> TodoistTask:
        """Parse task from API response."""
        duration = data.get("duration")
        duration_minutes = None
        if duration:
            amount = duration.get("amount", 0)
            unit = duration.get("unit", "minute")
            if unit == "minute":
                duration_minutes = amount
            elif unit == "day":
                duration_minutes = amount * 24 * 60

        return TodoistTask(
            id=data["id"],
            content=data["content"],
            description=data.get("description", ""),
            project_id=data["project_id"],
            labels=data.get("labels", []),  # v1 returns label names directly
            due=self._parse_due(data.get("due")),
            duration_minutes=duration_minutes,
            priority=data.get("priority", 1),
            order=data.get("child_order", 0),  # v1 uses child_order
            parent_id=data.get("parent_id"),
            assignee_id=data.get("responsible_uid"),  # v1 uses responsible_uid
        )

    async def get_tasks(self, project_id: str | None = None) -> list[TodoistTask]:
        """Fetch active tasks with optional project filter."""
        client = self._ensure_client()
        all_tasks: list[TodoistTask] = []
        cursor: str | None = None

        while True:
            params: dict[str, str | int] = {"limit": 100}
            if project_id:
                params["project_id"] = project_id
            if cursor:
                params["cursor"] = cursor

            response = await client.get("/tasks", params=params)
            response.raise_for_status()
            data = response.json()

            results = data.get("results", [])
            all_tasks.extend(self._parse_task(t) for t in results)

            cursor = data.get("next_cursor")
            if not cursor:
                break

        return all_tasks

    async def get_all_tasks(self) -> list[TodoistTask]:
        """Fetch all active tasks across all projects."""
        return await self.get_tasks()

    async def get_projects(self) -> list[TodoistProject]:
        """Fetch all projects."""
        client = self._ensure_client()
        all_projects: list[TodoistProject] = []
        cursor: str | None = None

        while True:
            params: dict[str, str | int] = {"limit": 100}
            if cursor:
                params["cursor"] = cursor

            response = await client.get("/projects", params=params)
            response.raise_for_status()
            data = response.json()

            for p in data.get("results", []):
                all_projects.append(
                    TodoistProject(
                        id=p["id"],
                        name=p["name"],
                        color=p.get("color", "grey"),
                        order=p.get("child_order", 0),
                    )
                )

            cursor = data.get("next_cursor")
            if not cursor:
                break

        return all_projects

    async def get_labels(self) -> list[TodoistLabel]:
        """Fetch all labels."""
        client = self._ensure_client()
        all_labels: list[TodoistLabel] = []
        cursor: str | None = None

        while True:
            params: dict[str, str | int] = {"limit": 100}
            if cursor:
                params["cursor"] = cursor

            response = await client.get("/labels", params=params)
            response.raise_for_status()
            data = response.json()

            for label in data.get("results", []):
                all_labels.append(
                    TodoistLabel(
                        id=label["id"],
                        name=label["name"],
                        color=label.get("color", "grey"),
                    )
                )

            cursor = data.get("next_cursor")
            if not cursor:
                break

        return all_labels

    async def get_current_user_id(self) -> str:
        """Get the current user's ID using the Sync API."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.todoist.com/sync/v9/sync",
                headers={"Authorization": f"Bearer {self.access_token}"},
                json={"sync_token": "*", "resource_types": ["user"]},
            )
            response.raise_for_status()
            return response.json()["user"]["id"]

    async def get_completed_tasks(self, limit: int = 200) -> list[dict]:
        """
        Fetch completed tasks.

        Returns raw dicts since completed tasks have different structure.
        Paginates automatically up to limit.
        """
        client = self._ensure_client()
        all_items: list[dict] = []
        offset = 0
        page_size = 50  # API max per request

        while len(all_items) < limit:
            response = await client.get(
                "/tasks/completed",
                params={
                    "limit": min(page_size, limit - len(all_items)),
                    "offset": offset,
                },
            )
            response.raise_for_status()
            data = response.json()
            items = data.get("items", [])
            all_items.extend(items)

            if not data.get("has_more", False) or not items:
                break
            offset += len(items)

        return all_items

    async def update_task(
        self,
        task_id: str,
        due_datetime: datetime | None = None,
        duration_minutes: int | None = None,
    ) -> TodoistTask:
        """
        Update a task's due datetime and/or duration.

        Args:
            task_id: Todoist task ID
            due_datetime: Datetime with timezone
            duration_minutes: Duration in minutes

        Returns:
            Updated TodoistTask

        Raises:
            Exception: On API errors
        """
        payload = {}

        if due_datetime is not None:
            payload["due_datetime"] = due_datetime.isoformat()

        if duration_minutes is not None:
            payload["duration"] = duration_minutes
            payload["duration_unit"] = "minute"

        client = self._ensure_client()
        response = await client.post(f"/tasks/{task_id}", json=payload)

        if response.status_code >= 400:
            error_body = response.text
            raise Exception(f"Todoist API error {response.status_code}: {error_body}. Payload was: {payload}")

        return self._parse_task(response.json())
