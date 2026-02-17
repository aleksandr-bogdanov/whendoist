---
name: fix-all-issues
description: Fix all open issues from GitHub and Sentry — investigate, fix, PR, merge, close each
disable-model-invocation: true
---

Fix all open issues from both GitHub and Sentry, one by one. Follow every step — no shortcuts.

## 1. Fetch open GitHub issues

```
gh issue list --repo aleksandr-bogdanov/whendoist --state open --json number,title,labels,createdAt --jq 'sort_by(.createdAt) | .[] | "#\(.number) [\(.labels | map(.name) | join(", "))] \(.title)"'
```

## 2. Fetch unresolved Sentry issues

Requires `SENTRY_AUTH_TOKEN` env var. If not set, warn the user and skip Sentry.

```
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/aleksandr-bogdanov/whendoist/issues/?query=is:unresolved&limit=25" \
  | python3 -c "
import json, sys
issues = json.load(sys.stdin)
for i in issues:
    events = i.get('count', '?')
    first = i.get('firstSeen', '')[:10]
    last = i.get('lastSeen', '')[:10]
    print(f\"SENTRY-{i['id']} [{events} events, {first} → {last}] {i['title']}\")
"
```

## 3. Match Sentry errors to existing GitHub issues (regression detection)

For each unresolved Sentry issue, determine if it's a **regression** of a previously fixed issue before creating a new one.

### a. Check for exact Sentry ID match (already tracked)

```
gh issue list --repo aleksandr-bogdanov/whendoist --state all --search "SENTRY-{sentry_id}" --json number,title,state --jq '.[] | "#\(.number) [\(.state)] \(.title)"'
```

### b. Search for similar closed issues by error type/title (regression detection)

Extract the error type and key details (e.g., `QueryCanceledError`, `PendingRollbackError`, the function name from `culprit`) and search closed issues:

```
gh issue list --repo aleksandr-bogdanov/whendoist --state closed --search "{error_type}" --json number,title,closedAt,labels --jq '.[] | "#\(.number) [closed \(.closedAt[:10])] \(.title)"'
```

If matching closed issues are found:
1. **Read the closed issue** (`gh issue view {number} --comments`) to understand:
   - Was it closed as transient/wontfix, or was there an actual code fix (PR)?
   - If there was a code fix, has the fix been reverted or does the Sentry error post-date the fix merge?
2. **Compare timestamps**: check if the Sentry `lastSeen` is after the closed issue's `closedAt`. If so, it's a regression.
3. **If it's a true regression** (code fix was merged but error reappeared):
   - Read the original fix PR to understand what changed
   - The new GitHub issue should reference the original: "Regression of #{original_number} (fixed in PR #{pr_number})"
4. **If the original was closed as transient** and the new Sentry error is the same class of transient issue:
   - Create the GitHub issue, close it immediately with a comment referencing the original, and resolve on Sentry
   - No code fix needed

### c. Fetch Sentry event details

If no matching GitHub issue exists (or it's a genuine regression needing a new fix), fetch the latest event for the stack trace. Use the **list endpoint** metadata (from step 2) which includes `culprit`, `metadata.value`, `metadata.type`, `metadata.filename`, and `metadata.function` — these are often sufficient without the events endpoint. If you need the full stack trace:

```
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/issues/{sentry_id}/events/latest/"
```

### d. Create the GitHub issue

```
gh issue create --repo aleksandr-bogdanov/whendoist \
  --title "{error_type}: {short_description}" \
  --label "bug,sentry" \
  --body "$(cat <<'EOF'
## Sentry Error

**Sentry ID:** SENTRY-{sentry_id}
**Link:** https://aleksandr-bogdanov.sentry.io/issues/{sentry_id}/
**Events:** {count} | **First seen:** {first_seen} | **Last seen:** {last_seen}

## Stack Trace

```
{formatted_stack_trace}
```

## Context

{any relevant request/user context from the Sentry event, with sensitive data redacted}

## Regression Analysis

{If this is a regression, reference the original issue and PR. If it matches a previously-closed transient issue, note that.}
EOF
)"
```

## 4. Process each issue

Collect all issues: existing GitHub issues + newly created ones from Sentry.
Process each one starting with the oldest:

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
- If this is a transient infrastructure issue (network timeout, DB connection lost), comment explaining why no code fix is needed, close the issue, resolve the Sentry issue, and move on.

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
- If the issue came from Sentry, resolve it there too:
  ```
  curl -s -X PUT -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    --data-raw '{"status":"resolved"}' \
    "https://sentry.io/api/0/organizations/aleksandr-bogdanov/issues/{sentry_id}/"
  ```
- Switch back to master and pull before starting the next issue.

## 5. Summary

After all issues are processed, give a short summary:
- Which issues were fixed (with PR numbers)
- Which were closed as transient/wontfix
- Which Sentry issues were resolved
- Any that couldn't be resolved (with reasons)
