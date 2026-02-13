---
name: fix-all-issues
description: Fix all open GitHub issues one by one — investigate, fix, PR, merge, close each
disable-model-invocation: true
---

Fix all open GitHub issues, one by one. Follow every step for each issue — no shortcuts.

## 1. Fetch open issues

```
gh issue list --repo aleksandr-bogdanov/whendoist --state open --json number,title,labels,createdAt --jq 'sort_by(.createdAt) | .[] | "#\(.number) [\(.labels | map(.name) | join(", "))] \(.title)"'
```

## 2. Process each issue

For each issue, starting with the oldest:

### a. Fetch full details

```
gh issue view {number} --repo aleksandr-bogdanov/whendoist --comments
```

Read the full issue body, stack traces, labels, and all comments.

### b. Investigate root cause

- Don't just fix the symptom — find the **root cause**.
- If there's a stack trace, read every file mentioned in it.
- Search the codebase for related patterns that might have the same problem.
- Think about edge cases: client disconnects, missing data, race conditions, concurrency.
- If this is a transient infrastructure issue (network timeout, DB connection lost), comment explaining why no code fix is needed, close the issue, and move on.

### c. Implement the fix

- Read CLAUDE.md for all project conventions before writing any code.
- Keep changes minimal and focused — fix the bug, don't refactor the world.
- If the fix touches templates, check both desktop and mobile rendering.
- If the fix touches JS, verify module exports match `test_js_module_contract.py`.

### d. Verify

Run the full check suite — every command must pass:

```
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
```

If anything fails, fix it before proceeding.

### e. Create a versioned PR

Follow the PR workflow from CLAUDE.md exactly:

1. Bump the patch version in `pyproject.toml`
2. Run `uv lock`
3. Add an entry to `CHANGELOG.md` under the new version
4. Create a branch named `fix/issue-{number}-{short-description}`
5. Commit with message: `v{version}/fix: {description}`
6. Push and create PR with title matching the commit message
7. PR body must reference: `Fixes #{number}`

### f. Merge and close

- Wait for CI to pass: `gh pr checks {pr_number} --watch --repo aleksandr-bogdanov/whendoist`
- Once green, merge with: `gh pr merge {pr_number} --squash --repo aleksandr-bogdanov/whendoist`
- Verify the issue was auto-closed. If not, close it manually.
- Switch back to master and pull before starting the next issue.

## 3. Summary

After all issues are processed, give a short summary: which issues were fixed, which were closed as transient/wontfix, and any that couldn't be resolved (with reasons).
