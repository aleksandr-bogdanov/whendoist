"""
Build info API endpoint.

Provides version and commit info for the settings footer.
"""

import os
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import __version__
from app.config import get_settings

router = APIRouter(prefix="/build", tags=["build"])


def get_version() -> str:
    """Get canonical version from app.__version__."""
    version = __version__
    return version if version.startswith("v") else f"v{version}"


def get_git_commit() -> dict[str, str]:
    """
    Get current git commit info.

    Checks CI/deployment environment variables first, falls back to git command.
    """
    env_vars = [
        "RAILWAY_GIT_COMMIT_SHA",
        "GITHUB_SHA",
        "COMMIT_SHA",
    ]

    for var in env_vars:
        sha = os.environ.get(var)
        if sha:
            return {"sha": sha, "short": sha[:7]}

    import subprocess

    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            cwd=Path(__file__).parent.parent.parent,
        ).strip()
        short = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            cwd=Path(__file__).parent.parent.parent,
        ).strip()
        return {"sha": sha, "short": short}
    except Exception:
        return {"sha": "unknown", "short": "unknown"}


@router.get("/info")
async def get_build_info() -> JSONResponse:
    """Return version and commit info for the running instance."""
    return JSONResponse(
        {
            "version": get_version(),
            "commit": get_git_commit(),
            "demo_login_enabled": get_settings().demo_login_enabled,
            "repository": {
                "url": "https://github.com/aleksandr-bogdanov/whendoist",
            },
        }
    )
