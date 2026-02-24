# Final Ship Readiness Review — Prompt

> Paste this into a fresh conversation with full codebase context.
> Works best with Opus. Expects Claude Code with access to tools (Read, Grep, Glob, Task).

---

## Prompt

You are conducting the final ship-readiness review for this application before v1.0 release. Your job is to find anything that should block shipping — bugs, security holes, data loss scenarios, or correctness issues that would damage user trust.

**This is a multi-phase review. You MUST complete each phase fully and write its output before starting the next. Do NOT read any files in `docs/archive/` until Phase 3 explicitly tells you to.**

### Phase 1: Independent Investigation (blind)

**Do NOT read any audit docs, changelogs, or backlog items yet.** Form your own threat model from the code alone.

Run the full CI suite first (`uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`) to confirm the baseline is green.

Then investigate these areas by reading actual source code. For each area, trace data from HTTP request through middleware, router, service, database, and back to response. Use parallel subagents where possible.

**Traces to follow (launch as parallel investigations):**

1. **Auth boundary** — Pick any 3 state-changing endpoints. Trace: What happens if the request has no session? Expired session? Valid session but wrong user_id for the resource? Does every mutation filter by user_id?

2. **Untrusted input** — Pick the 3 most complex request models (largest Pydantic schemas). Trace each field from HTTP body → Pydantic validation → service layer → SQL write. What values are accepted? What would break if a field contained `None`, empty string, negative number, 10MB string, or unicode control characters?

3. **Data lifecycle** — Pick one entity (e.g., tasks). Trace: create → read → update → soft-delete → hard-delete. Are there orphaned references at any stage? Does cascade delete work? What about related entities (instances, sync records, subtasks)?

4. **Error paths** — Pick 3 endpoints that call external services or do multi-step DB operations. What happens when step 2 of 3 fails? Is the DB left in an inconsistent state? Are error details leaked to the client? Are errors logged with sufficient context?

5. **Client-server contract** — Pick 3 JavaScript modules that make API calls. Does the client send what the server expects? Are all mutation paths protected by CSRF? Does the client handle error responses correctly (4xx, 5xx, network failure)?

6. **State consistency** — Are there any operations where the server assumes state that could have changed between requests? (e.g., "check X, then do Y" without holding a lock or transaction). What about concurrent tabs?

After all investigations complete, write your findings to a new file:
`docs/archive/v1-final-review-phase1.md`

Format: for each finding, include the file:line evidence, a severity (CRITICAL/HIGH/MEDIUM/LOW), and a one-line description. Also list areas you investigated and found clean.

**Do NOT proceed to Phase 2 until this file is written.**

---

### Phase 2: Adversarial Scenarios (blind)

Still without reading any audit docs, think like an attacker and a frustrated user.

**Attacker scenarios** — For each, determine if the application is vulnerable and provide evidence:

1. I'm a registered user. Can I read, modify, or delete another user's data through any API endpoint?
2. I found a valid session cookie in a log file. What's the blast radius? Can I access encrypted content? Change the password? Wipe data?
3. I can trick a logged-in user into clicking a link. What's the worst CSRF/clickjacking I can achieve?
4. I can inject HTML into a field that gets rendered. Where does it end up? Is it escaped everywhere?
5. I want to DoS a specific user's account. What's the cheapest API call I can repeat to degrade their experience?

**Frustrated user scenarios** — For each, determine the outcome:

1. I accidentally wiped my data using the import flow. Can I recover? Is there a warning?
2. I set up encryption, closed the tab, and forgot my passphrase. What happens to my data?
3. I have 500 tasks and enable Google Calendar sync. Does it work? Does it time out? What if my token expires mid-sync?
4. I'm offline and tap "complete" on a task. What happens? What about "delete"?
5. I export a backup, make changes, then import the backup. What data do I lose?

Append your findings to the same file:
`docs/archive/v1-final-review-phase1.md`

**Do NOT proceed to Phase 3 until these scenarios are written.**

---

### Phase 3: Cross-Reference and Gap Analysis

**NOW read all files in `docs/archive/` that start with `2026-` — these are previous audit reports.** Also read the Post-v1.0 Backlog section at the top of `CHANGELOG.md`.

Do three things:

1. **Classify your Phase 1+2 findings:**
   - Already fixed in code → mark as VERIFIED
   - Already in backlog → mark as KNOWN, note which backlog item
   - **NEW** — not fixed and not in backlog → these are your key findings

2. **Challenge the "safe" claims:** Previous audits list areas as "Verified Safe" or "No Issues Found." Pick the 3 riskiest "safe" claims and independently re-verify them by reading the actual code. Do you agree? If not, why?

3. **Completeness check:** Is there any part of the application that NO audit has examined? Any file, module, or flow that was never mentioned? If so, investigate it now.

Write the final report to:
`docs/archive/v1-final-review.md`

Format:

```
# V1.0 Final Ship Readiness Review

## New Findings (not fixed, not in backlog)
[your findings with file:line evidence]

## Challenged "Safe" Claims
[which claims you re-verified and whether you agree]

## Unexamined Areas
[anything no prior audit covered]

## Ship Verdict
[SHIP / SHIP WITH CAVEATS / DO NOT SHIP]
[One paragraph justifying the verdict with specific evidence]
```

---

### Ground Rules

- **Evidence over opinion.** Every claim needs a file:line reference.
- **Trace, don't grep.** Following data through the system catches more bugs than keyword searching.
- **Depth over breadth.** Five traces done thoroughly beat twenty surface-level checks.
- **Think hard about what you're NOT seeing.** The most dangerous bugs are in code paths nobody tests.
- **Be direct.** If you think it should not ship, say so and say why.
