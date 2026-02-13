---
name: fix-issue
description: Fix a single GitHub issue end-to-end — investigate, fix, PR, merge, close
disable-model-invocation: true
---

Fix GitHub issue #$ARGUMENTS end-to-end. Follow every step below — no shortcuts.

## 1. Fetch the issue

```
gh issue view $ARGUMENTS --repo aleksandr-bogdanov/whendoist --comments
```

Read the full issue body, stack traces, labels, and all comments carefully.

## 2. Investigate root cause

- Don't just fix the symptom — find the **root cause**.
- If there's a stack trace, read every file mentioned in it.
- Search the codebase for related patterns that might have the same problem.
- Think about edge cases: client disconnects, missing data, race conditions, concurrency.
- Consider whether this is a transient infrastructure issue (network timeout, DB connection lost). If so, explain why no code fix is needed, comment on the issue, close it, and stop.

## 3. Implement the fix

- Read CLAUDE.md for all project conventions before writing any code.
- Keep changes minimal and focused — fix the bug, don't refactor the world.
- If the fix touches templates, check both desktop and mobile rendering.
- If the fix touches JS, verify module exports match `test_js_module_contract.py`.

## 4. Verify

Run the full check suite — every command must pass:

```
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

If anything fails, fix it before proceeding.

## 5. Create a versioned PR

Follow the PR workflow from CLAUDE.md exactly:

1. Bump the patch version in `pyproject.toml`
2. Run `uv lock`
3. Add an entry to `CHANGELOG.md` under the new version
4. Create a branch named `fix/issue-$ARGUMENTS-{short-description}`
5. Commit with message: `v{version}/fix: {description}`
6. Push and create PR with title matching the commit message
7. PR body must reference: `Fixes #$ARGUMENTS`

## 6. Merge and close

- Wait for CI to pass: `gh pr checks {pr_number} --watch --repo aleksandr-bogdanov/whendoist`
- Once green, merge with: `gh pr merge {pr_number} --squash --repo aleksandr-bogdanov/whendoist`
- Verify the issue was auto-closed (the `Fixes #` reference should handle it). If not, close it manually.
- Switch back to master and pull.
