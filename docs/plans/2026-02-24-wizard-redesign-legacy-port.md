---
version: v0.54.87
pr:
created: 2026-02-24
---

# Wizard Redesign: Port Legacy Design to React SPA

## Context

The React SPA's onboarding wizard is functional but visually bare — generic emoji icons, left-aligned text, tiny progress dots, plain shadcn buttons, no brand identity. The legacy Jinja2 wizard is beautifully designed with glassmorphism, branded SVGs, centered layouts, animated progress dots, task previews, and emotional copy. We're porting the legacy design wholesale into the React SPA.

## Files to Modify

1. **`frontend/src/components/wizard/onboarding-wizard.tsx`** — Full rewrite (~600 lines)
2. **`frontend/src/routes/_authenticated.tsx`** — Pass `userName` prop (1-line change)
3. **`frontend/src/styles/globals.css`** — Add 2 keyframe animations

## Design Decisions

- **Single file** — Keep wizard self-contained in `onboarding-wizard.tsx`
- **6 visible steps** (skip Calendar Selection) — Welcome, Energy, Calendar Connect, Todoist, Domains, Completion. Calendar selection auto-skipped since users won't have a calendar connected on first run. Progress dots still show 7 for parity (dot 3 is skipped over)
- **Use existing `variant="cta"` button** — Already has the purple gradient from the legacy design
- **Inline SVGs** — Logo, rocket, Google Calendar icon, Todoist logo as small function components within the file
- **Glassmorphic cards** via Tailwind: `bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-[var(--shadow-card)]`
- **Quicksand font** for wordmark — already loaded in `frontend/index.html`
- **Domain suggestions as selectable chips** (not form inputs) — 3-column grid with toggle behavior

## Step-by-Step Changes

### 1. Add animations to `globals.css`

At the bottom of `frontend/src/styles/globals.css`, add:

```css
@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes finalPulse {
  0%, 100% { box-shadow: 0 2px 8px rgba(109,94,246,0.25), 0 4px 16px rgba(109,94,246,0.20), 0 8px 24px rgba(109,94,246,0.12); }
  50% { box-shadow: 0 3px 12px rgba(109,94,246,0.32), 0 6px 22px rgba(109,94,246,0.26), 0 12px 32px rgba(109,94,246,0.16); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes logoFloat { 0%, 100% { transform: none; } }
  @keyframes finalPulse { 0%, 100% { box-shadow: var(--shadow-cta); } }
}
```

### 2. Update `_authenticated.tsx` (1 line)

Pass user name to wizard:
```tsx
// Before:
{showWizard && <OnboardingWizard open={true} onComplete={() => setWizardDismissed(true)} />}
// After:
{showWizard && <OnboardingWizard open={true} onComplete={() => setWizardDismissed(true)} userName={me?.name ?? undefined} />}
```

### 3. Rewrite `onboarding-wizard.tsx`

**Structure:**

```
Imports
Constants (ENERGY_MODES, PREVIEW_TASKS, CLARITY_VISIBILITY, CLARITY_COLORS, DOMAIN_SUGGESTIONS)
Inline SVGs (WhendoistLogo, RocketIllustration, GoogleCalendarIcon, TodoistLogo)
ProgressDots component
OnboardingWizard (main export)
  - 250ms crossfade transition between steps
  - Navigation: getNextStep/goForward/goBack skip step index 3
  - DialogContent: max-w-[560px], rounded-[20px], no close button
Step components:
  WelcomeStep — Logo + "Welcome, {name}" + value prop card + "Get Started"
  EnergyStep — 3 horizontal selectable cards + PREVIEW task list + "Got it, continue"
  CalendarConnectStep — Google icon + status + "Connect Google Calendar" + privacy note + "Skip"
  TodoistStep — Todoist logo + "Connect Todoist" + "Skip"
  DomainsStep — 3-col suggestion chip grid + "Add your own" + "Skip"/"Continue"
  CompletionStep — Rocket SVG + "You're all set" + "Open Dashboard →" with pulse
```

**Key design elements per step:**

| Step | Title | Layout | Primary CTA | Secondary |
|------|-------|--------|-------------|-----------|
| Welcome | (Logo wordmark) | Centered, value prop card | "Get Started" (cta) | — |
| Energy | "Work with your energy" | 3-col mode cards + task preview | "Got it, continue" (cta) | "Back" (outline) |
| Calendar | "Connect your calendar" | Connection card + privacy note | "Skip" (outline) | "Back" (outline) |
| Todoist | "Already have tasks?" | Centered brand card | "Skip" (outline) | "Back" (outline) |
| Domains | "Organize your life" | 3-col chip grid | "Continue"/"Skip" | "Back" (outline) |
| Completion | "You're all set" | Rocket + subtitle | "Open Dashboard →" (cta, pulsing) | — |

**Navigation logic:**
- Step 0→1→2→4→5→6 (index 3 always skipped)
- Back reverses same path: 6→5→4→2→1→0
- Optional steps (Calendar, Todoist) show "Skip" instead of "Next"

**Imports to add:** `Lock` from lucide-react, `cn` from `@/lib/utils`
**Imports to remove:** `Brain, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Coffee, Download, Plus, Trash2, Zap`, `Card`, `Switch`, `CalendarResponse` type

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — TypeScript passes
2. `cd frontend && npx biome check .` — Linting passes
3. `cd frontend && npm run build` — Build succeeds
4. Manual: Open dev server, create fresh user (or reset wizard in Settings), verify all 6 steps render correctly with the new design
