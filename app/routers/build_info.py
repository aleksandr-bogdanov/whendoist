"""
Build info and provenance API endpoints.

Provides endpoints for verifying the deployed code matches the GitHub source.
Part of the Code Provenance / Three Pillars system.
"""

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import __version__

router = APIRouter(prefix="/build", tags=["build"])


def get_version() -> str:
    """Get canonical version from app.__version__."""
    # Always use app.__version__ as the single source of truth
    version = __version__
    # Ensure it has 'v' prefix for consistency
    return version if version.startswith("v") else f"v{version}"


def get_git_commit() -> dict[str, str]:
    """
    Get current git commit info.

    Checks multiple sources in order of priority:
    1. CI/deployment environment variables (Railway, GitHub Actions, etc.)
    2. Git command (local development)
    3. Falls back to "unknown" if neither available
    """
    # Check CI/deployment environment variables first
    # These are set by various platforms during deployment
    env_vars = [
        "RAILWAY_GIT_COMMIT_SHA",  # Railway
        "GITHUB_SHA",  # GitHub Actions
        "VERCEL_GIT_COMMIT_SHA",  # Vercel
        "RENDER_GIT_COMMIT",  # Render
        "SOURCE_VERSION",  # Heroku
        "COMMIT_SHA",  # Generic fallback
    ]

    for var in env_vars:
        sha = os.environ.get(var)
        if sha:
            return {"sha": sha, "short": sha[:7]}

    # Fall back to git command (local development)
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
    manifest_path = Path(__file__).parent.parent.parent / "static" / "build-manifest.json"
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
                    f"https://github.com/aleksandr-bogdanov/whendoist/releases/tag/{manifest.get('version', '')}"
                ),
            }
        )

    # Fall back to live calculation (development/production without manifest)
    version = get_version()
    commit = get_git_commit()
    hashes = calculate_live_hashes()
    build_hash = calculate_build_hash(hashes)

    return JSONResponse(
        {
            "version": version,
            "commit": commit,
            "build": {
                "hash": build_hash,
                "runner": "live",
                "environment": "production",
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
    hashes = calculate_live_hashes()

    return JSONResponse(
        {
            "source": "live",
            "files": hashes,
        }
    )


def calculate_live_hashes() -> dict[str, str]:
    """Calculate SHA256 hashes for all CSS and JS files."""
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

    return hashes


def calculate_build_hash(hashes: dict[str, str]) -> str:
    """Calculate a build fingerprint from file hashes."""
    # Sort for consistency, then hash the combined string
    sorted_items = sorted(hashes.items())
    combined = "\n".join(f"{k}:{v}" for k, v in sorted_items)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


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
    version = manifest.get("version") if manifest else get_version()
    commit = manifest.get("commit") if manifest else get_git_commit()

    # Get hashes - from manifest or calculate live
    if manifest and "files" in manifest:
        hashes = manifest["files"]
        build_info = manifest.get("build", {})
    else:
        hashes = calculate_live_hashes()
        build_info = {
            "hash": calculate_build_hash(hashes),
            "runner": "live",
            "environment": "production",
        }

    repo_url = "https://github.com/aleksandr-bogdanov/whendoist"

    return JSONResponse(
        {
            "version": version,
            "commit": commit,
            "build": build_info,
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
            "hashes": hashes,
            "sri": manifest.get("sri") if manifest else None,
        }
    )
