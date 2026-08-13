---
type: concept
title: Emoji System
description: Curated kid-appropriate emoji library for player identity, mandatory at signup. Shared by client grid display and server-side validation.
tags: [auth, emoji, validation, ui]
---

# Emoji System

Each player picks a mandatory emoji at signup, shown next to their name on the login list and leaderboard — a small kid-friendly personalization touch carried forward from the retired World Cup app.

## Curated library (`src/lib/auth/emoji-options.ts`)

The library is split into two tiers:

### Grid options (12 emoji)

Shown as a visual grid on the join form:
`⚽ 🏆 🔥 🌟 🦁 🐯 🐶 🐱 🎉 🍕 🫧 🪿`

### Full library (grid + additional curated emoji)

Used for the random-pick button. Includes all grid options plus curated additions organized by category: faces, animals, nature, food, sports, objects, symbols.

## Curation rules

Every emoji is verified by `emoji-options.test.ts` against these rules:

1. **Single Unicode code point only** — no flags (regional indicators), no skin tones, no ZWJ sequences, no keycaps (these render inconsistently across platforms)
2. **Kid-appropriate** — no alcohol/tobacco, weapons, suggestive content, gambling, or gore

## Shared module

The module is deliberately **pure** — no `server-only` imports, no side effects:

- Bundled for the client (login page's emoji grid and random-pick button)
- Imported by the server (signup route's `validateEmoji()` allowlist check)

This ensures the grid and the server allowlist can never drift apart.

## Validation

`validateEmoji(input)` in `src/lib/auth/signup-validation.ts`:

1. Trims the input
2. Checks it's non-empty
3. Verifies against the library with `isEmojiInLibrary()`
4. Returns `{ ok: true, normalized }` or `{ ok: false, reason }`

## Related

- [Login Flow](login-flow.md)
- [Signup](signup.md)
- [Design System Components](../design-system/components.md)
