"""
Whendoist - Task scheduling app.

WHEN do I do my tasks?
"""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("whendoist")
except PackageNotFoundError:
    # Development mode - read from pyproject.toml
    import tomllib
    from pathlib import Path

    pyproject_path = Path(__file__).parent.parent / "pyproject.toml"
    with open(pyproject_path, "rb") as f:
        __version__ = tomllib.load(f)["project"]["version"]
