---
type: concept
title: Design Tokens and Globals
description: CSS custom properties for the Tipperoos design system — ink, paper, accent, success, danger, warning, info palette tokens, radius values, and animation keyframes.
tags: [design-system, css, tokens, tailwind, globals]
---

# Design Tokens and Globals

The design system is defined through CSS custom properties in `src/app/globals.css`, then exposed as Tailwind v4 theme tokens via `@theme inline`.

## Color palette

| Token        | Value     | Usage                          |
| ------------ | --------- | ------------------------------ |
| `ink`        | `#123c43` | Text, dark surfaces            |
| `paper`      | `#f6f3ec` | Page background, card body     |
| `paper-line` | `#e2dbc9` | Borders, dividers              |
| `accent`     | `#f0a63d` | Primary actions, active states |
| `accent-ink` | `#123c43` | Text on accent surfaces        |
| `success`    | `#4c9a4a` | Positive scores, confirmations |
| `danger`     | `#d8434b` | Errors, overfilled bands       |
| `warning`    | `#ebc94c` | Lock-soon countdown            |
| `info`       | `#3e7c86` | Informational elements         |

All component code references these tokens (Tailwind utilities), never raw hex values — enabling a future dark theme as a token swap.

## Radius tokens

| Token           | Value   | Usage                          |
| --------------- | ------- | ------------------------------ |
| `radius-btn-sm` | `11px`  | Small buttons, inline elements |
| `radius-btn`    | `14px`  | Standard buttons               |
| `radius-card`   | `20px`  | Card shells                    |
| `radius-badge`  | `999px` | Badge pills                    |

## Animation keyframes

### `chip-out`

Used when removing a team from a Band (review phase). 0.16s ease-in, shrinks and fades.

### `swap-pulse`

Feedback for a review-mode Band swap (issue #131). 0.5s ease-out — replaces a confirm dialog with a subtle pulse animation on both swapped team cards.

### `confetti-fall`

Submission celebration animation on `SubmittedMoment`. 1.1s ease-in — confetti pieces fall and rotate.

All animations are gated with `motion-safe:` at call sites to respect reduced-motion preferences.

## Font

- **Sans**: Geist (variable font, via `next/font`)
- **Mono**: Geist Mono (variable font)

Applied via CSS variables `--font-geist-sans` and `--font-geist-mono`.

## Light-only

v1 ships light-only. Dark theme tokens are deliberately not defined yet — they will be a token swap rather than a find-and-replace when added.

## Related

- [Components](components.md)
- [Kit Colors](kit-colors.md)
