---
version:
pr:
created: 2026-02-24
---

# Landing Page Redesign + Demo Login Fix

## Context

The React SPA login page (`frontend/src/routes/login.lazy.tsx`) is a minimal card with a Google sign-in button. The legacy Jinja2 login page (`app/templates/login.html` + `static/css/login.css`) has a polished landing page with:
- Animated hero illustration (task → calendar transfer loop)
- Wordmark (W icon + "hendoist")
- Value proposition copy
- Styled Google sign-in + demo buttons
- Trust/features meta block + footer

Additionally, `demo_login_enabled` is never returned by the build-info API, so the "Try Demo" button in the React login page never appears.

The demo pill + reset are already ported to React (`frontend/src/components/demo-pill.tsx`).

## Changes

### 1. Add `demo_login_enabled` to build-info API

**File:** `app/routers/build_info.py`

Add `demo_login_enabled` to the JSON response:

```python
from app.config import get_settings

return JSONResponse({
    "version": get_version(),
    "commit": get_git_commit(),
    "demo_login_enabled": get_settings().demo_login_enabled,
    "repository": {"url": "..."},
})
```

### 2. Create login page CSS with animations

**File:** `frontend/src/styles/login.css` (new)

Port the animation keyframes and login-specific styles from `static/css/login.css`:
- Background gradient orbs (`floatOrb`)
- Ghost chip travel animation (`ghostChipTravel`)
- Checkbox tick animation (`checkboxTick`, `checkmarkAppear`)
- Arrow intent pulse (`arrowIntent`, `arrowStroke`)
- Calendar destination fill (`destinationFill`)
- Focus ring expand (`focusRingExpand`)
- CTA button shine (`shine`)
- Entrance animation (`loginFadeIn`)
- `prefers-reduced-motion` support (show final state, no movement)

Use CSS custom properties that map to the React SPA's existing Tailwind/shadcn color tokens (e.g. `hsl(var(--primary))`, `hsl(var(--muted-foreground))`). Where legacy tokens like `--gradient-primary` or `--glass-bg-strong` don't exist in the SPA, inline the color values.

### 3. Rewrite login page component

**File:** `frontend/src/routes/login.lazy.tsx`

Rewrite to match the legacy `login.html` structure:

```
<div class="login-page">           ← gradient bg + floating orbs
  <div class="login-container">    ← centered max-w-[540px], entrance animation

    <!-- Hero -->
    <div class="login-hero">
      <div class="login-hero-illustration">  ← glass card with animation
        <ghost-chip />                        ← traveling task element
        <task-stack />                        ← 3 tasks (brainstorm/normal/autopilot)
        <arrow />                             ← SVG arrow with pulse
        <calendar />                          ← 3x3 grid with destination cell + focus ring
      </div>
      <wordmark />                            ← W SVG + "hendoist" text
    </div>

    <!-- Value proposition -->
    <p>Your calendar shows when you're busy.</p>
    <p>Your task list shows what to do.</p>
    <p><strong>Whendoist shows <em>when</em> to actually do it.</strong></p>

    <!-- Google sign-in button (gradient CTA) -->
    <a href="/auth/google">
      <google-icon-in-circle /> Continue with Google
    </a>

    <!-- Demo section (conditional) -->
    {demoEnabled && <>
      <divider>or</divider>
      <a href="/auth/demo">🧪 Try Demo Account</a>
    </>}

    <!-- Meta block -->
    <p>Reads your calendar to find free time. Never edits events.</p>
    <p>Calendar-aware scheduling · Todoist import · Open source</p>

    <!-- Footer -->
    <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
  </div>
</div>
```

Import `login.css` at the top of the component file. Use CSS class names for animated elements, Tailwind for simple layout/typography where appropriate.

## Files Modified

| File | Action |
|------|--------|
| `app/routers/build_info.py` | Add `demo_login_enabled` to response |
| `frontend/src/styles/login.css` | New — animation keyframes + login styles |
| `frontend/src/routes/login.lazy.tsx` | Rewrite to match legacy design |

## Verification

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
2. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
3. Visual: run `npm run dev`, visit `/login` — should show hero animation, wordmark, value prop, Google button, footer
4. Visual: set `DEMO_LOGIN_ENABLED=true`, reload `/login` — "Try Demo Account" button appears
5. Check `prefers-reduced-motion` — animations replaced by static final state
6. Check dark mode — colors adapt properly
