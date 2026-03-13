---
version:
pr:
created: 2026-03-13
---

# MCP Server Integration

## Overview

Standalone MCP (Model Context Protocol) server that wraps whendoist's REST API,
enabling Claude Code (or any MCP client) to read and write tasks, check schedules,
and manage domains directly from conversation.

## Architecture

```
Claude Code <--stdio/JSON-RPC--> whendoist-mcp <--HTTP--> Whendoist API
```

- **Separate project:** `~/IdeaProjects/whendoist-mcp/`
- **Auth:** Uses whendoist's device auth (Bearer JWT), auto-refreshes on 401
- **Transport:** stdio (launched as subprocess by Claude Code)
- **No DB access:** Only talks to whendoist via its public REST API

## Tools

### Tier 1 (MVP)
| Tool | API | Purpose |
|------|-----|---------|
| `list_tasks` | `GET /api/v1/tasks` | Query tasks with filters |
| `create_task` | `POST /api/v1/tasks` | Create new tasks |
| `complete_task` | `POST /api/v1/tasks/{id}/complete` | Mark done |
| `list_domains` | `GET /api/v1/domains` | Get domains for filtering |
| `get_schedule` | `GET /tasks` + `GET /instances` | Today/week view |

### Tier 2
| Tool | API | Purpose |
|------|-----|---------|
| `update_task` | `PUT /api/v1/tasks/{id}` | Modify tasks |
| `get_overdue` | `GET /instances/pending-past-count` | Overdue items |
| `get_analytics` | `GET /api/v1/analytics` | Completion stats |
| `search_tasks` | `GET /api/v1/tasks` filtered | Find tasks |

### Tier 3
| Tool | Purpose |
|------|---------|
| `batch_create_tasks` | Goal decomposition |
| `complete_instance` | Complete recurring instance |
| `create_domain` | Add life area |

## Auth Flow

1. User logs into whendoist in browser
2. Runs `setup_auth.py` — pastes session cookie
3. Script calls `POST /api/v1/device/token` → gets access + refresh tokens
4. Tokens stored in `.env` (gitignored)
5. MCP server auto-refreshes access token (1h) using refresh token (30d)

## Registration

```bash
claude mcp add --scope user --transport stdio whendoist \
  -- uv --directory ~/IdeaProjects/whendoist-mcp run server.py
```
