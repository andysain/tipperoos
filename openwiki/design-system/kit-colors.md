---
type: concept
title: Club Kit Colors
description: Club-specific colour mapping for Premier League teams, three-step away-fill clash rule with Euclidean distance threshold (100), HSL contrast floor enforcement (20 steps), and fallback for unknown clubs.
tags: [design-system, kit-colors, clubs, badge, contrast, clash-rule]
---

# Club Kit Colors

The kit colors module at `src/lib/teams/kit-colors.ts` maps each Premier League club to its home-kit colours and provides rendering helpers. Previously duplicated between PredictTableFlow and TippedMatchCard, now a single shared source.

## Colour map

Each club maps to a `[primary, secondary]` colour pair:

| Club          | Short code | Primary   | Secondary |
| ------------- | ---------- | --------- | --------- |
| Arsenal       | ARS        | `#DB0007` | `#FFFFFF` |
| Aston Villa   | AVL        | `#670E36` | `#95BFE5` |
| Bournemouth   | BOU        | `#DA291C` | `#000000` |
| Brentford     | BRE        | `#E03A3E` | `#FFFFFF` |
| Brighton      | BHA        | `#0057B8` | `#FFFFFF` |
| Chelsea       | CHE        | `#034694` | `#034694` |
| Coventry      | COV        | `#78C4F5` | `#78C4F5` |
| Crystal Pal.  | CRY        | `#C4122E` | `#1B458F` |
| Everton       | EVE        | `#003399` | `#003399` |
| Fulham        | FUL        | `#FFFFFF` | `#000000` |
| Hull          | HUL        | `#F18A00` | `#000000` |
| Ipswich       | IPS        | `#0044A9` | `#0044A9` |
| Leeds         | LEE        | `#FFFFFF` | `#FFCD00` |
| Liverpool     | LIV        | `#C8102E` | `#C8102E` |
| Man City      | MCI        | `#6CABDD` | `#6CABDD` |
| Man Utd       | MUN        | `#DA291C` | `#000000` |
| Newcastle     | NEW        | `#000000` | `#FFFFFF` |
| Nott'm Forest | NOT        | `#DD0000` | `#FFFFFF` |
| Sunderland    | SUN        | `#EB172B` | `#FFFFFF` |
| Tottenham     | TOT        | `#FFFFFF` | `#132257` |

`CLUB_COLORS` holds 20 entries keyed by `short_code`. Where only one colour was sourced, both stops are the same (solid stripe). Unknown clubs (or null shortCode) use a grey fallback `["#9CA3AF", "#6B7280"]` via `kitColors()` — a promoted club whose code isn't in the map degrades to grey rather than throwing, so adding a club is a one-line map entry.

## Three-step away-fill clash rule (`matchBadgeColors`)

When two clubs' badge colours are too similar (home vs away), the away badge colour uses a three-step fallback:

```
1. Try away-secondary colour
2. If that still clashes → try away-primary colour
3. If that also clashes → use INK (#123c43) as a neutral fallback
```

The clash check uses **Euclidean RGB distance** with `CLASH_MIN_DISTANCE = 100`:

```typescript
const CLASH_MIN_DISTANCE = 100;

function colorDistance(a: string, b: string): number {
  // Euclidean distance in RGB space between two hex colours
}
```

The threshold of 100 is calibrated against the actual palette: same-family reds (Arsenal/Bournemouth/Man Utd/Liverpool) cluster at 46-53; genuinely distinct pairs (Arsenal red vs Chelsea navy, Chelsea vs Man City blues) sit at 163+. 100 sits cleanly in the gap.

Euclidean RGB distance is used instead of WCAG contrast ratio because the clash rule solves a different problem: visual confusion when two similar colours sit side by side (e.g., Arsenal red vs Man Utd red), not text-on-background readability.

## Contrast floor

`badgeTextColor(fill)` and `applyContrastFloor()` ensure a kit colour rendered on a light (`PAPER = #f6f3ec`) or dark (`INK = #123c43`) ground maintains readability:

### HSL algorithm

The `applyContrastFloor(fill, ground)` function moves the colour in **HSL space**:

1. Convert the fill colour to HSL
2. Compare luminance against the ground's luminance using WCAG contrast ratio (minimum **3.0:1**)
3. If the ratio is below the floor:
   - Direction is fixed once per ground from the colour's starting position
   - If the fill is darker than the ground: **increase L** (move toward white `PAPER`)
   - If the fill is lighter than the ground: **decrease L** (move toward black `INK`)
4. The L component is adjusted in steps of 0.04; **hue and saturation are preserved** (only lightness changes)
5. Maximum `CONTRAST_FLOOR_MAX_STEPS = 20` — if the floor still isn't cleared after 20 steps, the original colour is returned unchanged as a safety valve

### Constants

| Constant                   | Value | Notes                                        |
| -------------------------- | ----- | -------------------------------------------- |
| `CONTRAST_FLOOR_MIN_RATIO` | 3.0   | WCAG 2.1 SC 1.4.11 non-text contrast minimum |
| `CONTRAST_FLOOR_STEP`      | 0.04  | HSL lightness increment per step             |
| `CONTRAST_FLOOR_MAX_STEPS` | 20    | Safety valve                                 |

### badgeTextColor

Determines whether text on a kit-colour background should be INK or PAPER by measuring WCAG contrast ratio against both grounds and picking the one with better contrast.

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

The `stripeStyle(c1, c2, angle)` function renders a two-tone gradient bar with a hairline divider and faint outer ring. A flat single-colour stripe (c1 === c2) gets a solid fill with a subtle inset border — no fake midline seam.

The `teamFill()` helper (in `predict-table/shared.tsx`) provides the fill colour for table-prediction team cards.

## Related

- [Design Tokens](tokens.md)
- [Components](components.md)
- [Tipped Match Card](../pick-board/tipped-match-card.md)
- [Predict Table React Flow](../table-predictions/react-flow.md)
