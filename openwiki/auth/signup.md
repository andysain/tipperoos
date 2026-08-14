---
type: concept
title: Signup
description: Self-service account creation route, validation rules for display names, PINs, and emojis, and concurrency-safe uniqueness checks.
tags: [auth, signup, validation, emoji]
---

# Signup

The signup route at `POST /api/auth/signup` (`src/app/api/auth/signup/route.ts`) creates a new player within an existing competition. It is **not** a registration endpoint — the user must already know the competition code.

## Request body

```typescript
interface SignupBody {
  competitionCode?: string;
  displayName?: string;
  pin?: string;
  email?: string; // optional, not unique
  emoji?: string; // mandatory
}
```

## Validation pipeline

```
competitionCode ──► resolveCompetitionByCode() ──► 403 if invalid
displayName    ──► validateDisplayName()      ──► 400 if invalid
pin            ──► validatePinFormat()        ──► 400 if invalid
emoji          ──► validateEmoji()             ──► 400 if invalid
email          ──► trimmed; stored, or null when empty ──► optional
                         │
                         ▼
              Check display_name uniqueness in competition
                         │
                         ▼
              hashSecret(pin) + insert player row
                         │
                         ▼
              setSessionCookie(player.id) ──► 201 response
```

## Validation rules

### Display name (`src/lib/auth/signup-validation.ts`)

- **Length**: 2–20 characters (after trimming)
- **Pattern**: `[\p{L}\p{N} '-]+` — letters (Unicode-aware for names like "José"), digits, spaces, apostrophes, hyphens
- Emoji is explicitly excluded from display names (it has its own field)
- Case-insensitive uniqueness within a competition

### PIN

- Exactly 4 digits (`/^\d{4}$/`)
- Hashed with scrypt (see [PIN Security](pin-security.md))

### Emoji (`src/lib/auth/emoji-options.ts`)

- Must be one of the curated library (see [Emoji System](emoji-system.md))
- Mandatory at signup — reject signups without one

## Concurrency handling

The route first checks `SELECT id FROM players WHERE competition_id = ? AND display_name ILIKE ?`, then inserts. A unique-index race between these two steps is caught by Postgres error code `23505` (unique violation) and returned as a 409 Conflict.

## Successful response

```json
{
  "id": "uuid",
  "displayName": "string",
  "emoji": "emoji"
}
```

Status: `201`. The session cookie is set immediately — the new player lands signed in.

## Related

- [Login Flow](login-flow.md)
- [PIN Security](pin-security.md)
- [Emoji System](emoji-system.md)
- [Competition Codes](competition-codes.md)
