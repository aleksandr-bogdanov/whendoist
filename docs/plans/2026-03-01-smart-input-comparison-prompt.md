# Prompt for Claude Code: Compare Three LLM Analyses

Paste this as the first message in a new Claude Code session in the whendoist project.

---

Read these two files first:
- `docs/plans/2026-03-01-smart-input-approach-analysis.md` — full technical state of our two smart input approaches + the Todoist reference model
- `docs/plans/2026-03-01-smart-input-analysis-prompt.md` — the exact prompt that was sent to three different LLMs

Then read the actual hook implementations to ground yourself in the real code:
- `frontend/src/hooks/use-smart-input.ts` (Approach B)
- `frontend/src/hooks/use-smart-input-consumer.ts` (Approach A)
- `frontend/src/lib/task-parser.ts` (shared parser)

**Context:** We have two different smart input approaches in our React task app. We asked ChatGPT, Gemini, and Claude Web the same question: "which approach should we unify to?" Their answers are pasted below. We need you to be the judge.

**Your job:**

1. **Summarize each response** in 2-3 sentences — what does it recommend and why?
2. **Find agreement** — where do all three (or two of three) converge?
3. **Find disagreement** — where do they diverge? Who has the stronger argument?
4. **Check against our actual code** — read the real hook files. Does each recommendation actually work with our codebase, or does it assume things that aren't true?
5. **Flag bad reasoning** — did any response contradict itself, handwave over the edit-mode problem, or ignore a stated constraint?
6. **Your verdict** — based on the three analyses AND the actual code, what should we do? Be specific: which option from the decision space (Keep both, Unify to A, Unify to B, Todoist C, B-hybrid), and what's the concrete first step?

Write your output to `docs/plans/2026-03-01-smart-input-verdict.md`.

---

## ChatGPT's Response

[PASTE HERE]

## Gemini's Response

[PASTE HERE]

## Claude Web's Response

[PASTE HERE]
