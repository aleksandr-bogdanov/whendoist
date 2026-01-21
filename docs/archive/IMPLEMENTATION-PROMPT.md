# Design System v1.0 Implementation Prompt

> Copy this prompt to start implementation. Execute phases sequentially — each phase must pass verification before proceeding to the next.

---

## Pre-Implementation Setup

Before starting, run these commands:

```bash
# 1. Create feature branch
git checkout -b feature/design-system-v1

# 2. Ensure tests pass
uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test

# 3. Start dev server (keep running in separate terminal)
just dev
```

---

## The Prompt

```
You are implementing the Whendoist Design System v1.0 migration. Follow docs/DESIGN-IMPLEMENTATION-PLAN.md exactly.

## Critical Rules

1. **One phase at a time** — Complete and verify each phase before starting the next
2. **Test after every change** — Run the app and visually verify nothing broke
3. **Commit after each phase** — Create a commit with clear message after phase completion
4. **No breaking changes** — Legacy token aliases must work throughout migration
5. **Follow CSS import order** — Pico → tokens → base → components → app → page

## Reference Documents

- **Primary**: docs/DESIGN-IMPLEMENTATION-PLAN.md (complete implementation guide)
- **Colors**: docs/brand/COLOR-SYSTEM.md (107 color tokens)
- **Components**: docs/brand/UI-KIT.md (button, form, panel specs)
- **Brand**: BRAND.md (wordmark, identity)
- **Legacy**: DESIGN.md (current implementation for reference)

---

## PHASE 1: Foundation

### Goal
Create `static/css/tokens.css` as single source of truth for all design tokens.

### Steps

1. **Create tokens.css**
   - Copy the complete `:root` block from docs/DESIGN-IMPLEMENTATION-PLAN.md "Step 1.1: Create tokens.css"
   - Include all sections: Neutral Palette, Brand Colors, Semantic Colors, Theme Tokens, Interactive States, Gradients, Glass Effects, Shadows, Border Radius, Spacing, Motion, Impact Colors, Clarity Colors, Layout, Z-Index Scale, Legacy Aliases
   - Include `[data-theme="dark"]` block
   - Include `@media (prefers-reduced-motion: reduce)` block

2. **Update base.html**
   - Add tokens.css import BEFORE app.css:
   ```html
   <link rel="stylesheet" href="/static/css/tokens.css">
   ```

3. **Verify app.css**
   - Ensure app.css still has its `:root` block (will be removed in later phase)
   - The legacy tokens now exist in BOTH files (intentional redundancy for safe migration)

4. **Add CSS error boundary**
   - Add to base.html `<head>` the error handling from the implementation plan

### Verification Checklist
- [ ] `static/css/tokens.css` exists with all tokens
- [ ] All pages load without CSS errors (check browser console)
- [ ] Pages look IDENTICAL to before (no visual changes expected)
- [ ] Legacy token names work (test with browser DevTools)

### Commit
```bash
git add -A && git commit -m "Phase 1: Create tokens.css foundation

- Add static/css/tokens.css with complete token system
- Include light mode, dark mode, and reduced motion tokens
- Add legacy aliases for backwards compatibility
- Add CSS error boundary in base.html

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## PHASE 2: Component System

### Goal
Create reusable component CSS files.

### Steps

1. **Create directory structure**
   ```bash
   mkdir -p static/css/components
   ```

2. **Create buttons.css**
   - Copy from docs/DESIGN-IMPLEMENTATION-PLAN.md "Step 2.1: Button System"
   - Includes: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-complete`, `.btn-cta`, `.btn-icon`

3. **Create forms.css**
   - Copy from docs/DESIGN-IMPLEMENTATION-PLAN.md "Step 2.2: Form Elements"
   - Includes: `.input`, `.segmented`, `.seg-btn`, `.toggle`

4. **Create panels.css**
   - Copy from docs/DESIGN-IMPLEMENTATION-PLAN.md "Step 2.3: Cards & Panels"
   - Includes: `.panel`, `.panel-header`, `.panel-title`, `.panel-desc`, `.panel-body`, `.panel-row`, `.card-glass`, `.page-surface`

5. **Create typography.css**
   - Copy from docs/DESIGN-IMPLEMENTATION-PLAN.md "Step 2.4: Typography"
   - Includes: `.page-title`, `.section-title`, `.field-label`, `.keycap`

6. **Create loading.css**
   - Add spinner and skeleton loading styles from "5.5: Loading States"

7. **Create index.css**
   ```css
   /* static/css/components/index.css */
   @import url('buttons.css');
   @import url('forms.css');
   @import url('panels.css');
   @import url('typography.css');
   @import url('loading.css');
   ```

8. **Update base.html**
   - Add components import AFTER tokens.css, BEFORE app.css:
   ```html
   <link rel="stylesheet" href="/static/css/components/index.css">
   ```

### Verification Checklist
- [ ] All component files created in static/css/components/
- [ ] Components use tokens (e.g., `var(--primary)` not `#6D5EF6`)
- [ ] All pages still work (no regressions)
- [ ] Test a button by adding `.btn .btn-primary` class in DevTools

### Commit
```bash
git add -A && git commit -m "Phase 2: Create component system

- Add static/css/components/ with buttons, forms, panels, typography, loading
- All components use design tokens
- Add components/index.css barrel import

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## PHASE 3: Page Redesigns

### Goal
Extract inline CSS from templates to external files.

### Order
Settings → Thoughts → Analytics → Tasks (simplest to most complex)

### Steps for EACH page

#### 3.1 Settings Page

1. **Create static/css/pages/settings.css**
2. **Copy all `<style>` content from settings.html to settings.css**
3. **Add page CSS import to template**:
   ```html
   {% block page_css %}
   <link rel="stylesheet" href="/static/css/pages/settings.css">
   {% endblock %}
   ```
4. **Remove inline `<style>` block from template**
5. **Migrate to component classes** where possible (e.g., `.settings-panel` → `.panel`)
6. **Test thoroughly**

#### 3.2 Thoughts Page

1. **Create static/css/pages/thoughts.css**
2. **Copy, import, remove inline styles**
3. **Migrate to components**
4. **Test**

#### 3.3 Analytics Page

1. **Create static/css/pages/analytics.css**
2. **Copy, import, remove inline styles**
3. **Create static/js/chart-theme.js** with ApexCharts theme config from implementation plan
4. **Test charts still work**

#### 3.4 Tasks Page

1. **Rename static/css/dashboard.css → static/css/pages/tasks.css**
2. **Update import in dashboard.html**
3. **Migrate tokens**: Replace `var(--dark-bg)` → `var(--bg-canvas)`, etc.
4. **Test drag-drop, calendar, all interactions**

### Verification Checklist
- [ ] Each page has < 50 lines inline CSS (structural only)
- [ ] No duplicate styles between files
- [ ] All functionality preserved
- [ ] Component classes used where appropriate

### Commit (one per page, or all together)
```bash
git add -A && git commit -m "Phase 3: Extract page CSS

- Extract Settings page CSS to static/css/pages/settings.css
- Extract Thoughts page CSS to static/css/pages/thoughts.css
- Extract Analytics page CSS to static/css/pages/analytics.css
- Rename dashboard.css to tasks.css, migrate tokens
- Add ApexCharts theme config

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## PHASE 4: Dark Mode

### Goal
Add theme toggle and dark mode support.

### Steps

1. **Add theme toggle UI**
   - Add to Settings page: Appearance section with theme selector
   - Options: Light / Dark / System

2. **Add theme initialization script**
   - Add to base.html `<head>`:
   ```javascript
   <script>
   (function() {
     const stored = localStorage.getItem('theme');
     const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
     document.documentElement.setAttribute('data-theme', stored || preferred);
   })();
   </script>
   ```

3. **Create theme toggle handler**
   - Add static/js/theme.js with toggle function
   - Dispatch 'themechange' event for ApexCharts

4. **Update ApexCharts**
   - Listen for 'themechange' event
   - Call `WhendoistChartTheme.applyTheme(charts, isDark)`

5. **Test all pages in dark mode**
   - Check contrast ratios
   - Verify all tokens update correctly

### Verification Checklist
- [ ] Theme toggle in Settings works
- [ ] Theme persists after page reload
- [ ] System preference is respected when no preference set
- [ ] All pages render correctly in dark mode
- [ ] Charts update colors on theme change
- [ ] No hardcoded light-mode colors remain

### Commit
```bash
git add -A && git commit -m "Phase 4: Add dark mode support

- Add theme toggle to Settings
- Add theme persistence to localStorage
- Add system preference detection
- Update ApexCharts to support theme changes
- Verify all pages work in dark mode

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## PHASE 5: Polish & Testing

### Goal
Icon integration, illustrations, accessibility audit, final testing.

### Steps

1. **Integrate UI icon sprite**
   - Replace emoji/inline SVG with sprite references:
   ```html
   <svg class="icon" width="16" height="16">
     <use href="/static/img/icons/ui-icons.svg#edit"/>
   </svg>
   ```
   - Priority icons: edit, trash, check, chevrons, plus, calendar, clock

2. **Add empty state illustrations**
   - Tasks empty: `empty-tasks.svg`
   - Thoughts empty: `empty-thoughts.svg`
   - Analytics empty: `empty-analytics.svg`

3. **Run accessibility audit**
   - Use browser DevTools Lighthouse
   - Check color contrast (WCAG AA)
   - Verify focus indicators visible
   - Test keyboard navigation (Tab, Shift+Tab, Enter, Escape)

4. **Remove legacy `:root` from app.css**
   - All tokens now come from tokens.css
   - Delete the `:root` block from app.css

5. **Final testing**
   - Run full test suite: `just test`
   - Manual test all pages in both themes
   - Test on mobile viewport

### Verification Checklist
- [ ] Icons use SVG sprite (not emoji)
- [ ] Empty states have illustrations
- [ ] Accessibility audit passes (no critical issues)
- [ ] Focus indicators visible on all interactive elements
- [ ] Keyboard navigation works
- [ ] All tests pass
- [ ] No legacy `:root` in app.css

### Commit
```bash
git add -A && git commit -m "Phase 5: Polish and accessibility

- Integrate UI icon sprite across all pages
- Add empty state illustrations
- Remove legacy :root block from app.css
- Pass accessibility audit

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Post-Implementation

### Create PR

```bash
git push -u origin feature/design-system-v1

gh pr create --title "Design System v1.0" --body "$(cat <<'EOF'
## Summary
Complete design system migration implementing all 5 phases:

- **Phase 1**: Created tokens.css foundation with 100+ design tokens
- **Phase 2**: Built component system (buttons, forms, panels, typography)
- **Phase 3**: Extracted inline CSS from all page templates
- **Phase 4**: Added dark mode with theme persistence
- **Phase 5**: Integrated icon sprite, illustrations, accessibility audit

## Changes
- New files: tokens.css, components/*.css, pages/*.css, chart-theme.js, theme.js
- Updated: base.html, all page templates
- Removed: Legacy :root block from app.css

## Test plan
- [ ] All pages render correctly in light mode
- [ ] All pages render correctly in dark mode
- [ ] Theme toggle persists
- [ ] All interactions work (drag-drop, forms, modals)
- [ ] Mobile responsive
- [ ] Accessibility audit passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Update Version

After PR is merged:
1. Update version in CLAUDE.md to v1.0
2. Update CHANGELOG.md
3. Run release workflow

---

## Rollback Procedures

If issues arise at any phase, see "Migration Rollback Plan" section in docs/DESIGN-IMPLEMENTATION-PLAN.md.

**Quick rollback:**
```bash
# Rollback specific phase
git checkout HEAD~1 -- static/css/

# Or rollback entire feature branch
git checkout master
git branch -D feature/design-system-v1
```
```

---

## Quick Start

Copy the prompt above and paste it into a new Claude Code session. The prompt is self-contained with all necessary context and verification steps.
