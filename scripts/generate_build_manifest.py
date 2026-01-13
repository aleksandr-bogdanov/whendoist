#!/usr/bin/env python3
"""
Generate build manifest for Whendoist.

This script creates a build-manifest.json file with:
- Version info from CHANGELOG.md
- Git commit info
- SHA256 hashes of all static files
- SRI hashes for key files

Usage:
    python scripts/generate_build_manifest.py

The manifest is written to static/build-manifest.json
"""

import hashlib
import json
import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path


def get_file_sha256(filepath: Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def get_file_sri_hash(filepath: Path) -> str:
    """Calculate SRI hash (base64 SHA384) of a file."""
    sha384_hash = hashlib.sha384()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha384_hash.update(chunk)
    import base64

    return f"sha384-{base64.b64encode(sha384_hash.digest()).decode()}"


def get_git_info() -> dict:
    """Get current git commit information."""
    try:
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        short = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
        date = subprocess.check_output(["git", "show", "-s", "--format=%cI", "HEAD"], text=True).strip()
        return {"sha": sha, "short": short, "date": date}
    except subprocess.CalledProcessError:
        return {"sha": "unknown", "short": "unknown", "date": "unknown"}


def get_version_from_changelog(changelog_path: Path) -> str:
    """Extract latest version from CHANGELOG.md."""
    try:
        content = changelog_path.read_text()
        # Look for ## [X.Y.Z] pattern
        match = re.search(r"## \[(\d+\.\d+\.\d+)\]", content)
        if match:
            return f"v{match.group(1)}"
    except Exception:
        pass
    return "v0.0.0"


def main():
    # Get project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    static_dir = project_root / "static"

    # Get version and commit info
    version = get_version_from_changelog(project_root / "CHANGELOG.md")
    commit_info = get_git_info()

    # Collect file hashes
    file_hashes = {}

    # Hash CSS files
    css_dir = static_dir / "css"
    if css_dir.exists():
        for css_file in css_dir.glob("*.css"):
            relative_path = f"css/{css_file.name}"
            file_hashes[relative_path] = get_file_sha256(css_file)

    # Hash JS files
    js_dir = static_dir / "js"
    if js_dir.exists():
        for js_file in js_dir.glob("*.js"):
            relative_path = f"js/{js_file.name}"
            file_hashes[relative_path] = get_file_sha256(js_file)

    # Hash Python app files
    app_dir = project_root / "app"
    if app_dir.exists():
        for py_file in app_dir.rglob("*.py"):
            relative_path = str(py_file.relative_to(project_root))
            file_hashes[relative_path] = get_file_sha256(py_file)

    # Calculate build fingerprint
    all_hashes = "\n".join(f"{k}:{v}" for k, v in sorted(file_hashes.items()))
    build_hash = hashlib.sha256(all_hashes.encode()).hexdigest()[:16]

    # Generate SRI hashes for all CSS and JS files
    sri_hashes = {}
    key_files = [
        "css/app.css",
        "css/dashboard.css",
        "css/dialog.css",
        "js/crypto.js",
        "js/drag-drop.js",
        "js/energy-selector.js",
        "js/plan-tasks.js",
        "js/recurrence-picker.js",
        "js/task-complete.js",
        "js/task-dialog.js",
        "js/task-list-options.js",
        "js/task-sheet.js",
        "js/task-sort.js",
        "js/toast.js",
    ]
    for key_file in key_files:
        filepath = static_dir / key_file
        if filepath.exists():
            sri_hashes[key_file.split("/")[-1]] = get_file_sri_hash(filepath)

    # Build manifest
    manifest = {
        "version": version,
        "commit": commit_info,
        "build": {
            "hash": build_hash,
            "timestamp": datetime.now(UTC).isoformat(),
            "runner": "local",
            "environment": "development",
        },
        "repository": {
            "url": "https://github.com/aleksandr-bogdanov/whendoist",
        },
        "files": file_hashes,
        "sri": sri_hashes,
    }

    # Write manifest
    manifest_path = static_dir / "build-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(f"Build manifest generated: {manifest_path}")
    print(f"  Version: {version}")
    print(f"  Commit: {commit_info['short']}")
    print(f"  Build hash: {build_hash}")
    print(f"  Files hashed: {len(file_hashes)}")
    print(f"  SRI hashes: {len(sri_hashes)}")


if __name__ == "__main__":
    main()
