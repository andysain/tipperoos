---
type: concept
title: PIN Security
description: Scrypt-based PIN hashing, 5-attempt lockout with 15-minute auto-expiry, and optimistic-concurrency retry loop for concurrent login safety.
tags: [auth, pin, scrypt, lockout, security, concurrency]
---

# PIN Security

PINs are the single-factor authentication mechanism. Security is provided by scrypt hashing and a lockout state machine with concurrent-access protection.

## Scrypt hashing (`src/lib/auth/scrypt-secret.ts`)

Uses Node.js built-in `crypto.scryptSync` — no additional dependencies.

```
hashSecret(secret):
  salt = randomBytes(16)       // fresh salt per hash
  key = scryptSync(secret, salt, 64)
  return "<saltHex>:<keyHex>"  // stored format

verifySecret(secret, stored):
  [saltHex, expectedKeyHex] = stored.split(":")
  actualKeyHex = scryptSync(secret, saltHex, 64)
  return timingSafeEqual(expected, actualKeyHex)
```

**Golden-value testable**: The `deriveKeyHex()` function is exported so tests can verify deterministic output against a fixed salt — `hashSecret()`'s random salt makes it non-deterministic.

## Lockout state machine (`src/lib/auth/lockout.ts`)

```typescript
const MAX_FAILED_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
```

| Event                                | Effect                                               |
| ------------------------------------ | ---------------------------------------------------- |
| Failed PIN attempt (under threshold) | `failedPinAttempts++`                                |
| 5th failed PIN attempt               | `lockedUntil = now + 15min`                          |
| Successful login                     | Reset `failedPinAttempts = 0`, `lockedUntil = null`  |
| Login attempt while locked           | Reject with `423 Locked` and `lockedUntil` timestamp |

**Expired lock**: If a lock has auto-expired, the next failed attempt starts from 0 (not from the pre-lock count) — so a single mistake right after expiry doesn't immediately re-lock.

## Optimistic-concurrency retry loop

The login route (`src/app/api/auth/login/route.ts`) uses an optimistic-concurrency loop to prevent a concurrent-attack bypass:

```
MAX_RETRIES = 5

for attempt = 0; attempt < MAX_RETRIES; attempt++
  read currentState (failedPinAttempts, lockedUntil)
  if locked → return 423 with { lockedUntil }

  compute nextState (increment or reset)

  UPDATE players
  SET failed_pin_attempts = nextState.failedPinAttempts,
      locked_until = nextState.lockedUntil
  WHERE id = player.id
    AND failed_pin_attempts = currentState.failedPinAttempts  ← optimistic lock

  if updated row exists → done
  else → re-read currentState and retry (another request got there first)

// Loop exhausted after MAX_RETRIES
return 429 with "Too many concurrent login attempts. Please try again."
```

**Note**: `MAX_RETRIES` (the loop limit, 5) is separate from `MAX_FAILED_PIN_ATTEMPTS` (the lockout threshold, also 5). The two happen to share the same value but protect against different problems: the former guards against concurrent-write starvation, the latter guards against brute-force guessing.

This prevents two concurrent wrong-PIN requests from both reading the same stale `failed_pin_attempts = 3`, incrementing to 4, and never reaching the lockout. Without this, 10 rapid guesses could all pass through at attempts 3→4 without ever hitting 5.

**If the loop exhausts**: the caller receives HTTP `429 Too Many Requests` with `{ error: "Too many concurrent login attempts. Please try again." }`. This is distinct from `423 Locked` (which means the account hit the lockout threshold) and `401 Unauthorized` (which means an incorrect PIN with attempts remaining).

## Related

- [Login Flow](login-flow.md)
- [Session Management](session.md)
- [Security Model](../architecture/security-model.md)
