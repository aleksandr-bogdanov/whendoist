# UI Kit Verification Prompt

> Use this prompt in a new Claude chat to verify the correctness and cohesiveness of the Phase 2D UI Kit implementation.

---

## Prompt for New Claude Chat

```
I'm reviewing the UI Kit (Phase 2D) implementation for Whendoist, a task scheduling app. Please analyze the following files for correctness, consistency, and cohesiveness with the existing design system.

## Context

Whendoist uses:
- **Design Tokens**: CSS custom properties in `app.css` (slate-based neutrals, purple primary)
- **Design Principles**: Tint-based interactions (not shadows), purple for success states (not green), rounded forms
- **Typography**: System fonts for app, Quicksand for brand
- **Existing CSS Files**: `app.css`, `dashboard.css`, `dialog.css`, `wizard.css`

## Files to Review

### 1. UI Kit Documentation
`docs/brand/UI-KIT.md`

### 2. Interactive Reference Tool
`docs/brand/ui-kit-reference.html`

### 3. Source CSS Files (for cross-reference)
- `static/css/app.css` (design tokens)
- `static/css/dialog.css` (buttons, inputs, modals)
- `static/css/wizard.css` (modern glassmorphism buttons)

### 4. Brand Guidelines
`BRAND.md` - for overall brand context

## Verification Checklist

Please verify:

### 1. Token Accuracy
- [ ] All CSS custom property names match `app.css` exactly
- [ ] All hex color values are correct
- [ ] All border-radius, spacing, and sizing values match source

### 2. Component Completeness
- [ ] All button variants are documented (primary, secondary, ghost, danger, complete, wizard)
- [ ] All form elements are documented (inputs, segmented, toggles, checkboxes, day buttons)
- [ ] All card/panel patterns are documented (settings panel, modal section, wizard card)

### 3. Design Principle Adherence
- [ ] No box-shadow used for hover states (should use tints)
- [ ] Purple (#6D5EF6) used for success states, not green
- [ ] Green only used for: (1) password strength meters (industry standard), (2) third-party brand icons
- [ ] Rounded corners (6-14px radius) used consistently

### 4. Cross-File Consistency
- [ ] Component specs in UI-KIT.md match actual CSS in source files
- [ ] HTML demo in ui-kit-reference.html renders components identically to app
- [ ] Color tokens in HTML demo match design tokens

### 5. Documentation Quality
- [ ] Each component has clear usage guidelines
- [ ] Best practices section covers important gotchas (focus states, touch targets)
- [ ] Mobile considerations are documented where relevant

## Specific Questions

1. **Focus States**: Does the documentation correctly explain the `filter: drop-shadow()` technique for focus states in scrolling containers?

2. **Wizard Buttons**: Are the gradient and glow specifications for wizard buttons accurate?

3. **Segmented Controls**: Are the impact and clarity color mappings correct?

4. **Toggle Switches**: Does the toggle animation specification match the actual CSS?

5. **Settings Panel**: Does the panel structure (header, body, rows) match the actual Settings page implementation?

## Expected Output

Please provide:
1. A summary of any discrepancies found
2. Specific CSS values that don't match
3. Missing components or patterns
4. Suggestions for improvement
5. Overall cohesiveness score (1-10) with justification
```

---

## How to Use

1. Start a new Claude chat
2. Paste the prompt above
3. Attach or provide contents of the referenced files
4. Review Claude's analysis for any issues

## Files to Provide

When running verification, provide contents of:
- `docs/brand/UI-KIT.md`
- `docs/brand/ui-kit-reference.html`
- `static/css/app.css` (first 200 lines for tokens)
- `static/css/dialog.css`
- `BRAND.md`

---

## Checklist for Manual Verification

After automated review, manually verify:

### Visual Check
1. Open `docs/brand/ui-kit-reference.html` in browser
2. Compare each component visually to the live app
3. Check hover/active states behave correctly
4. Verify colors match design tokens

### Cross-Reference Check
1. Open dev tools on live app
2. Inspect actual button/input/panel CSS
3. Compare values to UI-KIT.md documentation
4. Flag any mismatches

### Interaction Check
1. Test segmented control clicks in HTML demo
2. Test toggle switch animation
3. Verify checkbox check/uncheck
4. Confirm day button selection

---

*Created as part of Phase 2D: UI Kit implementation*
