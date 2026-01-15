# Test Suite

## Quick Start

```bash
# Run all unit tests
just test

# Run specific test file
uv run pytest tests/test_task_sorting.py -v

# Run with coverage
uv run pytest tests/ --cov=app --cov-report=html
```

## Test Architecture

```
tests/
├── conftest.py              # Shared fixtures (db_session, etc.)
├── test_labels.py           # Label parsing (clarity, duration)
├── test_preferences.py      # PreferencesService CRUD
├── test_task_sorting.py     # Server-side sorting logic
├── test_js_module_contract.py  # JS module integration contracts
├── test_encryption.py       # E2E encryption (multitenancy, crypto.js contracts)
└── e2e/
    └── test_task_sorting_e2e.py  # Browser-based E2E tests
```

## Test Categories

### Unit Tests (Fast, No I/O)

| File | Tests | Purpose |
|------|-------|---------|
| `test_labels.py` | 14 | Parse clarity labels and duration from task content |
| `test_preferences.py` | 16 | PreferencesService CRUD, validation, encryption |
| `test_task_sorting.py` | 19 | Server-side `group_tasks_by_domain()` sorting |
| `test_js_module_contract.py` | 8 | Verify JS modules have correct APIs |
| `test_encryption.py` | 48 | E2E encryption architecture, multitenancy isolation |

### E2E Tests (Slow, Requires Server)

| File | Tests | Purpose |
|------|-------|---------|
| `test_task_sorting_e2e.py` | 4 | Full browser flow for preference + sorting |

## Key Test Scenarios

### Task Sorting (`test_task_sorting.py`)

Tests all combinations of user preferences that affect task order:

```
Preferences:
- completed_move_to_bottom: True/False
- completed_sort_by_date: True/False
- scheduled_move_to_bottom: True/False
- scheduled_sort_by_date: True/False

Section Order (when both at bottom):
  Unscheduled → Scheduled → Completed

Section Order (when neither at bottom):
  All tasks interleaved by impact (P1→P4)
```

### JS Module Contract (`test_js_module_contract.py`)

Verifies JavaScript modules integrate correctly WITHOUT running a browser:

```python
# This catches the "stale preferences" bug
def test_calls_tasksort_update_preference_after_save():
    """
    task-list-options.js MUST call TaskSort.updatePreference()
    after saving a preference. Without this, column header clicks
    use stale cached values.
    """
    assert "TaskSort.updatePreference" in task_list_options_js
```

### E2E Encryption (`test_encryption.py`)

Comprehensive tests for client-side encryption architecture:

#### Test Categories

| Category | Tests | Purpose |
|----------|-------|---------|
| `TestEncryptionPreferences` | 6 | Encryption enable/disable in UserPreferences |
| `TestEncryptionMultitenancy` | 8 | **CRITICAL**: User isolation for encrypted data |
| `TestEncryptionDataIsolation` | 3 | Query scoping for all-content endpoint |
| `TestCryptoModuleExportsAPI` | 11 | crypto.js exports required functions |
| `TestCryptoModuleArchitecture` | 7 | Verifies AES-GCM, PBKDF2, sessionStorage |
| `TestCryptoModuleIntegration` | 4 | dashboard/settings/task-dialog use Crypto |
| `TestEncryptionFlows` | 2 | Enable/disable encryption workflows |
| `TestEncryptionEdgeCases` | 4 | Empty batch, nonexistent IDs, re-enable |
| `TestEncryptionDataModel` | 3 | No per-record flags (global toggle only) |

#### Encryption Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     E2E ENCRYPTION ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User Preferences                                                   │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ encryption_enabled: boolean    ← Global toggle           │       │
│  │ encryption_salt: string        ← For key derivation      │       │
│  │ encryption_test_value: string  ← Passphrase verification │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  Encrypted Fields (when enabled):                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ task.title   │  │ task.desc    │  │ domain.name  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                     │
│  Client-Side (crypto.js):                                           │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ • PBKDF2 key derivation (100,000 iterations)            │       │
│  │ • AES-256-GCM encryption/decryption                     │       │
│  │ • Key stored in sessionStorage (cleared on tab close)   │       │
│  │ • window.WHENDOIST.encryptionEnabled for state check    │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  Server-Side Protection (MULTITENANCY):                             │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ • All queries filter by user_id                         │       │
│  │ • get_task(id) returns None for other users' tasks      │       │
│  │ • Batch updates skip IDs not owned by authenticated user│       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Key Security Tests

```python
# Multitenancy: User A cannot access User B's data
async def test_get_task_by_id_requires_ownership():
    """get_task() returns None when accessing another user's task."""
    task = await service1.create_task(title="User 1 Private Task")
    result = await service2.get_task(task.id)  # User 2 tries to access
    assert result is None  # BLOCKED

# Batch update protection
async def test_batch_update_only_affects_owned_tasks():
    """Malicious user cannot modify other users' tasks via batch-update."""
    # User 2 sends User 1's task ID in batch-update
    task = await service2.get_task(user1_task_id)  # Returns None
    # Task is skipped, User 1's data remains unchanged
```

## Regression Tests

When fixing bugs, add a test that would have caught it:

| Bug | Test | File |
|-----|------|------|
| Stale preference cache | `test_calls_tasksort_update_preference_after_save` | `test_js_module_contract.py` |
| Scheduled tasks not grouped | `test_completed_and_scheduled_both_at_bottom` | `test_task_sorting.py` |

## Writing New Tests

### 1. Choose the right category

- **Unit test**: Pure logic, no I/O, fast
- **Integration test**: Multiple components, may use test DB
- **E2E test**: Full browser flow, slow, catches JS bugs

### 2. Add proper docstring

```python
"""
User Preferences Service Tests.

Test Category: Unit (async, uses in-memory SQLite)
Related Code: app/services/preferences_service.py

Coverage:
- Default preference creation
- Individual preference updates

See tests/README.md for full test architecture.
"""
```

### 3. Link to bugs/PRs when relevant

```python
def test_preference_sync_after_toggle(self):
    """
    Regression test for stale preference cache bug.

    Bug: Column headers used cached preferences after Options change.
    Fix: task-list-options.js calls TaskSort.updatePreference()
    """
```

## Running E2E Tests

E2E tests require additional setup:

```bash
# Install browser
uv run playwright install chromium

# Start dev server in one terminal
just dev

# Run E2E tests in another terminal
uv run pytest tests/e2e/ -v --headed  # See browser
uv run pytest tests/e2e/ -v           # Headless
```

## Test Fixtures

### `db_session` (conftest.py)

Creates an in-memory SQLite database for each test:

```python
async def test_something(db_session: AsyncSession):
    # Fresh database, isolated from other tests
    user = User(email="test@example.com")
    db_session.add(user)
    await db_session.flush()
```

### `test_user`, `test_domain` (test_task_sorting.py)

Pre-created user and domain for sorting tests:

```python
async def test_sorting(db_session, test_user, test_domain):
    task = Task(user_id=test_user.id, domain_id=test_domain.id, ...)
```
