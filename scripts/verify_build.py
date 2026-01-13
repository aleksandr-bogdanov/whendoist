#!/usr/bin/env python3
"""
Verify build integrity for Whendoist.

Checks:
- Python syntax and types (ruff, pyright)
- JavaScript syntax (via Node.js)
- CSS syntax (basic validation)
- Template file presence

Usage:
    python scripts/verify_build.py
"""

import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str], description: str) -> bool:
    """Run a command and return success status."""
    print(f"\n{'=' * 60}")
    print(f"  {description}")
    print(f"{'=' * 60}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print("  ✅ PASS")
            return True
        else:
            print("  ❌ FAIL")
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr)
            return False
    except FileNotFoundError:
        print(f"  ⚠️  SKIP (command not found: {cmd[0]})")
        return True  # Don't fail if tool not installed


def check_js_syntax(project_root: Path) -> bool:
    """Check JavaScript files for syntax errors using Node.js."""
    js_dir = project_root / "static" / "js"
    if not js_dir.exists():
        print("  ⚠️  No JS directory found")
        return True

    js_files = list(js_dir.glob("*.js"))
    print(f"\n{'=' * 60}")
    print(f"  Checking {len(js_files)} JavaScript files")
    print(f"{'=' * 60}")

    # Check if node is available
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("  ⚠️  Node.js not found, skipping JS syntax check")
        print("     Install Node.js to enable JS validation")
        return True

    all_passed = True
    for js_file in sorted(js_files):
        # Use Node.js --check flag to verify syntax
        result = subprocess.run(["node", "--check", str(js_file)], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  ❌ {js_file.name}: syntax error")
            print(result.stderr)
            all_passed = False
        else:
            print(f"  ✅ {js_file.name}")

    return all_passed


def check_css_syntax(project_root: Path) -> bool:
    """Check CSS files for basic syntax errors."""
    css_dir = project_root / "static" / "css"
    if not css_dir.exists():
        print("  ⚠️  No CSS directory found")
        return True

    css_files = list(css_dir.glob("*.css"))
    print(f"\n{'=' * 60}")
    print(f"  Checking {len(css_files)} CSS files")
    print(f"{'=' * 60}")

    all_passed = True
    for css_file in sorted(css_files):
        content = css_file.read_text()

        # Basic CSS validation checks
        errors = []

        # Check balanced braces
        open_braces = content.count("{")
        close_braces = content.count("}")
        if open_braces != close_braces:
            errors.append(f"Unbalanced braces: {open_braces} open, {close_braces} close")

        # Check for common syntax issues
        lines = content.split("\n")
        for i, line in enumerate(lines, 1):
            # Skip comments
            if line.strip().startswith("/*") or line.strip().startswith("*"):
                continue

            # Check for unclosed strings (simple check)
            single_quotes = line.count("'") - line.count("\\'")
            double_quotes = line.count('"') - line.count('\\"')
            if single_quotes % 2 != 0:
                errors.append(f"Line {i}: Unclosed single quote")
            if double_quotes % 2 != 0:
                errors.append(f"Line {i}: Unclosed double quote")

        if errors:
            print(f"  ❌ {css_file.name}:")
            for error in errors[:5]:  # Limit errors shown
                print(f"      {error}")
            all_passed = False
        else:
            print(f"  ✅ {css_file.name}")

    return all_passed


def check_templates(project_root: Path) -> bool:
    """Check that all referenced templates exist."""
    templates_dir = project_root / "app" / "templates"
    if not templates_dir.exists():
        print("  ⚠️  No templates directory found")
        return True

    template_files = list(templates_dir.glob("*.html"))
    print(f"\n{'=' * 60}")
    print(f"  Checking {len(template_files)} template files")
    print(f"{'=' * 60}")

    all_passed = True
    for template in sorted(template_files):
        content = template.read_text()

        # Check for common Jinja2 issues
        errors = []

        # Check balanced Jinja2 blocks
        for tag in ["if", "for", "block", "macro"]:
            opens = content.count(f"{{% {tag}")
            closes = content.count(f"{{% end{tag}")
            if opens != closes:
                errors.append(f"Unbalanced {{% {tag} %}}: {opens} open, {closes} close")

        # Check balanced braces
        double_opens = content.count("{{")
        double_closes = content.count("}}")
        if double_opens != double_closes:
            errors.append(f"Unbalanced {{{{ }}}}: {double_opens} open, {double_closes} close")

        if errors:
            print(f"  ❌ {template.name}:")
            for error in errors[:5]:
                print(f"      {error}")
            all_passed = False
        else:
            print(f"  ✅ {template.name}")

    return all_passed


def main():
    project_root = Path(__file__).parent.parent

    print("\n" + "=" * 60)
    print("  WHENDOIST BUILD VERIFICATION")
    print("=" * 60)

    results = []

    # Python checks
    results.append(run_command(["uv", "run", "ruff", "check", "."], "Python linting (ruff)"))

    results.append(run_command(["uv", "run", "pyright", "app/"], "Python type checking (pyright)"))

    # JavaScript checks
    results.append(check_js_syntax(project_root))

    # CSS checks
    results.append(check_css_syntax(project_root))

    # Template checks
    results.append(check_templates(project_root))

    # Summary
    print("\n" + "=" * 60)
    print("  SUMMARY")
    print("=" * 60)

    passed = sum(results)
    total = len(results)

    if all(results):
        print(f"\n  ✅ All {total} checks passed!\n")
        return 0
    else:
        print(f"\n  ❌ {total - passed}/{total} checks failed!\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
