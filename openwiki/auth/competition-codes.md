---
type: concept
title: Competition Codes
description: How competition codes are normalized, hashed with scrypt, verified, and set per environment via interactive scripts.
tags: [auth, competition-code, scrypt, hashing, scripts]
---

# Competition Codes

The competition code is the gate to the entire application — a shared secret that all players in one competition must know. Codes are never stored in plaintext and never appear in git history.

## Normalization

Both the stored hash and the verification path apply identical normalization (`src/lib/auth/competitions.ts`):

```typescript
export function normalizeCompetitionCode(code: string): string {
  return code.trim().toLowerCase();
}
```

This tolerates copy/paste artifacts (leading/trailing whitespace) and case differences.

## Hashing

Codes are hashed with scrypt (same function as PIN hashing — `hashSecret`/`verifySecret` from `src/lib/auth/scrypt-secret.ts`). The hash is stored in `competitions.code_hash`.

```
raw code → normalizeCompetitionCode() → hashSecret() → <saltHex>:<keyHex>
```

## Matching

`matchCompetitionByCode()` iterates over the (tiny) competitions table, testing each row's `code_hash` with `verifySecret()`. Returns the first matching `competition.id`, or `null`.

```
submitted code → normalize() → for each row { verifySecret(normalized, row.code_hash) } → match or null
```

Short-circuits on first match — the table is always small (a handful of rows at most), so timing variance is not a meaningful risk.

## Setting the code per environment

Codes are set via `scripts/set-competition-code.mjs` — never via a migration file or git-committed value.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-competition-code.mjs
```

The script:

1. Lists all competitions in the environment
2. Prompts for which competition to set (hidden input — not echoed to terminal)
3. Normalizes and hashes the code
4. Checks for collisions (two competitions with the same code would be unresolvable)
5. Writes the hash to `competitions.code_hash`

**Each environment uses a different code** — staging and production are deliberately different, so a leaked staging code can't be reused for the real competition.

### Collision detection

Because `hashSecret()` uses a fresh random salt (`randomBytes(16)`) each call, the same plaintext code produces a **different `code_hash`** every time. This makes a DB `UNIQUE` constraint on `code_hash` useless for detecting duplicate codes — two rows could have different hashes of the same plaintext.

Instead, collision detection is done **at the application level** by `scripts/lib/competitions.mjs`'s `findCollidingCompetition()` function. It iterates over existing competition rows and tests each `code_hash` against the plaintext candidate using `verifySecret()`. If any existing competition's hash matches, the candidate collides.

In `bootstrap-competition.mjs`, if `findCollidingCompetition` returns non-null, the script **aborts with an error** — refusing to create a competition whose code matches an existing one.

In `set-competition-code.mjs`, the rotation collision guard handles two cases:

- **Code matches the target competition's own existing hash**: treated as a **no-op** (the code hasn't changed, no need to re-hash)
- **Code matches any other competition**: **aborts** — two competitions sharing a plaintext code is an unresolvable routing ambiguity for `matchCompetitionByCode`

## Bootstrap

When a competition is first created (see [Competition Bootstrap](../competitions/bootstrap.md)), the code is entered via a hidden prompt in `scripts/bootstrap-competition.mjs` and hashed in the script process before the RPC call — the Postgres function `create_competition_with_admin()` receives only the hash.

## Related

- [Login Flow](login-flow.md)
- [PIN Security](pin-security.md)
- [Competition Bootstrap](../competitions/bootstrap.md)
- [Security Model](../architecture/security-model.md)
