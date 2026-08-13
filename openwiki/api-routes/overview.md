---
type: concept
title: API Route Overview
description: Complete inventory of all API routes — auth, picks, sync, table-predictions — with common patterns (CSRF, session cookie, camelCase JSON).
tags: [api, routes, overview, patterns]
---

# API Route Overview

All API routes follow consistent patterns for security, naming, and error handling.

## Route inventory

| Route directory                  | Method | Purpose                               |
| -------------------------------- | ------ | ------------------------------------- |
| `api/auth/login`                 | POST   | Player authentication                 |
| `api/auth/logout`                | POST   | Session clear ("Switch player")       |
| `api/auth/players`               | GET    | Player roster for login screen        |
| `api/auth/signup`                | POST   | New player registration               |
| `api/picks`                      | POST   | Save/re-edit a match pick             |
| `api/sync/standings`             | POST   | Sync standings from football-data.org |
| `api/table-predictions/assign`   | POST   | Assign team to Band                   |
| `api/table-predictions/unassign` | POST   | Remove team from Band                 |
| `api/table-predictions/submit`   | POST   | Confirm current Band assignment       |
| `api/table-predictions/skip`     | POST   | Skip (Late Joiners only)              |

## Common patterns

### CSRF protection

State-changing routes check `hasCsrfHeader(request)` requiring the `x-tipperoos-client` custom header. The sync route uses `x-sync-secret` (shared-secret auth for server-to-server calls).

### Authentication

- Player routes: require `tipperoos_session` cookie, verified via HMAC signature
- Sync route: requires `x-sync-secret` header matching `SYNC_TRIGGER_SECRET` env var

### JSON conventions

- Request/response bodies use **camelCase** consistently
- Error responses: `{ error: "human-readable message" }`
- Status codes: 400 (validation), 401 (unauth), 403 (forbidden), 409 (conflict), 423 (locked), 429 (rate limit), 500 (server error)

### Error message style

Error messages are human-readable, kid-friendly, and action-oriented: "Enter a whole number from 0 to 9 for each side." rather than "Invalid score range."

## Related

- [Auth Routes](auth.md)
- [Picks Route](picks.md)
- [Table Prediction Routes](../table-predictions/api-routes.md)
- [Standings Sync Route](../standings-sync/overview.md)
