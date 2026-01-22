"""
Version consistency tests.

Ensures all version references match across the codebase.
"""

import tomllib
from pathlib import Path


def test_version_consistency():
    """Ensure app/__init__.py and pyproject.toml versions match."""
    from app import __version__

    with open(Path("pyproject.toml"), "rb") as f:
        pyproject = tomllib.load(f)

    assert __version__ == pyproject["project"]["version"], (
        f"Version mismatch: app.__version__={__version__}, pyproject.toml={pyproject['project']['version']}"
    )


def test_version_format():
    """Ensure version follows semver format."""
    from app import __version__

    parts = __version__.split(".")
    assert len(parts) == 3, f"Version should have 3 parts: {__version__}"

    for part in parts:
        assert part.isdigit(), f"Version parts should be numeric: {__version__}"


def test_fastapi_version_matches():
    """Ensure FastAPI app version matches __version__."""
    from app import __version__
    from app.main import app

    assert app.version == __version__, f"FastAPI version mismatch: app.version={app.version}, __version__={__version__}"
