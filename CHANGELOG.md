# Changelog

All notable changes to Whendoist are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Recovery key generation during encryption setup (trigger 1password etc to save it)
- Redesign CMPCT view

### Known Issues
- Minor horizontal wordmark shift on external displays during font load (cosmetic only)

---

## [0.10.1] - 2026-01-21

### Summary
**UI Polish** — Wizard layout improvements, wordmark alignment fixes, and light/dark mode background consistency.

### Fixed

- **Wizard wordmark FOUC** — Prevented "flash of unstyled content" jump when Quicksand font loads by hiding wordmark until font is ready, then fading in
- **Wizard wordmark alignment** — Removed incorrect override that broke baseline alignment; wordmark now uses brand-specified 5px offset
- **Light/dark mode background mismatch** — Body and header backgrounds now consistently use `--bg-canvas` in both modes

### Changed

- **Wizard layout improvements:**
  - Reduced top padding (80px → 48px) for better vertical balance
  - Added styled welcome greeting (1.15rem, medium weight, muted color)
  - Tightened spacing between card and progress dots
  - Added panel bottom padding to push content higher

---

## [0.10.0] - 2026-01-21

### Summary
**Mobile Adaptation** — Comprehensive mobile experience with touch gestures, bottom sheets, service worker for offline support, and native-quality interactions.

### Added

- **Service Worker** (`sw.js`) — Offline caching with cache-first strategy for static assets, network-first for API
- **Mobile Tab Layout** — Tasks/Schedule tabs on mobile (< 900px) for full-screen views
- **Bottom Sheet Component** — iOS/Android-style slide-up modals with swipe-to-dismiss
- **Task Swipe Gestures** — Swipe right to complete, swipe left to delete with undo support
- **Long-Press Action Sheet** — Edit, Complete, Schedule, Delete actions via long-press
- **Haptic Feedback Engine** — Vibration patterns for touch interactions (success, warning, etc.)
- **Pull-to-Refresh** — Native mobile refresh pattern for task list
- **Gesture Onboarding** — First-time coachmarks explaining swipe gestures
- **Device Detection Utility** — Proper touch vs mouse preference detection (not just capability)
- **Dynamic Viewport Height** — CSS custom property `--vh` for true mobile viewport height
- **App Lifecycle Management** — Resume/pause handling with automatic data refresh
- **Network Status Indicators** — Online/offline state with toast notifications

### Changed

- **iOS Input Zoom Prevention** — All inputs use 16px minimum font size on touch devices
- **Reduced Motion Support** — All mobile animations respect `prefers-reduced-motion`

### Technical

- New files: `device-detection.js`, `haptics.js`, `mobile-sheet.js`, `mobile-tabs.js`, `mobile-core.js`, `task-swipe.js`, `mobile.css`, `sw.js`
- Service worker served from `/sw.js` with `Service-Worker-Allowed: /` header for full scope

---

## [0.9.6] - 2026-01-21

### Summary
**Documentation Cleanup** — Consolidated scattered documentation, archived planning docs, updated README as central hub.

### Changed

- **README.md** — Added Documentation section with links to all permanent docs
- **CLAUDE.md** — Simplified design system references, removed deprecated doc pointers

### Removed

- **DESIGN.md** — Legacy file, superseded by `docs/brand/*`
- **5 planning docs** — Moved to `docs/archive/` (DESIGN-IMPLEMENTATION-PLAN, DESIGN-REVAMP-PLAN, IMPLEMENTATION-PROMPT, VISUAL-REDESIGN-PLAN, VISUAL-REDESIGN-STRUCTURAL)

### Added

- **docs/archive/** — New folder for historical planning documents with README index

---

## [0.9.5] - 2026-01-21

### Summary
**Visual Polish** — CSS refinements, template cleanup, improved hover states and transitions.

---

## [0.9.4] - 2026-01-21

### Summary
**Design System Infrastructure** — Token migration, dark mode support, icon sprite integration, accessibility improvements, and brand alignment. This release establishes the foundation for future visual redesigns.

### Added

- **Icon sprite system** — Templates now use `<use href="/static/img/icons/ui-icons.svg#icon-name"/>` for efficient icon loading
- **21 empty-state illustrations** wired into templates (Tasks, Thoughts, Analytics, Wizard)
- **Skip-to-content link** for keyboard navigation accessibility
- **ARIA labels** on all icon buttons and form inputs
- **`prefers-reduced-motion`** support across all CSS animations

### Changed

- **Token migration** — All CSS files now use semantic tokens (`--bg-canvas`, `--text-primary`, etc.) instead of legacy names
- **Dark mode** — Full `[data-theme="dark"]` support across all pages and components
- **Success states** — Replaced green with purple for completion indicators (brand alignment)
- **Wordmark** — Updated to W icon + "hendoist" with correct sizing per BRAND.md
- **Hardcoded colors** — Replaced all `#fff`, `#000`, and `rgba(15,23,42,...)` with token references
- **ApexCharts** — Theme updates automatically on dark mode toggle

### Fixed

- **Contrast ratios** — All text meets WCAG AA (Primary 17.5:1, Secondary 4.5:1)
- **Focus indicators** — Every interactive element has visible focus state

### Documentation

- **docs/DESIGN-REVAMP-PLAN.md** — Complete implementation checklist for design system
- **static/css/components/icons.css** — Icon utility classes

---

## [0.9.3] - 2026-01-20

### Summary
**UI Icon System (Phase 2F)** — 70+ unified SVG icons for UI actions, navigation, objects, status, and features.

### Added

- **70+ stroke-based SVG icons** in `static/img/icons/ui-icons.svg`:
  - Actions (14): edit, delete, trash, close, plus, minus, check, copy, download, upload, refresh, undo, redo, save
  - Navigation (14): menu, menu-dots, chevrons, arrows, external-link, logout, home
  - Objects (13): calendar, clock, task, task-list, folder, lock, unlock, key, shield, user, file, image
  - Status (7): spinner, check-circle, x-circle, alert-circle, alert-triangle, info, help-circle
  - Features (14): energy, thought, lightbulb, analytics, chart-pie, settings, search, filter, sort, tag, star, repeat
  - Misc (14): link, eye, eye-off, archive, inbox, bell, sun, moon, cloud, database, grid, list, maximize, minimize
  - Brand (2): w-icon, google

- **Interactive icon reference** — `docs/brand/icon-reference.html`:
  - Category tabs with icon counts
  - Click-to-copy with toast feedback
  - Multiple output formats (inline SVG, sprite, CSS)
  - Live style guide with size demos

- **SVG sprite system** — Use `<use href="/static/img/icons/ui-icons.svg#icon-name"/>` for efficient icon loading

### Changed

- **BRAND.md** — Updated to v1.6 with Phase 2F documentation, icon style guide, and usage examples

---

## [0.9.2] - 2026-01-20

### Summary
**Brand System Complete (Phases 2B-2E)** — Marketing assets, color system, UI kit, and illustration library.

### Added

#### Phase 2B: Marketing Assets
- **Social media profiles** — 400, 200, 128px + dark variant in `static/img/`
- **Social media posts** — Square, landscape, feature, story templates
- **Email headers** — 600×200, 600×150, 600×300 banners
- **Press kit** — High-res logos, icon, color reference
- **Marketing export tool** — `docs/brand/marketing-export.html`
- **Press kit documentation** — `docs/brand/PRESS-KIT.md`

#### Phase 2C: Color System
- **Color reference tool** — `docs/brand/color-reference.html` with interactive palette
- **Color system docs** — `docs/brand/COLOR-SYSTEM.md` with full token documentation
- **WCAG AA verification** — Accessibility-checked color combinations

#### Phase 2D: UI Kit
- **UI kit reference** — `docs/brand/ui-kit-reference.html` with live components
- **UI kit documentation** — `docs/brand/UI-KIT.md` with button, form, card patterns
- **Verification tool** — `docs/brand/UI-KIT-VERIFICATION.md`
- **Brand consistency checker** — `docs/brand/brand-verification.html`

#### Phase 2E: Illustration System
- **21 brand-consistent illustrations** in `static/img/illustrations/`:
  - Empty states (6): tasks, thoughts, calendar, analytics, search, inbox
  - Error states (5): connection, sync, generic, auth, calendar
  - Success states (5): complete, allclear, connected, setup, encrypted
  - Onboarding (4): welcome, time, energy, organize
  - Actions (1): import-data (for Todoist import wizard step)
- **Illustration reference** — `docs/brand/illustration-reference.html`

### Changed

- **onboarding-welcome.svg** — Redesigned: W icon with "Hi!" speech bubble (replaced problematic hand gesture)
- **BRAND.md** — Updated to v1.5 with all phases documented

### Fixed

- **6 illustration descriptions** in BRAND.md — Removed references to non-existent sparkles/elements

---

## [0.9.1] - 2026-01-19

### Summary
**App Icon Suite (Phase 2A)** — Complete icon set for all platforms with PNG export tool.

### Added

- **Maskable icon SVG** — `app-icon-maskable.svg` with 80% safe zone for Android adaptive icons
- **PNG export tool** — Enhanced `docs/brand/png-export.html` generates 30+ icon variants:
  - PWA icons (512, 384, 256, 192)
  - Maskable icons (512, 384, 192)
  - Apple touch icons (180, 167, 152, 120, 76)
  - Favicons (48, 32, 16)
  - W icon transparent variants (512, 256, 128, 64)
  - Wordmarks (light/dark at 800/400)
  - Social media (OG 1200×630, Twitter 1200×600, App Store 1024)
  - ZIP download with organized folders

- **Complete icon files** — All PNG icons in `static/img/`
- **PWA manifest update** — Separate maskable and standard icon declarations
- **HTML meta tags** — Apple touch icons, Open Graph, Twitter Card

### Changed

- **BRAND.md** — Added complete App Icon Suite documentation (Phase 2A complete)

---

## [0.9.0] - 2026-01-17

### Summary
**WhenWizard Onboarding + Landing Animation** — New first-run onboarding wizard and polished landing page with task→calendar transfer animation.

### Added

- **WhenWizard onboarding flow** — 8-step guided setup for new users:
  - Welcome, Energy Modes, Calendar Connection, Calendar Selection
  - Todoist Import, Domain Setup, Security (encryption + passkeys), Ready
  - State persistence via localStorage, OAuth return handling
  - Mobile-first responsive design with swipe navigation

- **Landing page task→calendar animation** — Single 6-second looping animation:
  - Ghost chip travels from task list to calendar slot
  - Arrow intent pulse only during chip travel
  - Calendar focus ring expand+fade on arrival
  - Single checkbox tick with bounce effect
  - Respects `prefers-reduced-motion` accessibility

### Changed

- **Diffused shadows** — Wizard cards and buttons use layered box-shadows for soft, feathered edges (no hard borders)
- **Energy mode preview** — Default "Normal" mode correctly hides exploratory tasks on initial render

### Fixed

- **Energy mode default state** — Preview tasks now filter correctly on first load (exploratory task hidden by default in Normal mode)

---

## [0.8.13] - 2026-01-15

### Summary
**Hotfix: Recurring Task Completion + Passkey RPID** — Fixes Complete button showing wrong state for recurring tasks, and passkey registration failing on mobile browsers.

### Fixed

- **Recurring task completion in dialog** — Complete button now correctly reflects today's instance state:
  - Added `today_instance_completed` field to TaskResponse API
  - Dialog checks this field for recurring tasks instead of task.status
  - Sends `target_date` in toggle-complete request
  - Shows "Instance completed/reopened" toast for recurring tasks

- **Passkey RPID mismatch on iPhone Chrome** — Passkey registration failed with "RPID did not match origin":
  - Now automatically derives `passkey_rp_id` from `BASE_URL` hostname
  - No longer requires explicit `PASSKEY_RP_ID` environment variable in production
  - Note: Existing passkeys registered with wrong RPID need to be re-registered

### Added

- 16 new tests in `test_hotfix_0_8_13.py` covering both fixes

---

## [0.8.12] - 2026-01-15

### Summary
**Hotfix: DateTime Serialization** — Fixes v0.8.11 regression where analytics page crashed due to datetime JSON serialization error.

### Fixed

- **Analytics page 500 error** — `TypeError: Object of type datetime is not JSON serializable`:
  - v0.8.11 added `{{ recent_completions | tojson }}` but `completed_at` was a datetime object
  - Now pre-formats datetime to display string in the service (`completed_at_display`)
  - Removes datetime object after sorting, before returning

---

## [0.8.11] - 2026-01-15

### Summary
**Hotfix: Recurring Tasks Decryption** — Fixes v0.8.9/10 bug where recurring task titles still showed encrypted gibberish.

### Fixed

- **Recurring task titles not decrypting** — Changed from DOM-based to JS data-based decryption:
  - v0.8.9/10 read encrypted text from `el.textContent` (DOM)
  - Now reads from `stats.recurring_stats[]` JavaScript data (same pattern as working domain chart)
  - Also updated recent completions to use `recentCompletions[]` JS data for consistency
  - All three encrypted sections (completions, recurring, domains) now use the same reliable pattern

### Root Cause Analysis

The DOM-based approach (`el.textContent`) was unreliable while the JS data approach (reading from serialized JSON) worked consistently. This is why domain chart worked (used JS data) but recurring tasks didn't (used DOM content).

---

## [0.8.10] - 2026-01-15

### Summary
**Hotfix: Analytics Chart Decryption** — Fixes v0.8.9 bug where domain chart wasn't updating with decrypted labels.

### Fixed

- **Domain chart not decrypting** — ApexCharts instances aren't stored on DOM elements:
  - v0.8.9 tried to access `chartEl._chart` which doesn't exist
  - Now properly stores chart instance in variable and calls `updateOptions()` on it
  - Domain names now correctly decrypt in the "By Domain" donut chart

### Why v0.8.9 Tests Didn't Catch This

Contract tests verify code EXISTS in files (string matching), not that it WORKS at runtime:
- Test checked for `domainChart.updateOptions` string → passed
- But `chartEl._chart` code path was broken (ApexCharts doesn't work that way)
- Need E2E tests with real browser to catch JavaScript runtime bugs

---

## [0.8.9] - 2026-01-15

### Summary
**Hotfix: Passkey Invalidation + Analytics Decryption** — Fixes two encryption-related bugs: passkeys becoming invalid after password change, and analytics page showing encrypted gibberish.

### Fixed

- **Passkeys invalid after password change** — When changing encryption password, old passkeys now deleted:
  - User disables encryption → deletes all passkeys
  - User re-enables with new password → no stale passkeys remain
  - Prevents "Invalid passkey - unable to decrypt data" errors
  - Old passkeys had `wrapped_key` values that wrapped the OLD master key

- **Analytics showing encrypted gibberish** — Analytics page now decrypts encrypted data:
  - Recent completions now show decrypted task titles
  - Recurring task completion section now decrypts task titles
  - Domain chart now shows decrypted domain names
  - Added `looksEncrypted()` helper and `decryptAnalyticsData()` function

### Added

- **9 Hotfix Tests** (`tests/test_hotfix_0_8_9.py`):
  - `TestPasskeyDeletionOnEncryptionDisable` — Verifies passkeys are deleted when encryption disabled
  - `TestAnalyticsDecryptionContract` — Verifies analytics.html has decryption logic

---

## [0.8.8] - 2026-01-15

### Summary
**Hotfix: Double Encryption Prevention** — Fixes bug where items created before enabling encryption appeared as gibberish (double-encrypted) after import.

### Fixed

- **Double encryption of pre-existing data** — Items created before enabling encryption were being encrypted again during import:
  - User creates items (plaintext) → enables encryption → items encrypted → import triggers `encryptAllData()` → items encrypted AGAIN
  - `encryptAllData()` now uses `looksEncrypted()` helper to skip already-encrypted data
  - Prevents double encryption that made content unreadable

### Added

- **Hotfix Tests** (`tests/test_hotfix_0_8_8.py`):
  - `TestDoubleEncryptionPrevention` — Verifies `encryptAllData()` skips already-encrypted values

---

## [0.8.7] - 2026-01-15

### Summary
**Hotfix: Thoughts + Connection Resilience + Logging** — Extends plaintext decryption fix to Thought Cabinet, adds connection resilience for batch operations, and cleans up error logging.

### Fixed

- **Thought Cabinet showing locks for plaintext data** — Same `looksEncrypted()` fix applied:
  - Thoughts imported from Todoist showed 🔒 instead of text
  - Added error fallback to display original value on decryption failure

- **Database connection drops during batch update** — More resilient batch operations:
  - Commits every 25 tasks (instead of at end) to keep transactions short
  - Individual item failures no longer fail the entire batch
  - Returns partial results with error details when some items fail

- **Verbose error logging** — Cleaner exception output:
  - Shows only app code frames (max 5), filters out library internals
  - Database connection errors get special concise format
  - Truncates long error messages to 200 chars

### Added

- **10 Hotfix Tests** (`tests/test_hotfix_0_8_7.py`):
  - `TestThoughtsDecryptionContract` — Verifies thoughts.html handles plaintext data
  - `TestBatchUpdateResilience` — Verifies batch endpoints commit incrementally
  - `TestLoggingFormat` — Verifies clean exception formatting

---

## [0.8.6] - 2026-01-15

### Summary
**Hotfix: Plaintext Display with Encryption Enabled** — Fixes bug where task list and domain names showed lock icons (🔒) instead of actual content when encryption was enabled but data was still plaintext.

### Fixed

- **Task list showing locks for plaintext data** — Tasks now display correctly after import:
  - When encryption_enabled=true but data is plaintext, decryption returned same value
  - Old code skipped UI update when decrypted === original, leaving 🔒 visible
  - Added `looksEncrypted()` helper to detect actually encrypted data (base64, min 38 chars)
  - Plaintext data now displays directly without decryption attempt

- **Domain names showing locks** — Same fix applied to Settings page:
  - Domain name decryption had identical bug
  - Added error fallback to display original value on decryption failure

### Added

- **12 Hotfix Tests** (`tests/test_hotfix_0_8_6.py`):
  - `TestDashboardDecryptionContract` — Verifies dashboard handles plaintext data correctly
  - `TestSettingsDecryptionContract` — Verifies settings handles plaintext domain names
  - `TestLooksEncryptedContract` — Verifies the helper function logic (min length, base64 format)

---

## [0.8.5] - 2026-01-15

### Summary
**Hotfix: Encryption & Import Fixes** — Fixes critical bug where encrypted task data exceeded database column limits, plus related import and redirect issues.

### Fixed

- **Encrypted data truncation** — Task.title and Domain.name columns changed from VARCHAR to TEXT:
  - Encrypted data is ~1.4x larger than plaintext (base64 encoding + IV + auth tag)
  - VARCHAR(500) was too small for encrypted task titles
  - VARCHAR(255) was too small for encrypted domain names

- **Todoist OAuth redirect** — Now returns to /settings instead of /dashboard:
  - Users connect Todoist from Settings page and expect to return there

- **Import encryption for domains** — Import now encrypts both tasks AND domains:
  - Previously only tasks were batch-updated, leaving domains as plaintext
  - Added proper error handling and reporting for encryption failures

- **Verbose error traces** — Suppressed uvicorn's duplicate stderr logging:
  - Custom exception formatter already provides clean output
  - Uvicorn's verbose tracebacks now suppressed via `uvicorn.error` log level

### Added

- **8 Hotfix Tests** (`tests/test_hotfix_0_8_5.py`):
  - `TestEncryptedColumnTypes` — Verifies Task.title and Domain.name use TEXT
  - `TestTodoistOAuthRedirect` — Verifies callback redirects to /settings
  - `TestImportEncryptionContract` — Verifies import encrypts domains and handles errors
  - `TestEncryptedContentStorage` — Integration tests for long encrypted strings

---

## [0.8.4] - 2026-01-15

### Summary
**Passkey Unlock for E2E Encryption** — Unlock encrypted data with 1Password, Touch ID, Windows Hello, or hardware security keys using WebAuthn PRF extension.

### Added

- **Passkey Registration** — Register passkeys in Settings → Security:
  - Add unlimited passkeys (1Password, Touch ID, YubiKey, etc.)
  - Each passkey shown with name and date added
  - Remove individual passkeys without affecting others
  - Must be unlocked (via passphrase or existing passkey) to add new passkeys

- **Passkey Unlock** — Authenticate with passkey on page load:
  - "Unlock with Passkey" button in unlock modal (when passkeys exist)
  - Passphrase fallback always available
  - Automatic retry with correct wrapped key if wrong credential selected

- **Lock Status** — New UI in Settings → Security:
  - Shows 🔓 Unlocked / 🔒 Locked status
  - "Re-authenticate" button to re-enter passphrase or use passkey

- **49 Passkey Tests** (`tests/test_passkey.py`):
  - `TestPasskeyServiceBasics` — CRUD operations
  - `TestPasskeyServiceList` — Listing and ordering
  - `TestPasskeyServiceGet` — Retrieval with ownership check
  - `TestPasskeyServiceDelete` — Deletion and unlock method updates
  - `TestPasskeyMultitenancy` — **CRITICAL**: User isolation verification
  - `TestPasskeyDataModel` — wrapped_key architecture verification
  - `TestPasskeyJSModuleAPI` — passkey.js exports
  - `TestPasskeyJSKeyWrapping` — Key wrapping architecture
  - `TestPasskeyJSRegistrationFlow` — Registration contract
  - `TestPasskeyJSAuthenticationFlow` — Authentication contract
  - `TestPasskeyJSErrorHandling` — Error return format
  - `TestPasskeyJSDocumentation` — Architecture docs
  - `TestPasskeyAPIContract` — API endpoint paths

### Technical

#### Key Wrapping Architecture (CRITICAL)

Each passkey wraps the **same master key**, not its own derived key:

```
Master Key (from PBKDF2 passphrase)
├── Passkey A → PRF → Wrapping Key A → encrypt(Master Key) → stored
├── Passkey B → PRF → Wrapping Key B → encrypt(Master Key) → stored
└── Master Key → encrypts actual data (tasks, domains)
```

This ensures all passkeys unlock the same encrypted data.

#### New Files

| File | Purpose |
|------|---------|
| `app/services/passkey_service.py` | WebAuthn credential management |
| `app/routers/passkeys.py` | REST API for passkey operations |
| `static/js/passkey.js` | Client-side WebAuthn + PRF + key wrapping |
| `tests/test_passkey.py` | 49 comprehensive tests |

#### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/passkeys/register/options` | POST | Get WebAuthn registration options |
| `/api/passkeys/register/verify` | POST | Verify and store passkey credential |
| `/api/passkeys/authenticate/options` | POST | Get authentication options |
| `/api/passkeys/authenticate/verify` | POST | Verify passkey authentication |
| `/api/passkeys/by-credential/{id}` | GET | Look up passkey by credential ID |
| `/api/passkeys` | GET | List user's passkeys |
| `/api/passkeys/{id}` | DELETE | Delete a passkey |

#### Model Changes

- **New**: `UserPasskey` model with `wrapped_key` field (not `encryption_test_value`)
- **Updated**: `UserPreferences.encryption_unlock_method` — 'passphrase', 'passkey', or 'both'
- **Updated**: `User.passkeys` relationship

### Security

- **Multitenancy Isolation**: All passkey operations verify `user_id` ownership
- **Credential Revocation**: Deleted passkeys cannot be used (server controls `allowCredentials`)
- **Key Verification**: Unwrapped master key verified against global test value before use
- **No Server-Side Key Storage**: Server only stores wrapped keys, never the master key

### WebAuthn Flow

**Registration:**
1. User unlocks with passphrase (or existing passkey)
2. User clicks "Add Passkey" in Settings
3. Browser prompts for biometric/security key
4. PRF extension derives wrapping key from passkey
5. Client wraps master key with wrapping key
6. Server stores credential + wrapped_key

**Authentication:**
1. User visits page with encryption enabled
2. Unlock modal shows "Unlock with Passkey" (if passkeys exist)
3. Browser prompts for biometric/security key
4. PRF extension derives wrapping key
5. Client unwraps master key
6. Client verifies key against test value
7. Master key stored in sessionStorage

---

## [0.8.3] - 2026-01-15

### Summary
**E2E Encryption Rewrite** — Complete rewrite of the encryption architecture from per-record flags to a global toggle model. Includes comprehensive tests for multitenancy isolation and domain name encryption.

### Changed

- **Global Toggle Model** — Replaced per-record encryption flags (`title_encrypted`, `description_encrypted`, `name_encrypted`) with a single global toggle (`encryption_enabled`). When enabled, ALL task titles, descriptions, and domain names are encrypted; when disabled, ALL data is plaintext. No mixed state possible.

- **Domain Name Encryption** — Domain/project names are now encrypted alongside task content:
  - Task list shows 🔒 placeholder when encrypted
  - Decryption happens on page load via `crypto.js`
  - Settings page domain CRUD functions encrypt/decrypt names

- **Batch Update Endpoints** — New endpoints for enable/disable encryption operations:
  - `GET /api/tasks/all-content` — Fetch all tasks and domains for batch encrypt/decrypt
  - `POST /api/tasks/batch-update` — Update multiple tasks in one request
  - `POST /api/domains/batch-update` — Update multiple domains in one request

### Added

- **48 Comprehensive Encryption Tests** (`tests/test_encryption.py`):
  - `TestEncryptionPreferences` — Enable/disable encryption state
  - `TestEncryptionMultitenancy` — **CRITICAL**: User isolation verification
  - `TestEncryptionDataIsolation` — Query scoping for all-content endpoint
  - `TestCryptoModuleExportsAPI` — crypto.js exports required functions
  - `TestCryptoModuleArchitecture` — Verifies AES-GCM, PBKDF2, sessionStorage
  - `TestCryptoModuleIntegration` — Templates use Crypto correctly
  - `TestEncryptionFlows` — Enable/disable encryption workflows
  - `TestEncryptionEdgeCases` — Empty batch, nonexistent IDs, re-enable
  - `TestEncryptionDataModel` — No per-record flags (global toggle only)

- **Encryption Documentation**:
  - `README.md` — User-facing encryption explanation with database examples
  - `DESIGN.md` — Full architecture documentation with flow diagrams
  - `tests/README.md` — Encryption test documentation
  - `CLAUDE.md` — Constraints and must-haves for future development

### Removed

- **Per-Record Encryption Flags** — Removed from models:
  - `Task.title_encrypted`
  - `Task.description_encrypted`
  - `Domain.name_encrypted`

### Technical

- Added `window.WHENDOIST` global config in `base.html` for encryption state
- Updated all task list partials (`_task_list.html`, `_scheduled_tasks.html`, `_completed_tasks.html`, `_deleted_tasks.html`) with `data-domain-name` attribute for JS decryption
- Updated `dashboard.html` with domain name decryption on page load
- Updated `settings.html` domain CRUD with encryption/decryption
- Updated `task-dialog.js` `loadDomains()` to decrypt domain names
- Fixed route ordering: `/api/tasks/all-content` must be defined before `/{task_id}`

### Security

- All batch update endpoints verify task/domain ownership via `user_id` filter
- `get_task(id)` and `get_domain(id)` return `None` for IDs not owned by authenticated user
- Batch updates silently skip unowned IDs (no error, no modification)

---

## [0.8.2] - 2026-01-13

### Fixed

- **OAuth Callback Error** — Fixed global exception handler catching HTTPException, which broke OAuth redirects (Todoist connect showed "Internal server error" even though it worked)

---

## [0.8.1] - 2026-01-13

### Summary
**Hotfix** — Improved logging and fixed database connection pool issues.

### Fixed

- **Database Connection Stability** — Fixed "connection is closed" errors:
  - Added `pool_pre_ping=True` to detect and recycle stale connections
  - Added `pool_recycle=300` to refresh connections every 5 minutes
  - Configured proper `pool_size` and `max_overflow` settings
- **Clean Exception Logging** — Readable tracebacks instead of wall of text:
  - Filters out library internals, shows only app code
  - Clean box format with exception type, message, and traceback
  - Global exception handler returns proper 500 JSON response
- **Quieter Logs** — Reduced noise from asyncpg and uvicorn.access loggers

---

## [0.8.0] - 2026-01-11

### Summary
**E2E Encryption & Polish** — Optional end-to-end encryption for task data, polished Todoist import with preview, Plan My Day undo, compact task modal, and various UX improvements.

### Added

- **E2E Encryption** — Optional end-to-end encryption for task data:
  - Uses Web Crypto API with AES-256-GCM encryption
  - PBKDF2 key derivation from user passphrase (100,000 iterations, SHA-256)
  - Key stored in sessionStorage (cleared on logout/tab close)
  - Security panel in Settings to enable/disable encryption
  - Passphrase unlock modal on page load when encryption is enabled
  - Encryption salt and test value stored in UserPreferences
- **Todoist Import Preview** — Preview dialog before importing from Todoist:
  - Shows project count, task count, subtask count, completed count
  - Option to include/exclude completed tasks
  - Cancel or proceed with import
- **Plan My Day Undo** — Toast with undo button after auto-scheduling tasks
  - Stores original state (scheduled date/time) before scheduling
  - Restores original state when undo clicked
- **Cancel Button** — Task dialogs now have Cancel + primary action buttons
- **External Created At** — `external_created_at` field on Task model for preserving Todoist creation dates
- **Code Provenance** — Verify that deployed code matches GitHub source:
  - Build Provenance panel in Settings with version/commit info
  - "Verify Build" modal with file hashes and verification instructions
  - GitHub Actions release workflow with artifact attestations
  - SHA256 hashes for all static files, SRI hashes for key files
  - Build manifest at `static/build-manifest.json`
  - API endpoints: `/api/build/info`, `/api/build/verify`, `/api/build/hashes`

### Changed

- **Compact Task Modal** — Reduced padding, heights, and made form more compact
- **Scheduled Task Separation** — Scheduled tasks appear below unscheduled in Task List
  - Scheduled tasks have dashed border and muted styling
- **Recurring Task Completion** — Fixed Complete button in Edit Task modal to properly toggle today's instance
- **Analytics Domain Chart** — Removed Inbox from domain pie chart
- **Analytics Task Age** — Now uses `external_created_at` (Todoist creation date) when available

### Technical

- Added `crypto.js` for client-side encryption/decryption
- Added `encryption_enabled`, `encryption_salt`, `encryption_test_value` to UserPreferences
- Added `/api/preferences/encryption` endpoints (GET status, POST setup, POST disable)
- Added `get_encryption_context()` helper to pass encryption settings to all templates
- Added passphrase unlock modal to base template
- Added `get_or_create_today_instance()` to RecurrenceService for recurring task completion
- Updated toggle-complete API endpoint to handle recurring tasks
- Added preview endpoint `/api/import/todoist/preview` with ImportPreviewResponse
- Added ImportOptions model with `include_completed` and `completed_limit`
- Added `external_created_at` field to Task model and backup service
- Modified task ordering with SQLAlchemy CASE expression for schedule-based sorting
- Added `.btn-secondary` CSS class to dialog.css
- Added `build_info.py` router with `/api/build/info`, `/api/build/verify`, `/api/build/hashes` endpoints
- Added `scripts/generate-build-manifest.py` for build artifact generation
- Added `.github/workflows/release.yml` for automated releases with signed tags and attestations
- Settings page now includes Build Provenance panel with version info and Verify Build modal

---

## [0.7.0] - 2026-01-11

### Summary
**Task Completion Features** — Visual aging for completed tasks, user preferences for task display, comprehensive Analytics dashboard, Todoist API v1 migration with completed task import, and JSON backup/restore.

### Added

- **Backup & Restore** — Export and import all user data as JSON from Settings page
  - Download backup with timestamped filename
  - Restore from backup file (replaces all existing data)
  - Includes domains, tasks, task instances, and preferences
- **Task Completion Visibility** — Completed tasks remain visible for a configurable retention window (1/3/7 days) in both Task List and Calendar
- **Visual Aging** — Completed tasks fade based on completion time:
  - Today: greyed text with strikethrough
  - Older: muted grey (70% opacity) with strikethrough
- **Analytics Dashboard** — Comprehensive statistics page with ApexCharts visualizations:
  - Overview stats: completed, pending, completion rate, current streak
  - Daily completions bar chart
  - Domain breakdown donut chart
  - Best days (day of week) distribution
  - Active hours (hour of day) area chart
  - GitHub-style contribution heatmap (12 weeks)
  - Impact distribution (P1-P4 breakdown)
  - Velocity trend with 7-day rolling average
  - Task aging distribution
  - Recurring task completion rates
  - Recent completions log
  - Date range selector (7D / 30D / 90D)
- **Completed Tasks Settings** — Simplified settings panel:
  - **Show in Task List** — Toggle visibility of completed tasks in Task List (Calendar always shows them as history)
  - **Keep visible for** — Retention window (1/3/7 days) applies to both Task List and Calendar
  - **Position in Task List** — Move completed to bottom or keep in place
  - **Hide recurring after completing today** — For clean "remaining work only" view
- **Todoist Completed Task Import** — Import recently completed tasks for analytics history
- **User Preferences Model** — Backend storage for task display preferences

### Changed

- **Todoist API Migration** — Migrated from REST API v2 to API v1 for all operations
- **Recurring tasks in left panel** — Now show "done today" state when instance is completed
- **Calendar** — Always shows completed tasks (within retention window) since it's historical data
- **Completed task opacity** — Changed from 25% to 70% for better readability
- **Navigation** — Added Analytics to header nav, renamed CSS classes from `space-item` to `nav-item`

### Technical

- Migrated `TodoistClient` to Todoist API v1:
  - Changed base URL from `rest/v2` to `api/v1`
  - Updated pagination to cursor-based (`next_cursor`)
  - Labels now returned as names directly (not IDs)
  - Added `get_completed_tasks()` method
- Added `UserPreferences` model with 4 task display preferences
- Added `PreferencesService` for preference CRUD
- Added `AnalyticsService` with comprehensive statistics methods
- Added `/api/preferences` endpoints (GET/PUT)
- Added `/analytics` page route
- Added `completion_age_class` to task items for CSS styling
- Added clarity parsing from completed task content (`@executable`, `@defined`, `@exploratory`)
- Removed `url` field from `TodoistTask` (not available in API v1)
- Integrated ApexCharts for all analytics visualizations
- Added `BackupService` for data export/import
- Added `/api/backup/export` and `/api/backup/import` endpoints

---

## [0.6.0] - 2026-01-06
Fixed:
2+ anytime tasks make the 'yesterday' shift calendar down comparing to the next day (when scrolled horizontally)
Redesigned Settings page to match new design language
Redesigned FAB button to match new design language
Dynamic Add task for Domain section footers.
added support 'complete task'

### Summary
Redesigned **Thought Cabinet** page to match the Tasks page aesthetic. Establishes visual consistency across the app with shared typography, layout patterns, and interaction states.

### Added

- **Thought Cabinet page** — Quick capture for ideas, tasks, and notes
  - Capture input with keyboard hint (Enter to capture)
  - Thoughts list panel with dense row styling
  - Promote to Task action (opens task dialog)
  - Delete with undo toast (5-second grace period)
  - Empty state messaging

### Changed

- **Page layout** — Full-width grey surface with centered content (1180px max-width, same as Tasks)
- **Typography** — ALL CAPS system with proper letter-spacing matching Tasks headers
- **Title plate** — Subtle white background with hairline border
- **Panel styling** — Same 12px border-radius and surfaces as Tasks panels
- **Row density** — Compact rows (12px 16px padding) with border-bottom dividers
- **Actions** — Hidden until hover with pointer-events control
- **Capture card** — Centered at 860px max-width with keycap hint styling

### Design Patterns

- `.page-surface` — Shared grey background container (used across all pages)
- `.thoughts-container` — Centered max-width wrapper (matches Tasks)
- `.thought-row` — Dense row with inset dividers, hover tint, hidden actions
- Responsive breakpoints at 900px and 600px

---

## [0.5.0] - 2026-01-05

### Summary
Major UI polish release focused on the **Tasks page**. Establishes a calm, enterprise-grade aesthetic with improved information hierarchy, tint-based interactions, and a consistent visual grammar across task list and calendar.

### Added

- **Grid-based task layout** — Duration, Impact, and Clarity in fixed-width columns with proper alignment
- **Column separators in header** — Vertical lines centered in column gaps (header only, not rows)
- **Inset row dividers** — Separator lines start after the impact rail, not cutting through it
- **Hour banding on calendar** — Alternating row backgrounds for easier scanning
- **Major hour lines** — Stronger border every 2 hours for visual rhythm
- **Time axis gutter** — 54px label column with right-aligned tabular numbers

### Changed

- **Task row hover** — Now uses neutral slate tint instead of purple wash
- **Selection state** — Purple tint reserved exclusively for selected items
- **Impact rail** — Implemented as pseudo-element for cleaner rendering
- **Day separator** — Changed from heavy slab to subtle line + centered pill
- **Anytime lane** — Tray-style container with white task cards inside
- **Text contrast** — Bumped all text colors for better readability
- **Border system** — Refined 3-tier hierarchy (hair/normal/strong)
- **Sort header** — Removed rounded border, text color only for active state
- **Column widths** — Duration 68px, Impact 56px, Clarity 80px, Gap 12px

### Fixed

- **Calendar cell width** — No longer expands with long task text (min-width: 0)
- **Tasks spanning day separator** — Duration display now correct across boundaries
- **Trash bin drop zone** — Active area covers entire button, not just top portion
- **Scheduled task positioning** — Removed conflicting position: relative override
- **Drag rescheduling** — Tasks no longer disappear during calendar drag operations

### Design System

See [DESIGN.md](./DESIGN.md) for comprehensive documentation of the Tasks page design patterns.

---

## [0.4.0] - 2026-01-04

### Added

- **Native task management** — Create, edit, and delete tasks directly in Whendoist
  - Task dialog with title, description, schedule, due date, duration, impact, and clarity
  - Recurrence picker for repeating tasks (daily, weekly, monthly, custom)
  - Delete button in edit dialog
- **Drag-to-trash** — Drag tasks from panel or calendar to trash bin to delete
- **Domain management** — Create and organize task domains/projects
- **Todoist import** — One-click import of existing Todoist tasks
- **Task instances** — Recurring task instance tracking
- **Version badge** in header (v0.4)

### Changed

- **Energy filter task counts** — Domain headers now show "visible/total" when filtered (e.g., "3/5")
- Deleting a parent task now cascades to delete all subtasks
- Plan My Day selection now works correctly in adjacent-day sections (prev evening, next morning)
- Improved Plan My Day visual highlight with subtle inset glow

### Fixed

- Plan My Day time selection accuracy using actual DOM positions
- Vertical alignment of energy buttons and Plan My Day button
- Selection overlay positioning in hour grid with borders
- Removed unwanted scroll behavior when entering Plan mode

---

## [0.3.0] - 2025-12-30

### Added

- **Plan feature** - Auto-schedule tasks into selected time ranges
  - Click-and-drag time range selection on calendar
  - Bidirectional selection (drag up or down)
  - Smart scheduling algorithm respects existing events
- **PWA support** - Add to home screen on iOS and Android
  - Fullscreen standalone mode
  - Safe area support for notched devices
- **Mobile-optimized compact mode** - Vertical layout with touch support
- **Touch support** for Plan feature on mobile devices
- `data-due-date` and `data-is-recurring` attributes for date-aware scheduling

### Changed

- Tasks without `@clarity` labels are now hidden from task list
- Projects with no visible tasks are automatically hidden
- Energy filter completely hides non-matching tasks (previously greyed out)
- Renamed "Stack" feature to "Plan" throughout codebase
- Inbox project moved to bottom, collapsed by default
- Improved mobile responsive layout with configurable panel ratios

### Fixed

- Plan selection works in both directions (top-to-bottom and bottom-to-top)
- Tasks without duration default to 30 minutes
- Algorithm skips tasks that don't fit instead of advancing slots

---

## [0.2.0] - 2025-12-28

### Added

- **Drag-and-drop scheduling** - Drag tasks from list to calendar
- 15-minute interval snapping for precise scheduling
- Duration-based event height visualization
- Reschedule by dragging scheduled tasks
- Remove scheduled tasks by dragging out of calendar
- Overlap detection with side-by-side display (max 3 columns)
- Commit scheduled tasks to Todoist API
- Calendar carousel (15 days: 7 before, today, 7 after)
- "Today" floating button for quick navigation

---

## [0.1.0] - 2025-12-27

### Added

- OAuth2 authentication for Todoist and Google Calendar
- Fetch and display tasks from Todoist
- Fetch and display events from Google Calendar
- Dashboard with 2:1 layout (tasks : calendar)
- Energy-based task filtering (Zombie / Normal / Focus)
- Task grouping by project with collapsible sections
- Settings page for Google Calendar selection
- Clarity labels parsing (`@executable`, `@defined`, `@exploratory`)
- Duration parsing from task description (`d:30m`, `d:2h`, `d:1h30m`)

---

[unreleased]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.3...HEAD
[0.8.3]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/aleksandr-bogdanov/whendoist/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aleksandr-bogdanov/whendoist/releases/tag/v0.1.0
