"""
Build info and provenance API endpoints.

Provides endpoints for verifying the deployed code matches the GitHub source.
Part of the Code Provenance / Three Pillars system.
"""

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/build", tags=["build"])


def get_version_from_changelog() -> str:
    """Extract latest version from CHANGELOG.md."""
    changelog_path = Path(__file__).parent.parent.parent / "CHANGELOG.md"
    try:
        content = changelog_path.read_text()
        match = re.search(r"## \[(\d+\.\d+\.\d+)\]", content)
        if match:
            return f"v{match.group(1)}"
    except Exception:
        pass
    return "v0.0.0"


def get_git_commit() -> dict[str, str]:
    """Get current git commit info."""
    import subprocess

    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            text=True,
            cwd=Path(__file__).parent.parent.parent,
        ).strip()
        short = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            cwd=Path(__file__).parent.parent.parent,
        ).strip()
        return {"sha": sha, "short": short}
    except Exception:
        return {"sha": "unknown", "short": "unknown"}


def calculate_file_hash(filepath: Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()
    except Exception:
        return "error"


def load_build_manifest() -> dict[str, Any] | None:
    """Load build manifest from static folder if it exists."""
    manifest_path = (
        Path(__file__).parent.parent.parent / "static" / "build-manifest.json"
    )
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except Exception:
            pass
    return None


@router.get("/info")
async def get_build_info() -> JSONResponse:
    """
    Get build information for the running instance.

    Returns version, commit info, and build fingerprint.
    This allows users to verify the deployed code matches GitHub.
    """
    # Try to load pre-generated manifest (from CI/release build)
    manifest = load_build_manifest()

    if manifest:
        # Return info from manifest
        return JSONResponse(
            {
                "version": manifest.get("version", "unknown"),
                "commit": manifest.get("commit", {}),
                "build": manifest.get("build", {}),
                "repository": manifest.get("repository", {}),
                "source": "manifest",
                "verification_url": (
                    f"https://github.com/aleksandr-bogdanov/whendoist/releases/tag/"
                    f"{manifest.get('version', '')}"
                ),
            }
        )

    # Fall back to live calculation (development mode)
    version = get_version_from_changelog()
    commit = get_git_commit()

    # Calculate build hash from key files
    static_dir = Path(__file__).parent.parent.parent / "static"
    key_files = ["css/app.css", "css/dashboard.css", "js/crypto.js", "js/toast.js"]

    hashes = []
    for key_file in key_files:
        filepath = static_dir / key_file
        if filepath.exists():
            hashes.append(f"{key_file}:{calculate_file_hash(filepath)}")

    build_hash = hashlib.sha256("\n".join(hashes).encode()).hexdigest()[:16]

    return JSONResponse(
        {
            "version": version,
            "commit": commit,
            "build": {
                "hash": build_hash,
                "runner": "live",
                "environment": "development",
            },
            "repository": {
                "url": "https://github.com/aleksandr-bogdanov/whendoist",
            },
            "source": "live",
            "verification_url": f"https://github.com/aleksandr-bogdanov/whendoist/releases/tag/{version}",
        }
    )


@router.get("/hashes")
async def get_file_hashes() -> JSONResponse:
    """
    Get SHA256 hashes for all static files.

    Used for verification - users can compare these with locally computed hashes.
    """
    # Try to load from manifest first
    manifest = load_build_manifest()
    if manifest and "files" in manifest:
        return JSONResponse(
            {
                "source": "manifest",
                "files": manifest["files"],
                "sri": manifest.get("sri", {}),
            }
        )

    # Fall back to live calculation
    static_dir = Path(__file__).parent.parent.parent / "static"
    hashes = {}

    # Hash CSS files
    css_dir = static_dir / "css"
    if css_dir.exists():
        for css_file in css_dir.glob("*.css"):
            hashes[f"css/{css_file.name}"] = calculate_file_hash(css_file)

    # Hash JS files
    js_dir = static_dir / "js"
    if js_dir.exists():
        for js_file in js_dir.glob("*.js"):
            hashes[f"js/{js_file.name}"] = calculate_file_hash(js_file)

    return JSONResponse(
        {
            "source": "live",
            "files": hashes,
        }
    )


@router.get("/verify")
async def get_verification_info() -> JSONResponse:
    """
    Get comprehensive verification information.

    Returns everything needed for users to verify the deployed code:
    - Version and commit info
    - File hashes
    - Verification instructions
    - Links to GitHub release and attestations
    """
    manifest = load_build_manifest()
    version = manifest.get("version") if manifest else get_version_from_changelog()
    commit = manifest.get("commit") if manifest else get_git_commit()

    repo_url = "https://github.com/aleksandr-bogdanov/whendoist"

    return JSONResponse(
        {
            "version": version,
            "commit": commit,
            "build": manifest.get("build") if manifest else None,
            "verification": {
                "github_release": f"{repo_url}/releases/tag/{version}",
                "attestations": f"{repo_url}/attestations",
                "source_code": f"{repo_url}/tree/{version}",
                "instructions": [
                    f"1. Clone the repository: git clone {repo_url}",
                    f"2. Checkout this version: git checkout {version}",
                    "3. Generate hashes locally: sha256sum static/css/*.css static/js/*.js",
                    "4. Compare with the hashes shown below",
                ],
            },
            "hashes": manifest.get("files") if manifest else None,
            "sri": manifest.get("sri") if manifest else None,
        }
    )
