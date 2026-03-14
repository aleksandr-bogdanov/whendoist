# MCP Integration

> Connect AI assistants to Whendoist via the [Model Context Protocol](https://modelcontextprotocol.io/).

---

## Table of Contents

1. [Overview](#overview)
2. [Two Options](#two-options)
3. [Option 1: Built-in MCP Server (Remote)](#option-1-built-in-mcp-server-remote)
4. [Option 2: Local MCP Server (Open Source)](#option-2-local-mcp-server-open-source)
5. [Which One Should I Use?](#which-one-should-i-use)
6. [Available Tools](#available-tools)
7. [E2E Encryption Compatibility](#e2e-encryption-compatibility)
8. [Architecture](#architecture)

---

## Overview

MCP (Model Context Protocol) is a standard for connecting AI tools to external services. Whendoist supports MCP so you can manage tasks, view schedules, and track analytics directly from Claude Code, Claude Desktop, or any MCP-compatible client.

Two options are available depending on your setup:

---

## Two Options

| | Built-in (Remote) | Local (Open Source) |
|---|---|---|
| **Where it runs** | On Whendoist's server (Railway) | On your machine |
| **Transport** | Streamable HTTP | stdio (subprocess) |
| **Auth** | OAuth 2.1 with PKCE | Device auth tokens |
| **Setup** | Connect via MCP client's OAuth flow | Clone repo, run setup script |
| **E2E encryption** | Not supported (server can't decrypt) | Fully supported (key stays local) |
| **Network** | Requires internet | Works against localhost too |
| **DB access** | Direct (same process as Whendoist) | Via REST API |

---

## Option 1: Built-in MCP Server (Remote)

The MCP server is built into the Whendoist FastAPI application and deployed alongside it. It runs at `whendoist.com/mcp`.

### How it works

```
MCP Client ──OAuth 2.1──> whendoist.com/oauth/authorize
MCP Client ──HTTP/JSON-RPC──> whendoist.com/mcp
```

MCP clients discover Whendoist's OAuth endpoints via the standard metadata URL:

```
GET https://whendoist.com/.well-known/oauth-authorization-server
```

### OAuth 2.1 Flow

1. **Client registration** — MCP client calls `POST /oauth/register` with its name and redirect URIs. Gets a `client_id` and `client_secret`.
2. **Authorization** — Client redirects user to `GET /oauth/authorize` with PKCE challenge. User sees a consent page and approves.
3. **Token exchange** — Client exchanges the authorization code at `POST /oauth/token`. Gets an access token (1h) and refresh token (30d).
4. **MCP requests** — Client sends `Authorization: Bearer <token>` with each MCP request to `/mcp`.

If the user isn't logged into Whendoist, the consent page redirects to Google login first, then back to the consent page automatically.

### Implementation

The built-in server lives in the Whendoist codebase:

| File | Purpose |
|------|---------|
| `app/routers/mcp_server.py` | MCP tools + auth middleware |
| `app/routers/oauth.py` | OAuth 2.1 provider (registration, consent, tokens) |
| `app/models.py` | `OAuthClient` and `OAuthAuthorizationCode` models |
| `app/main.py` | Mounts MCP sub-app at `/mcp`, registers OAuth routes |

Tools access the database directly via SQLAlchemy (no HTTP hop to the REST API). User identity comes from a `contextvars.ContextVar` set by the ASGI auth middleware.

---

## Option 2: Local MCP Server (Open Source)

A standalone Python MCP server that runs as a local subprocess. It wraps Whendoist's REST API.

**Repository:** [github.com/aleksandr-bogdanov/whendoist-mcp](https://github.com/aleksandr-bogdanov/whendoist-mcp)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/aleksandr-bogdanov/whendoist-mcp.git
cd whendoist-mcp
uv sync

# 2. Authenticate (one-time)
uv run setup_auth.py
# Paste your browser session cookie when prompted

# 3. Register with Claude Code
claude mcp add --scope user --transport stdio whendoist \
  -- uv --directory /path/to/whendoist-mcp run server.py
```

### How it works

```
Claude Code <──stdio/JSON-RPC──> whendoist-mcp <──HTTP──> Whendoist API
```

The local server runs as a subprocess launched by your MCP client. It talks to `whendoist.com` (or localhost) via the REST API using device auth tokens. Tokens auto-refresh on expiry.

### E2E encryption support

The local server can hold your encryption passphrase in memory and transparently encrypt/decrypt task content. This mirrors the browser's security model — the key only exists on your machine.

```
1. Use the `unlock_encryption` tool with your passphrase
2. All reads are decrypted, all writes are encrypted automatically
3. Use `lock_encryption` to clear the key from memory
```

See [E2E Encryption Compatibility](#e2e-encryption-compatibility) for details.

---

## Which One Should I Use?

**Use the built-in (remote) server if:**
- You don't use E2E encryption
- You want zero-setup — just connect from any MCP client via OAuth
- You want direct database access (faster, no HTTP hop)

**Use the local (open source) server if:**
- You use E2E encryption (required — the remote server can't decrypt your data)
- You want to work against a local dev instance
- You want to audit or modify the MCP server code

**Both can be used simultaneously** — they don't conflict.

---

## Available Tools

Both servers expose the same 26 core tools. The local server adds 2 encryption tools.

### Core Tools

#### Task CRUD

| Tool | Description |
|------|-------------|
| `list_tasks` | Query tasks with filters (domain, status, date, clarity, impact, recurrence) |
| `create_task` | Create a new task with full metadata (title, domain, impact, clarity, schedule, etc.) |
| `update_task` | Update any task properties (only provided fields change) |
| `complete_task` | Mark a task as completed |
| `delete_task` | Permanently delete a task |
| `archive_task` | Archive a task (soft delete, can be restored) |
| `restore_task` | Restore an archived task back to pending |
| `get_archived_tasks` | List archived tasks with optional domain filter |
| `search_tasks` | Search tasks by title keyword |
| `batch_create_tasks` | Create multiple tasks at once (JSON array) |
| `batch_update_tasks` | Update multiple tasks at once (comma-separated IDs) |
| `batch_complete_tasks` | Complete multiple tasks at once (comma-separated IDs) |

#### Recurring Instances

| Tool | Description |
|------|-------------|
| `complete_instance` | Complete a specific recurring task instance |
| `skip_instance` | Skip a recurring task instance |
| `unskip_instance` | Revert a skipped instance to pending |
| `reschedule_instance` | Move a recurring instance to a different date |

#### Domains

| Tool | Description |
|------|-------------|
| `list_domains` | List all domains (projects/life areas) |
| `create_domain` | Create a new domain |
| `update_domain` | Update domain name, color, or icon |
| `archive_domain` | Archive a domain (soft delete) |

#### Schedule & Analytics

| Tool | Description |
|------|-------------|
| `get_schedule` | View scheduled tasks and recurring instances for a date range |
| `get_overdue` | Find overdue tasks and past recurring instances |
| `get_analytics` | Completion streaks, velocity, domain breakdown (last 30 days) |
| `get_recent_completions` | Recently completed tasks and instances, most recent first |

#### User Context

| Tool | Description |
|------|-------------|
| `whoami` | Show authenticated user identity (email, name, data_version) |
| `get_preferences` | Get user preferences (timezone, display settings, encryption status) |

### Encryption Tools (local server only)

| Tool | Description |
|------|-------------|
| `unlock_encryption` | Unlock E2E encryption with your passphrase |
| `lock_encryption` | Clear the encryption key from memory |

---

## E2E Encryption Compatibility

### The problem

Whendoist's E2E encryption means task titles, descriptions, and domain names are stored as ciphertext on the server. The server never has the key — only the browser does.

This creates a problem for MCP: the built-in server runs on the same machine as Whendoist, so it sees the same ciphertext the database stores. It can't decrypt it.

### The solution

| Server | E2E behavior |
|--------|-------------|
| **Built-in (remote)** | Returns a clear error: "Your account uses E2E encryption. Use the local MCP server instead." |
| **Local (open source)** | Full support. `unlock_encryption` derives the key locally using PBKDF2 (same as the browser). All reads/writes are transparently encrypted/decrypted. |

### How local encryption works

The local MCP server implements the same crypto as the browser:

1. **Key derivation** — PBKDF2-HMAC-SHA256, 600,000 iterations, using the salt stored in your user preferences
2. **Encryption** — AES-256-GCM with random 12-byte IV
3. **Format** — `base64(IV || ciphertext || authTag)` — identical to the browser

The key is held in process memory for the duration of the MCP session. It's never written to disk, never sent over the network.

### Security model

This is the same security model as the browser:
- The key exists only on your local machine
- It's derived from your passphrase + salt
- It's verified against the stored test ciphertext before use
- It's cleared from memory when you call `lock_encryption` or the process exits

---

## Architecture

### Built-in server

```
┌─────────────┐     ┌───────────────────────────────────┐
│  MCP Client │────>│  whendoist.com                    │
│  (Claude)   │     │                                   │
│             │     │  /mcp ──> MCPAuthMiddleware        │
│             │     │           ──> FastMCP tools        │
│             │     │           ──> SQLAlchemy (direct)  │
│             │     │                                   │
│             │     │  /oauth/* ──> OAuth 2.1 provider  │
└─────────────┘     └───────────────────────────────────┘
```

- FastMCP's Streamable HTTP ASGI app, dispatched via `_MCPDispatchMiddleware` in `app/main.py`
- `MCPAuthMiddleware` validates Bearer tokens, sets user ID in `contextvars`
- Tools use `async_session_factory()` for direct DB access
- OAuth reuses Whendoist's device auth token infrastructure (itsdangerous signed tokens)

#### Deployment pitfalls (solved)

Three issues were discovered deploying the built-in MCP server. These are already fixed but documented here for context:

1. **SPA catch-all vs MCP routing** — FastAPI's `@app.get("/{path:path}")` SPA fallback matches `/mcp` for method checking, causing POST/DELETE to return 405 before `app.mount("/mcp")` is reached. **Fix:** `_MCPDispatchMiddleware` intercepts `/mcp` requests at the middleware level, bypassing the router.

2. **ASGI lifespan forwarding** — When dispatching via middleware instead of `app.mount()`, ASGI lifespan events must be explicitly forwarded to the MCP sub-app. Without this, FastMCP's `StreamableHTTPSessionManager.run()` is never called and the task group stays uninitialized → `RuntimeError`. **Fix:** The middleware forwards lifespan startup/shutdown to the MCP app concurrently.

3. **DNS rebinding protection** — FastMCP 1.26.0 validates `Host` headers against an allowlist (default: localhost only). Production requests with `Host: whendoist.com` are rejected with 421 Misdirected Request. **Fix:** `TransportSecuritySettings(allowed_hosts=["whendoist.com", "localhost", "127.0.0.1"])`.

### Local server

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  MCP Client │────>│  whendoist-mcp   │────>│  Whendoist   │
│  (Claude)   │stdio│  (local process) │HTTP │  REST API    │
└─────────────┘     │                  │     └──────────────┘
                    │  CryptoManager   │
                    │  (key in memory) │
                    └──────────────────┘
```

- Runs as subprocess via stdio transport
- `WhendoistClient` handles HTTP requests with auto-refresh on 401
- `CryptoManager` holds the AES key in memory when unlocked
- All API responses pass through `_decrypt_task()`, all writes through `_encrypt_body()`

---

*Last updated: March 2026 (v0.66.16)*
