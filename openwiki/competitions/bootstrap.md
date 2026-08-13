---
type: concept
title: Competition Bootstrap
description: Atomic creation of a new competition and its exactly-one Competition Admin via an interactive script and a Postgres RPC function.
tags: [competition, bootstrap, admin, script, rpc]
---

# Competition Bootstrap

A new competition — and its exactly-one Competition Admin — is created atomically via `scripts/bootstrap-competition.mjs`.

## Why an RPC function

Supabase JavaScript client (PostgREST) has no multi-statement transaction support. Two separate `.insert()` calls could leave a competition live with no admin if the second one failed — a competition with no admin would have nobody able to reset PINs or manage the competition.

The Postgres function `create_competition_with_admin()` (defined in `supabase/migrations/20260808000000_create_competition_with_admin.sql`) wraps both inserts in a single transaction:

```
BEGIN;
  INSERT INTO competitions (name, code_hash) VALUES (...);
  INSERT INTO players (competition_id, display_name, pin_hash, emoji, is_admin) VALUES (...);
COMMIT;
```

### Security grants

The function uses:

- **`security invoker`** (not `security definer`) — the function executes with the permissions of the calling user, not the function owner. Using `security definer` would be dangerous because it would elevate the `service_role` key's already-privileged access to the function owner's level, which could allow unintended side effects within the function body beyond what the caller intended.
- **`search_path = ''`** — prevents search-path injection attacks by requiring fully-qualified table names.
- The migration explicitly **revokes** default EXECUTE from `public` and **grants** EXECUTE only to the `service_role`:
  ```sql
  revoke execute on function create_competition_with_admin from public;
  grant execute on function create_competition_with_admin to service_role;
  ```
  Postgres's default would grant EXECUTE on all functions to `PUBLIC` — making the function callable by any role that can connect. The revoke/grant pair restricts it to only `service_role`, which is the role used by server-side Next.js code through the `SUPABASE_SERVICE_ROLE_KEY`.

## Interactive prompts

The script prompts for (all hidden/secure):

| Prompt             | Validation                             | Storage                                      |
| ------------------ | -------------------------------------- | -------------------------------------------- |
| Competition name   | Non-empty                              | `competitions.name` (plaintext)              |
| Competition code   | Non-empty, normalized                  | `competitions.code_hash` (hashed in-process) |
| Admin display name | `validateDisplayName()`                | `players.display_name`                       |
| Admin PIN          | `validatePinFormat()`, confirmed twice | `players.pin_hash` (hashed in-process)       |
| Admin emoji        | Non-empty                              | `players.emoji`                              |

The code and PIN are **never** passed as CLI arguments — they only exist in the script process's memory and the hashed database column afterward.

## Collision guard

The script checks that no existing competition in the same environment already uses the same normalized code (by hashing the input and scanning existing rows). This prevents an unresolvable ambiguity in the login flow — `matchCompetitionByCode` cannot disambiguate two competitions sharing a code.

## Post-bootstrap

After bootstrapping:

- The admin can log in immediately — no forced-PIN-reset flag is set (the operator and account holder are the same person at the same keyboard)
- The competition code may need to be re-set per environment via `set-competition-code.mjs` if the hash used during bootstrap doesn't match the target environment's code

## Scripted verification

The bootstrap flow is validated by `scripts/verify-bootstrap-competition.mjs`, which:

1. Bootstraps a fresh competition + admin via the RPC
2. Verifies both rows exist
3. Tests the collision guard (rejects duplicate code)
4. Tests that a PIN-less login fails
5. Tests set-competition-code.mjs's multi-competition selector
6. Cleans up all inserted rows in a `finally` block

Runs against staging. Not a CI gate.

## Related

- [Competition Scope Model](scope-model.md)
- [Competition Codes](../auth/competition-codes.md)
- [Verification Scripts](../testing/verification-scripts.md)
