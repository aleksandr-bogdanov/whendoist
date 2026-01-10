"""
Task editor routes.

Provides page routes for task creation and editing with sheet/full-page support.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import require_user
from app.services.task_service import TaskService

router = APIRouter(tags=["task-editor"])
templates = Jinja2Templates(directory="app/templates")


def is_htmx(request: Request) -> bool:
    """Check if request is from HTMX."""
    return request.headers.get("HX-Request") == "true"


def sheet_nav_mode(request: Request) -> str:
    """Get the sheet navigation mode from client header."""
    return request.headers.get("X-Whendoist-Sheet-Nav", "push")


def apply_htmx_url_headers(request: Request, response, url: str) -> None:
    """Apply HX-Push-Url or HX-Replace-Url based on navigation mode."""
    if not is_htmx(request):
        return
    if sheet_nav_mode(request) == "replace":
        response.headers["HX-Replace-Url"] = url
    else:
        response.headers["HX-Push-Url"] = url


@router.get("/tasks/new", response_class=HTMLResponse)
async def task_new(
    request: Request,
    domain_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
):
    """New task editor - sheet for HTMX, full page for direct hit."""
    service = TaskService(db, user.id)
    domains = await service.get_domains()

    template = "tasks/_task_sheet.html" if is_htmx(request) else "tasks/task_editor_page.html"
    resp = templates.TemplateResponse(
        template,
        {
            "request": request,
            "user": user,
            "task": None,
            "mode": "create",
            "domains": domains,
            "prefill_domain_id": domain_id,
            "errors": {},
        },
    )
    url = "/tasks/new" + (f"?domain_id={domain_id}" if domain_id else "")
    apply_htmx_url_headers(request, resp, url)
    return resp


@router.get("/tasks/{task_id}", response_class=HTMLResponse)
async def task_edit(
    task_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
):
    """Edit task editor - sheet for HTMX, full page for direct hit."""
    service = TaskService(db, user.id)
    task = await service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    domains = await service.get_domains()

    template = "tasks/_task_sheet.html" if is_htmx(request) else "tasks/task_editor_page.html"
    resp = templates.TemplateResponse(
        template,
        {
            "request": request,
            "user": user,
            "task": task,
            "mode": "edit",
            "domains": domains,
            "prefill_domain_id": None,
            "errors": {},
        },
    )
    apply_htmx_url_headers(request, resp, f"/tasks/{task_id}")
    return resp
