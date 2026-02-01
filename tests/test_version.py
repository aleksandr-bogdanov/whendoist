"""
Version consistency tests.

Ensures version is correctly read from pyproject.toml (single source of truth).
"""

import tomllib
from pathlib import Path


def test_version_consistency():
    """Ensure app.__version__ correctly reads from pyproject.toml.

    The version is defined only in pyproject.toml. app/__init__.py reads it
    via importlib.metadata (installed) or tomllib (development mode).
    This test validates the reading mechanism works correctly.
    """
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
