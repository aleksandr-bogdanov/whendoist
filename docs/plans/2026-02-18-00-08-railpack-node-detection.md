---
version:
pr:
created: 2026-02-18
---

# Fix Railpack Build: Node.js Not Detected in Multi-Language Project

## Context

Railway builds fail with `sh: 1: npm: not found` because Railpack 0.17.2 uses a **single-provider model** — it detects Python (via `pyproject.toml`) and never activates Node.js detection. The root `package.json` + `package-lock.json` added in v0.48.5/v0.48.6 don't work because Railpack commits to the Python provider before checking for Node.js.

This is a known Railpack limitation: [railwayapp/railpack#217](https://github.com/railwayapp/railpack/issues/217) ("Support multiple providers") is still open. The documented workaround is the `packages` field in `railpack.json`.

## Plan

### 1. Create `railpack.json` at project root

```json
{
  "$schema": "https://schema.railpack.com",
  "packages": {
    "node": "22"
  }
}
```

This tells Railpack to install Node.js 22 (with npm) alongside the auto-detected Python provider. The Python provider continues to handle `uv sync`, and the `buildCommand` in `railway.toml` (`cd frontend && npm ci && npm run build`) will now find npm.

### 2. Remove root `package.json` and `package-lock.json`

These were added in v0.48.5/v0.48.6 as a failed attempt to trigger Node.js auto-detection. With `railpack.json` explicitly requesting the `node` package, they're unnecessary and could confuse future maintainers.

### 3. Version bump + PR

- Bump version in `pyproject.toml` (0.48.6 → 0.48.7)
- `uv lock`
- Update `CHANGELOG.md`
- PR title: `v0.48.7/fix: Use railpack.json to install Node.js for frontend build`

## Files to Modify

| File | Action |
|------|--------|
| `railpack.json` (new) | Create with `packages.node` |
| `package.json` | Delete |
| `package-lock.json` | Delete |
| `pyproject.toml` | Bump version |
| `uv.lock` | Regenerate |
| `CHANGELOG.md` | Add entry |

## Verification

After merging, the Railway build log should show:
- `↳ Detected Python` (still present)
- Node.js 22 installed via packages
- `cd frontend && npm ci && npm run build` succeeds
