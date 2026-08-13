---
type: concept
title: Security Model
description: Authentication, authorization, CSRF protection, session management, and server-only data access invariants in Tipperoos.
tags: [security, auth, csrf, session, server-only]
---

# Security Model

Tipperoos uses application-level auth (not Supabase Auth). All database access goes through server-side Next.js code — Client Components never call Supabase directly.

## Auth architecture

```
Browser                    Server (Next.js)               Supabase
   │                           │                            │
   │── POST /api/auth/login ──►│                            │
   │   { code, name, pin }     │── scrypt.verify(pin) ────►│
   │                           │── .update(failed_attempts)►│
   │◄── Set-Cookie: session ───│◄── { player } ────────────│
   │                           │                            │
   │── GET / (Server Component)│                            │
   │   Cookie: session ───────►│── createClient(svc_role)──►│
   │                           │── .select("picks") ───────►│
   │◄── HTML (own picks only)──│◄── scoped rows ───────────│
```

## Core invariants

### 1. All DB access is server-only

The `createServerSupabaseClient()` in `src/lib/supabase/server.ts` holds the **service_role key** — which bypasses RLS. Two guards prevent client-side exposure:

- **`import "server-only"`** — a Node.js module that throws when imported from a client bundle. Every file in `src/lib/` and `src/app/_lib/` that touches Supabase begins with this import. The guarded modules include: `src/lib/supabase/server.ts`, `src/lib/auth/scrypt-secret.ts`, `src/lib/auth/competitions.ts`, `src/lib/competitions/scope.ts`, plus all `src/app/_lib/*.ts` files (`session-cookie.ts`, `gameweek-access.ts`, `pick-board-access.ts`, `table-prediction-access.ts`). Test files (`.test.ts`) do not need this guard since they are never bundled for the client.
- **Vite config stubs it for tests** — `vitest/server-only-stub.ts` replaces it with a no-op so `src/lib/` modules are testable outside a Next.js server bundle.

### Script-side mirror for `server-only` bypass

The `scripts/lib/*.mjs` files are a dependency-free mirror of `src/lib/auth/**` logic. They exist because `src/lib/` modules use `import "server-only"` which throws at import time outside a Next.js server bundle — and plain `node` scripts (like `bootstrap-competition.mjs`, `set-competition-code.mjs`) are not server bundles. The parity test at `scripts/lib/parity.test.ts` keeps the two sides in agreement by asserting that the script-side functions produce identical output for the same inputs.

### 2. Stateless session cookie

Sessions are HMAC-signed tokens, not server-side records:

- Format: `<playerId>.<hmacSha256Hex>`
- Secret: `SESSION_SECRET` env var
- No expiry, no revocation (shared-device threat model: "Switch player" clears the cookie client-side)
- Cookie: `tipperoos_session`, `httpOnly`, `secure`, `sameSite: "lax"`, path `/`
- See `src/lib/auth/session.ts` and `src/app/_lib/session-cookie.ts`

### 3. Competition code gates everything

The competition code is required before the player list is revealed:

- **Hashed with scrypt** in `competitions.code_hash` — never stored in plaintext or git history
- Codes are **normalized** (trim, lowercase) before hashing and verification
- Set per environment via `scripts/set-competition-code.mjs` (hidden prompt, never a CLI arg)
- The `/api/auth/players` GET route requires an `x-competition-code` header
- A returning device remembers a verified code in `localStorage`

### 4. CSRF protection

Every state-changing route checks for the custom header `x-tipperoos-client`:

```typescript
// src/app/_lib/csrf.ts
const CSRF_HEADER_NAME = "x-tipperoos-client";
export function hasCsrfHeader(request: Request): boolean {
  return request.headers.get(CSRF_HEADER_NAME) !== null;
}
```

A plain cross-site form POST cannot set custom headers, so this is sufficient protection.

### 5. Competition-scoped data access

Picks and scores have no `competition_id` column of their own — they are keyed by `(player_id, match_id)`. Every query must join back through `players.competition_id` to avoid leaking one competition's data into another's view. The helpers in `src/lib/competitions/scope.ts` (`scoresForCompetition`, `picksForMatch`) are the only sanctioned paths for this data.

### 6. Lock enforcement is server-side

Picks lock 5 minutes before scheduled kickoff. The `isMatchLocked()` function in `src/lib/competitions/scope.ts` compares `Date.now()` against `kickoff_time - 5min`. This runs on every:

- Picks save (`POST /api/picks`)
- Picks reveal (`picksForMatch`)

The client cannot bypass lock by disabling UI controls or manipulating its clock.

## PIN security

See [PIN Security](../auth/pin-security.md) for details on:

- Scrypt hashing with random salt
- 5-attempt lockout with 15-minute auto-expiry
- Optimistic-concurrency loop preventing concurrent-attack bypass

## Related

- [Architecture Overview](overview.md)
- [Session Management](../auth/session.md)
- [PIN Security](../auth/pin-security.md)
- [Competition Scope Model](../competitions/scope-model.md)
