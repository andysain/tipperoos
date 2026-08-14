---
type: concept
title: Shared UI Components
description: Reusable UI primitives — Button, Card, CardShell, PinInput, TextField, ClubCodeBadge — built with Tailwind v4 and tailwind-variants.
tags: [design-system, components, ui, button, card, input]
---

# Shared UI Components

The `src/components/ui/` directory provides reusable UI primitives used across all screens.

## Button (`Button.tsx`)

Uses `tailwind-variants` for a clean variant API:

| Variant             | Intent              | Visual                      |
| ------------------- | ------------------- | --------------------------- |
| `primary` (default) | Main actions        | `bg-accent text-accent-ink` |
| `secondary`         | Alternative actions | `bg-ink text-paper`         |
| `ghost`             | Subtle actions      | Transparent, ink on hover   |

Sizes: `md` (default, `px-5 py-3`), `sm` (`px-3.5 py-2`).

Supports `fullWidth` boolean. The component uses React 19's ref-through-prop pattern (no `forwardRef` wrapper).

## Card (`Card.tsx`)

A simple white card with `rounded-card` and `shadow-card`. Used for basic grouped content.

## CardShell (`CardShell.tsx`)

An anatomy for structured cards with an ink header, kit-colour seam, and white body:

```
┌──────────────────────────────────────┐
│ CardShellHeader (ink background)      │
├──────────────────────────────────────┤
│ CardShellSeam (two-tone colour bar)   │
├──────────────────────────────────────┤
│ CardShellBody (white background)      │
└──────────────────────────────────────┘
```

Exports: `CardShell`, `CardShellHeader`, `CardShellSeam`, `CardShellBody`, `CardShellSeamSegment`.

## PinInput (`PinInput.tsx`)

A 4-digit PIN entry component with individual digit slots, used on the login page. Provides:

- Automatic focus advancement between slots
- Numeric-only input enforcement
- Error state display
- The `onComplete` callback fires when all 4 digits are entered

## TextField (`TextField.tsx`)

Standard text input with label, error state, and consistent styling. Used for display name entry and competition code entry.

## ClubCodeBadge (`ClubCodeBadge.tsx`)

Rounded-rect club-code chip with kit-colour background. Auto-resolves text colour via `badgeTextColor()` for contrast compliance.

## Related

- [Design Tokens](tokens.md)
- [Kit Colors](kit-colors.md)
- [Login Flow](../auth/login-flow.md)
