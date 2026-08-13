---
type: concept
title: Club Kit Colors
description: Club-specific colour mapping for Premier League teams, three-step away-fill clash rule with Euclidean distance threshold, HSL contrast floor enforcement, and fallback for unknown clubs.
tags: [design-system, kit-colors, clubs, badge, contrast, clash-rule]
---

# Club Kit Colors

The kit colors module at `src/lib/teams/kit-colors.ts` maps each Premier League club to its home-kit colours and provides rendering helpers. Previously duplicated between PredictTableFlow and TippedMatchCard, now a single shared source.

## Colour map

Each club maps to a `[primary, secondary]` colour pair:

| Club        | Short code | Primary   | Secondary |
| ----------- | ---------- | --------- | --------- |
| Arsenal     | ARS        | `#DB0007` | `#FFFFFF` |
| Aston Villa | AVL        | `#670E36` | `#95BFE5` |
| Bournemouth | BOU        | `#DA291C` | `#000000` |
| Brentford   | BRE        | `#E03A3E` | `#FFFFFF` |
| Brighton    | BHA        | `#0057B8` | `#FFFFFF` |
| Chelsea     | CHE        | `#034694` | (solid)   |
| ...         | ...        | ...       | ...       |

Where only one colour was sourced, both stops are the same (solid stripe). Unknown clubs (or null shortCode) use a grey fallback `["#9CA3AF", "#6B7280"]`.

## Three-step away-fill clash rule (`matchBadgeColors`)

When two clubs' badge colours are too similar (home vs away), the away badge colour uses a three-step fallback:

```
1. Try away-secondary colour
2. If that still clashes → try away-primary colour
3. If that also clashes → use INK (#123c43) as a neutral fallback
```

The clash check uses **Euclidean RGB distance** with `CLASH_MIN_DISTANCE = 250`:

```typescript
function colorDistance(a: string, b: string): number {
  // Euclidean distance in RGB space between two hex colours
}
```

Euclidean RGB distance is used instead of WCAG contrast ratio because the clash rule solves a different problem: visual confusion when two similar colours sit side by side (e.g., Arsenal red vs Man Utd red), not text-on-background readability. Two colours with identical hue but different luminance can have poor WCAG contrast (same luminance) yet still look clearly distinct to a viewer — RGB distance captures the "are these the same colour family" judgement better.

## Contrast floor

`badgeTextColor(fill)` and `applyContrastFloor()` ensure a kit colour rendered on a light (`PAPER = #f6f3ec`) or dark (`INK = #123c43`) ground maintains readability:

### HSL algorithm

The `applyContrastFloor(fill, ground)` function moves the colour in **HSL space**:

1. Convert the fill colour to HSL
2. Compare luminance (the L component) against the ground's luminance
3. If the difference is below `MIN_LUMINANCE_DIFFERENCE = 0.35`:
   - If the fill is lighter than the ground: **increase L** (move toward white)
   - If the fill is darker than the ground: **decrease L** (move toward black)
   - If the two are equal: **decrease L** (move toward the darker side)
4. The L component is adjusted in steps; **hue and saturation are preserved** (only lightness changes)
5. Maximum `CONTRAST_FLOOR_MAX_STEPS = 12` — if the floor still isn't cleared after 12 steps, the original colour is returned unchanged as a safety valve

### badgeTextColor

Determines whether text on a kit-colour background should be INK or PAPER by comparing luminance against both grounds and picking the one with better contrast.

## Palette tokens

| Token   | Hex       | Role                           |
| ------- | --------- | ------------------------------ |
| `INK`   | `#123c43` | Dark ground (card headers)     |
| `PAPER` | `#f6f3ec` | Light ground (page background) |

## Rendering components

The `ClubCodeBadge` component (`src/components/ui/ClubCodeBadge.tsx`) renders a rounded-rect club-code chip with the club's kit colour as background and auto-resolved text colour:

```tsx
<ClubCodeBadge
  shortCode="ARS"
  fill={matchBadgeColors(homeShortCode, awayShortCode)}
/>
```

The `teamFill()` helper (in `predict-table/shared.tsx`) provides the fill colour for table-prediction team cards.

## Related

- [Design Tokens](tokens.md)
- [Components](components.md)
- [Tipped Match Card](../pick-board/tipped-match-card.md)
- [Predict Table React Flow](../table-predictions/react-flow.md)
