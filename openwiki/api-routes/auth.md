---
type: concept
title: Auth API Routes
description: Login, logout, signup, and player-list API routes — all requiring custom CSRF header, session cookie management, and competition-code gating.
tags: [api, auth, login, signup, logout, players, csrf]
---

# Auth API Routes

All auth routes live under `src/app/api/auth/`. They share the CSRF header pattern (`x-tipperoos-client`) and session-cookie management.

## Common patterns

### CSRF protection

All state-changing routes check `hasCsrfHeader(request)` — a plain cross-site form POST can't set a custom header, so requiring one is sufficient (no full token library needed for this threat model).

### Session cookie

Stateless signed cookie (`playerId.hmacSha256Hex`). No expiry, no server-side session table. Set by `setSessionCookie()` on successful login/signup, cleared by `clearSessionCookie()` on logout.

## POST /api/auth/login

Authenticates a player by competition code + display name + PIN.

```json
// Request
{ "competitionCode": "...", "displayName": "...", "pin": "1234" }

// Response (200)
{ "id": "uuid", "displayName": "...", "emoji": "...", "pinResetRequired": false }

// Response (401)
{ "error": "Incorrect display name or PIN.", "attemptsRemaining": 3 }

// Response (423)
{ "error": "Too many incorrect PIN attempts. Try again later.", "lockedUntil": "..." }
```

### Key security invariants:

1. **Competition code is server-verified**: client sends the code, server re-derives `competitionId` by matching the hash — never trusts a client-asserted ID (ADR-0004 decision 3)
2. **Optimistic-concurrency for lockout**: concurrent wrong-PIN guesses must not all read-then-write the same stale counter. Retry loop (max 5) re-reads and applies conditional update via `.eq("failed_pin_attempts", currentValue)`
3. **Display name is case-insensitive**: uses `.ilike()` with escaped `%_` characters

## GET /api/auth/players

Returns the player roster for a competition (gated behind the competition code).

```http
x-competition-code: <the plaintext code>
```

Returns all human players (`is_bot = false`) with `displayName` and `emoji`. Used by the login screen's name-picking UX.

## POST /api/auth/signup

Creates a new player account. Signs the player in immediately (no separate login step).

```json
// Request
{ "competitionCode": "...", "displayName": "...", "pin": "1234", "emoji": "⚽", "email": "..." }

// Response (201)
{ "id": "uuid", "displayName": "...", "emoji": "⚽" }
```

### Validations

- Display name: `validateDisplayName()` (2-20 chars, letters/numbers/spaces/apostrophes/hyphens)
- PIN: `validatePinFormat()` (exactly 4 digits)
- Emoji: `validateEmoji()` (must be in curated library)
- Duplicate display name: case-insensitive check ± race-condition retry via unique index

### Race condition handling

A unique-index violation (`23505`) after a successful SELECT means a concurrent signup claimed the name between the check and the insert. Returned as a 409 ("already taken"), not a 500.

## POST /api/auth/logout

Clears the session cookie (no server-side revocation — the session has no server-side record).

```json
// Request
{ }  // CSRF header only

// Response (200)
{ "ok": true }
```

Backs the "Switch player" flow.

## Related

- [Session Management](../auth/session.md)
- [Login Flow](../auth/login-flow.md)
- [PIN Security](../auth/pin-security.md)
- [CSRF Protection](../architecture/security-model.md)
