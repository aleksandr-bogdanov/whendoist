---
version: v0.65.0
pr: 653
created: 2026-03-06
---

# Internationalization (i18n) — Multi-Language Support

## Context

Whendoist is currently English-only. All ~200 user-facing strings are hardcoded
across ~40 component/lib files, plus 265 toast calls across 32 files.

**Goal:** Add proper i18n with 7 languages (EN, DE, FR, ES, IT, PT, RU), auto-detection
of user language, and a settings page language switcher. Frontend-only — backend stays
English; frontend maps backend errors to translated strings.

---

## Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Library | `react-i18next` + `i18next` | Most mature, best dynamic switching, Tauri-transparent |
| File format | JSON (single namespace) | ~200 strings total — namespaces add complexity without benefit |
| Detection | localStorage → navigator.language → "en" | Works in browser + Tauri WKWebView/Android WebView |
| Date/time | `date-fns` locales + `Intl.DateTimeFormat` | Already using date-fns; Intl is native |
| Backend errors | Static mapping dict (EN detail → i18n key) | No backend changes needed; unmapped errors fall back to English |
| Fonts | Add Nunito Cyrillic subset for Russian | Nunito supports Cyrillic; browser auto-downloads via unicode-range |
| RTL | Not included | Not needed for current language set |

---

## New Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/lib/i18n.ts` | i18next init, language config, detection |
| `frontend/src/lib/date-locale.ts` | date-fns locale resolver from i18n language |
| `frontend/src/lib/error-mapping.ts` | Backend error detail → i18n key mapping |
| `frontend/src/locales/en.json` | English translations (source of truth) |
| `frontend/src/locales/de.json` | German |
| `frontend/src/locales/fr.json` | French |
| `frontend/src/locales/es.json` | Spanish |
| `frontend/src/locales/it.json` | Italian |
| `frontend/src/locales/pt.json` | Portuguese |
| `frontend/src/locales/ru.json` | Russian |
| `frontend/public/fonts/nunito-cyrillic.woff2` | Cyrillic font subset (download from Google Fonts) |
| `frontend/scripts/check-translations.ts` | CI script: verify all locale files have all keys |

---

## Files to Modify

### Infrastructure (Session 1)

| File | Changes |
|------|---------|
| `frontend/package.json` | Add `i18next`, `react-i18next`, `i18next-browser-languagedetector` |
| `frontend/src/main.tsx` | Add `import "@/lib/i18n"` at top; translate error component strings |
| `frontend/src/routes/__root.tsx` | Add `useDocumentLang()` hook to sync `document.documentElement.lang`; translate `RootErrorBoundary` strings via `i18n.t()` (class component) |
| `frontend/src/stores/ui-store.ts` | Add `locale: string` state + `setLocale` action; persist in `partialize`; action writes to both Zustand and `localStorage("whendoist-locale")` + calls `i18n.changeLanguage()` |
| `frontend/src/lib/errors.ts` | Convert `userMessage` from readonly props to getters calling `i18n.t()` |
| `frontend/src/lib/task-utils.ts` | Convert `IMPACT_LABELS`, `CLARITY_LABELS`, `formatDate()`, `formatDuration()` etc. to use `i18n.t()` |
| `frontend/src/lib/api-client.ts` | Translate toast messages (5 occurrences) |
| `frontend/src/lib/query-client.ts` | Translate fallback error toast (1 occurrence) |
| `frontend/src/lib/palette-commands.ts` | Translate command labels/keywords (5 occurrences) |
| `frontend/src/components/activity/activity-utils.ts` | Translate `FIELD_LABELS`, `CLARITY_LABELS`, `IMPACT_LABELS`, `describeActivity()`, `formatTimeAgo()` |
| `frontend/src/styles/fonts.css` | Add Cyrillic `@font-face` for Nunito |
| `frontend/src/hooks/use-voice-input.ts` | Default `lang` to i18n locale instead of `navigator.language` |
| `frontend/vite.config.ts` | Add `i18next`/`react-i18next` to `optimizeDeps.include` |

### Components Part 1 (Session 2)

| File | Changes |
|------|---------|
| `frontend/src/components/layout/header.tsx` | Translate `navTabs` labels (move inside component for `t()` access) |
| `frontend/src/components/layout/mobile-nav.tsx` | Translate nav item labels |
| `frontend/src/components/dashboard/energy-selector.tsx` | Translate "ENERGY" + level labels |
| `frontend/src/components/dashboard/sort-controls.tsx` | Translate sort field labels |
| `frontend/src/components/dashboard/pending-past-banner.tsx` | Translate banner + buttons |
| `frontend/src/components/dashboard/task-panel.tsx` | Translate section labels |
| `frontend/src/components/task/task-quick-add.tsx` | Translate placeholder, buttons, hints |
| `frontend/src/components/task/task-editor.tsx` | Translate "Edit/New Task", field labels, buttons |
| `frontend/src/components/task/task-item.tsx` | Translate context menu items, toasts (24 occurrences) |
| `frontend/src/components/task/task-edit-drawer.tsx` | Translate labels, toasts |
| `frontend/src/components/task/thought-triage-drawer.tsx` | Translate triage labels |
| `frontend/src/components/task/completed-section.tsx` | Translate section label |
| `frontend/src/components/task/deleted-section.tsx` | Translate section label |
| `frontend/src/components/task/scheduled-section.tsx` | Translate section label |
| `frontend/src/components/task/recurrence-picker.tsx` | Translate frequency labels |
| `frontend/src/components/task/attribute-pills.tsx` | Translate pill labels |
| `frontend/src/components/task/parent-task-picker.tsx` | Translate UI labels |
| `frontend/src/components/task/domain-group.tsx` | Translate labels, toasts |

### Components Part 2 (Session 3)

| File | Changes |
|------|---------|
| `frontend/src/components/search/search-palette.tsx` | Translate placeholder, labels |
| `frontend/src/components/search/palette-task-actions.tsx` | Translate action labels, toasts (12) |
| `frontend/src/components/batch/floating-action-bar.tsx` | Translate action labels |
| `frontend/src/components/batch/batch-edit-popover.tsx` | Translate form labels |
| `frontend/src/components/batch/batch-context-menu.tsx` | Translate menu items |
| `frontend/src/components/calendar/calendar-panel.tsx` | Translate calendar UI, toasts |
| `frontend/src/components/calendar/day-column.tsx` | Translate toasts (8) |
| `frontend/src/components/calendar/scheduled-task-card.tsx` | Translate toasts (8) |
| `frontend/src/components/calendar/anytime-task-pill.tsx` | Translate toasts (7) |
| `frontend/src/components/calendar/anytime-instance-pill.tsx` | Translate toasts (8) |
| `frontend/src/components/mobile/task-action-sheet.tsx` | Translate action labels, toasts (12) |
| `frontend/src/components/task/task-dnd-context.tsx` | Translate toasts (37 — largest single file) |
| `frontend/src/lib/batch-mutations.ts` | Translate toasts (15) |
| `frontend/src/hooks/use-task-form.ts` | Translate toasts (12) |
| `frontend/src/hooks/use-task-create.ts` | Translate toasts (3) |
| `frontend/src/hooks/use-network-status.ts` | Translate toasts (2) |
| `frontend/src/hooks/use-crypto.ts` | Translate toast (1) |
| `frontend/src/hooks/use-offline-sync.ts` | Translate toasts (2) |

### Settings + Routes (Session 4)

| File | Changes |
|------|---------|
| `frontend/src/routes/_authenticated/settings.lazy.tsx` | Translate all 50+ strings; **add LanguageSection** after theme section |
| `frontend/src/routes/_authenticated/analytics.lazy.tsx` | Translate stat labels, chart labels, range labels |
| `frontend/src/routes/_authenticated/thoughts.lazy.tsx` | Translate labels, `formatTimeAgo` |
| `frontend/src/routes/_authenticated/dashboard.lazy.tsx` | Translate labels, toasts |
| `frontend/src/routes/login.lazy.tsx` | Translate login page text |
| `frontend/src/components/wizard/onboarding-wizard.tsx` | Translate step labels, energy modes, domain suggestions |
| `frontend/src/components/encryption-unlock.tsx` | Translate dialog text, toasts |
| `frontend/src/components/demo-pill.tsx` | Translate "Demo", "Reset data", "Dismiss" |
| `frontend/src/components/shortcuts-help.tsx` | Translate shortcut descriptions |
| `frontend/src/components/gesture-discovery.tsx` | Translate gesture hints |

---

## Key Implementation Patterns

### In React components — use `useTranslation()` hook:
```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t("task.editor.editTask")}</h1>;
}
```

### In non-component code (errors.ts, utils, hooks) — import `i18n` directly:
```typescript
import i18n from "@/lib/i18n";
i18n.t("errors.networkOffline");
```

### For class-based error messages — use getters:
```typescript
export class NetworkError extends AppError {
  get userMessage() { return i18n.t("errors.networkOffline"); }
  readonly recoverable = true;
}
```

### For static label objects — convert to functions:
```typescript
// Before (breaks with i18n):
export const IMPACT_LABELS = { 1: "High", 2: "Mid", 3: "Low", 4: "Min" };

// After:
export function getImpactLabel(level: number): string {
  return i18n.t(`task.impact.${["", "high", "mid", "low", "min"][level]}`);
}
```

### For module-scope constants used in JSX — move inside component:
```typescript
// Before (module scope, can't use t()):
const navTabs = [{ to: "/dashboard", label: "TASKS" }];

// After (inside component):
function Header() {
  const { t } = useTranslation();
  const navTabs = [{ to: "/dashboard", label: t("nav.tasks") }];
}
```

### For backend error mapping:
```typescript
// error-mapping.ts
const BACKEND_ERROR_MAP: Record<string, string> = {
  "Task not found": "errors.backend.taskNotFound",
  "Encryption is already enabled": "errors.backend.encryptionAlreadyEnabled",
  // ...
};

export function translateBackendError(detail: string): string {
  const key = BACKEND_ERROR_MAP[detail];
  return key && i18n.exists(key) ? i18n.t(key) : detail;
}
```

### For date formatting with locale:
```typescript
import { getDateLocale } from "@/lib/date-locale";
import { format } from "date-fns";

format(date, "PPP", { locale: getDateLocale() });
// Also: date.toLocaleDateString(i18n.resolvedLanguage, { weekday: "short" });
```

---

## Settings Page Language Switcher

Add a `LanguageSection` component after the theme section:
- 2-column grid of language buttons
- Each shows native name (e.g., "Deutsch") with English name in parentheses
- Active language highlighted with `default` button variant
- Calls `setLocale(code)` from ui-store
- Import `SUPPORTED_LANGUAGES` from `@/lib/i18n`
- Icon: `Globe` from lucide-react

---

## i18n Initialization (`frontend/src/lib/i18n.ts`)

- Static import all 7 JSON locale files (total ~50KB uncompressed, negligible)
- Single `translation` namespace
- `i18next-browser-languagedetector` with order: `["localStorage", "navigator"]`
- localStorage key: `"whendoist-locale"` (separate from Zustand's `"whendoist-ui"`)
- `fallbackLng: "en"`, `escapeValue: false` (React handles XSS)
- Export `SUPPORTED_LANGUAGES` array with `code`, `name`, `nativeName`
- Export `SupportedLanguage` type

---

## Translation Key Structure

Flat dot-separated keys grouped by feature:

```
nav.*          — navigation tabs
energy.*       — energy selector labels
task.*         — task editor, quick-add, items, sections
sort.*         — sort controls
date.*         — relative dates, today/tomorrow/overdue
settings.*     — settings page sections
errors.*       — error messages (app + backend mapping)
common.*       — shared buttons (save, cancel, delete, edit)
toast.*        — toast notification messages
analytics.*    — analytics page labels
wizard.*       — onboarding wizard
shortcuts.*    — keyboard shortcut descriptions
login.*        — login page
app.*          — app-level (version update, error boundary)
```

---

## Cyrillic Font Support

Download Nunito Cyrillic variable font (woff2) from Google Fonts.
Add to `fonts.css`:
```css
@font-face {
  font-family: "Nunito";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic.woff2") format("woff2");
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
```

Browser only downloads this file when Cyrillic glyphs are rendered (Russian locale active).

---

## CI Translation Check

Add `frontend/scripts/check-translations.ts` — reads all locale JSONs, verifies every
key in `en.json` exists in all other locale files. Add to `package.json` as
`"check-translations"` script. Run in CI alongside TypeScript and Biome checks.

---

## Voice Input

Change default `lang` in `use-voice-input.ts` to derive from i18n:
```typescript
import i18n from "@/lib/i18n";
const SPEECH_LANG_MAP: Record<string, string> = {
  en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES",
  it: "it-IT", pt: "pt-BR", ru: "ru-RU",
};
// Use: lang ?? SPEECH_LANG_MAP[i18n.resolvedLanguage ?? "en"] ?? "en-US"
```

---

## Execution Sessions

Split into 4 sessions to manage context window:

1. **Foundation** — packages, i18n.ts, locales, store, main.tsx, __root.tsx, errors.ts, task-utils.ts, activity-utils.ts, api-client.ts, query-client.ts, palette-commands.ts, fonts.css, voice-input, vite.config
2. **Components Part 1** — layout (header, mobile-nav), dashboard, task components
3. **Components Part 2** — search, batch, calendar, mobile, DnD, hooks (batch-mutations, task-form, task-create, network-status, crypto, offline-sync)
4. **Settings + Routes** — settings (+ language switcher), analytics, thoughts, dashboard route, login, wizard, encryption-unlock, demo-pill, shortcuts-help, gesture-discovery, CI script

---

## Verification

After each session:
```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
```

After final session:
```bash
# Full check
cd frontend && npm run check-translations && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build

# Manual verification
# 1. Open app, go to Settings → Language, switch to each language
# 2. Verify nav tabs, task editor, dashboard, analytics update
# 3. Verify dates format correctly per locale
# 4. Verify Russian renders with proper Cyrillic glyphs
# 5. Switch to non-supported browser locale → verify fallback to English
```
