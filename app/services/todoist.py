"""
Todoist REST API client.

Provides async access to tasks, projects, and labels via Todoist REST API v2.
"""

from dataclasses import dataclass
from datetime import date, datetime

import httpx

TODOIST_API_URL = "https://api.todoist.com/rest/v2"


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
    labels: list[str]
    due: TodoistDue | None
    duration_minutes: int | None
    priority: int  # 1=normal, 4=urgent (Todoist uses inverted priority)
    order: int
    url: str
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
    Async Todoist API client.

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
        else:
            # Date only
            d = date.fromisoformat(due_date_str)
            return TodoistDue(
                date=d,
                datetime_=None,
                is_recurring=due_data.get("is_recurring", False),
                string=due_data.get("string", ""),
            )

    def _parse_task(self, data: dict) -> TodoistTask:
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
            labels=data.get("labels", []),
            due=self._parse_due(data.get("due")),
            duration_minutes=duration_minutes,
            priority=data.get("priority", 1),
            order=data.get("order", 0),
            url=data.get("url", ""),
            parent_id=data.get("parent_id"),
            assignee_id=data.get("assignee_id"),
        )

    async def get_tasks(self, project_id: str | None = None) -> list[TodoistTask]:
        """Fetch all active tasks, with optional project filter."""
        client = self._ensure_client()
        params = {}
        if project_id:
            params["project_id"] = project_id

        response = await client.get("/tasks", params=params)
        response.raise_for_status()
        return [self._parse_task(t) for t in response.json()]

    async def get_all_tasks(self) -> list[TodoistTask]:
        """Fetch all active tasks by querying each project to avoid API limits."""
        projects = await self.get_projects()
        all_tasks = []

        for project in projects:
            project_tasks = await self.get_tasks(project_id=project.id)
            all_tasks.extend(project_tasks)

        return all_tasks

    async def get_projects(self) -> list[TodoistProject]:
        """Fetch all projects."""
        client = self._ensure_client()
        response = await client.get("/projects")
        response.raise_for_status()
        return [
            TodoistProject(
                id=p["id"],
                name=p["name"],
                color=p.get("color", "grey"),
                order=p.get("order", 0),
            )
            for p in response.json()
        ]

    async def get_labels(self) -> list[TodoistLabel]:
        """Fetch all labels."""
        client = self._ensure_client()
        response = await client.get("/labels")
        response.raise_for_status()
        return [
            TodoistLabel(
                id=label["id"],
                name=label["name"],
                color=label.get("color", "grey"),
            )
            for label in response.json()
        ]

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
            due_datetime: Datetime with timezone (will be converted to Z format)
            duration_minutes: Duration in minutes

        Returns:
            Updated TodoistTask

        Raises:
            httpx.HTTPStatusError: On API errors
        """
        payload = {}

        if due_datetime is not None:
            # Format as ISO 8601 (Todoist accepts timezone-aware datetimes)
            payload["due_datetime"] = due_datetime.isoformat()

        if duration_minutes is not None:
            payload["duration"] = duration_minutes
            payload["duration_unit"] = "minute"

        client = self._ensure_client()
        response = await client.post(f"/tasks/{task_id}", json=payload)

        # Log detailed error info before raising
        if response.status_code >= 400:
            error_body = response.text
            raise Exception(f"Todoist API error {response.status_code}: {error_body}. Payload was: {payload}")

        return self._parse_task(response.json())
