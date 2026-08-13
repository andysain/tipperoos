---
type: concept
title: Session Management
description: Stateless HMAC-signed session cookie implementation, signing, verification, and lifecycle for Tipperoos authentication.
tags: [auth, session, cookie, hmac]
---

# Session Management

Tipperoos uses a **stateless signed session cookie** — no server-side session table, no expiry. The session is an HMAC-SHA256 token: `<playerId>.<signature>`.

## Implementation

### Signing (`src/lib/auth/session.ts`)

```typescript
export function signSession(playerId: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(playerId).digest("hex");
  return `${playerId}.${signature}`;
}
```

### Verification

```typescript
export function verifySession(token: string, secret: string): string | null {
  // Splits on last "." — player ids are UUIDs (no dots)
  // timingSafeEqual prevents timing attacks
  // Returns playerId if valid, null otherwise
}
```

Key details:

- `timingSafeEqual` is used to compare signatures (prevents timing-based attacks)
- Returns `null` on malformed tokens, wrong signatures, or length mismatches — never throws
- Player IDs are UUIDs so the `.lastIndexOf(".")` split is safe

## Cookie lifecycle (`src/app/_lib/session-cookie.ts`)

| Operation | Function                     | When                                                   |
| --------- | ---------------------------- | ------------------------------------------------------ |
| Set       | `setSessionCookie(playerId)` | After successful login or signup                       |
| Read      | `getSessionPlayerId()`       | Every server component read, every route handler write |
| Clear     | `clearSessionCookie()`       | "Switch player" flow (logout)                          |

Cookie attributes:

- **Name**: `tipperoos_session`
- **httpOnly**: true (not accessible to JavaScript)
- **secure**: true (HTTPS only)
- **sameSite**: `lax` (prevents CSRF from cross-site GET)
- **Path**: `/`
- **No Max-Age**: persists until explicit "Switch player" — sufficient for shared-device model

## Security properties

- **No server-side revocation**: the session can't be killed server-side. This is acceptable for the threat model (family/friends on shared devices).
- **No expiry**: the HMAC secret (`SESSION_SECRET` env var) is the effective revocation mechanism — rotate it to invalidate all sessions.
- **Shared-device mitigation**: the "Switch player" button calls `POST /api/auth/logout` which clears the cookie, so the next user on the same device starts fresh.

## Session flow

```
Login/Signup ──► setSessionCookie(playerId)
                       │
                       ▼
              Browser sends Cookie: tipperoos_session=<token>
                       │
                       ▼
              getSessionPlayerId() verifies HMAC
                       │
                       ▼
              Returns playerId or null
                       │
                       ▼
              [Route receives playerId]
              resolveCompetitionId(supabase, playerId)
                │
                ├─ player exists in DB ──► returns competitionId
                │
                └─ player deleted / DB wiped ──► returns null
                       │                       (routine, not exceptional)
                       ▼
              page.tsx: playerId or competitionId is null
                       │
                       ▼
              redirect("/login") ──► browser navigates to login page
              (Cookie is NOT cleared here — caller's job to clear it
               via "Switch player" flow. The redirect to /login is
               sufficient since that page also starts from the code gate.)
                       │
                       ▼
              Switch Player ──► clearSessionCookie() ──► /login
```

### Stale cookie recovery

`resolveCompetitionId` (in `src/lib/competitions/scope.ts`) returns `null` (never throws) when the player id from the session cookie doesn't match any active player row in the database. This is documented as "routine, not exceptional" — it happens every time a dev database is wiped while the dev browser still holds a signed cookie. No cookie is cleared at this point; the `redirect("/login")` is sufficient because the login page re-prompts for the competition code. If the player ever returns on the same device after the DB is restored, the stale cookie would cause another redirect — using "Switch player" explicitly clears it.

## Related

- [Login Flow](login-flow.md)
- [Security Model](../architecture/security-model.md)
- [PIN Security](pin-security.md)
