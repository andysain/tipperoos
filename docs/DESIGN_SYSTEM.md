# Tipperoos — Design System

Read `docs/FRONTEND_BRIEFING.md` first for product-level UI context (screens, constraints, domain vocabulary).
This doc is the visual/interaction spec that briefing points to — the actual palette, type scale, and component
conventions, decided (not left to whoever builds the first screen to improvise).

## Visual direction

**"Matchday Program"** — playful, not childish. The palette is drawn from things football already means
(floodlights, trophy gold, pitch green, the yellow/red card) rather than generic "sporty blue" or Premier
League broadcast branding (deliberately avoided — trademark caution, and this gives Tipperoos its own identity).

Three alternative directions were explored and compared (a brighter "Sticker Book" concept and a cooler
"Scoreboard" concept) before settling here. Sticker Book was rejected as too visually loud at this app's actual
data density (long leaderboards, dense Match Centre) and reading younger than the "playful, not childish" call
wants. Scoreboard was rejected as too close to "muted/clean" — polished, but the wrong kind of restrained for
what this app should feel like.

The shipped direction takes the base Matchday palette and adds two deliberate, sparing touches of richness
rather than decorating everything: a soft warm lift-shadow on cards (real depth, not flat bordered boxes), and
the accent color reserved for exactly two emotionally-relevant spots — the 1st-place leaderboard row, and a
player's own predicted scoreline. Restraint everywhere else is what makes those two moments land.

## Palette

| Token (Tailwind: `bg-<token>` / `text-<token>` / `border-<token>`) | Hex       | Usage                                                                               |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------- |
| `ink`                                                              | `#123c43` | Headings, primary text, nav, card ink                                               |
| `accent`                                                           | `#f0a63d` | Primary actions, "You" badge, 1st-place tint, your own predicted scoreline          |
| `accent-ink`                                                       | `#123c43` | Text color used on top of `accent` backgrounds                                      |
| `success`                                                          | `#4c9a4a` | Correct pick, rank-up, season-total increases                                       |
| `danger`                                                           | `#d8434b` | Wrong pick, rank-down, Voided Match                                                 |
| `warning`                                                          | `#ebc94c` | Locks-soon countdown, other caution states                                          |
| `info`                                                             | `#3e7c86` | Bot / Admin / Late Joiner badges — neutral, non-alarming, never implies good or bad |
| `paper`                                                            | `#f6f3ec` | App background — warm, not stark white                                              |
| `paper-line`                                                       | `#e2dbc9` | Borders and hairlines on `paper`                                                    |

No other colors. Rank-movement indicators reuse `success`/`danger` rather than introducing a separate palette,
so color meaning stays consistent everywhere in the app, not just on the leaderboard.

## Typography

Geist only (already wired via `next/font/google` in `layout.tsx`) — no second typeface. Hierarchy comes from
Geist's full variable weight range, not a second family:

| Role                                   | Weight | Size (mobile)                 | Notes                                 |
| -------------------------------------- | ------ | ----------------------------- | ------------------------------------- |
| Display (score/rank, read at a glance) | 800    | `clamp(2.5rem, 7vw, 3.25rem)` | `tabular-nums`                        |
| H1 (page title)                        | 800    | `1.9rem`                      |                                       |
| H2 (section / gameweek header)         | 700    | `1.3rem`                      |                                       |
| Body                                   | 400    | `1.0625rem`                   | max `52ch` line length                |
| Label (uppercase, tracked)             | 700    | `0.8rem`                      | `letter-spacing: 0.08em`              |
| Caption (muted)                        | 400    | `0.875rem`                    | `color: var(--text-muted)`-equivalent |

`font-variant-numeric: tabular-nums` on every numeric display (scores, ranks, countdowns) so digits never
jitter mid-column — apply via Tailwind's `tabular-nums` utility, don't hand-roll.

## Spacing & radius

Spacing uses Tailwind's default 4px-based scale — no override. Page padding steps `p-4` (mobile) → `md:p-6` →
`lg:p-8`, per the mobile-first rule already in `FRONTEND_BRIEFING.md`.

Radius tokens (Tailwind v4 `--radius-*` theme keys, generate `rounded-<name>` utilities):

| Token           | Value   | Usage                                       |
| --------------- | ------- | ------------------------------------------- |
| `radius-btn-sm` | `11px`  | Small buttons, tap chips (scoreline picker) |
| `radius-btn`    | `14px`  | Default buttons                             |
| `radius-card`   | `20px`  | Cards (match cards, leaderboard container)  |
| `radius-badge`  | `999px` | Badges/pills                                |

Card shadow: `0 10px 24px -12px rgba(18, 60, 67, 0.28)` — a soft, warm-tinted lift, not a hard offset. Applied
to cards, not to every element (buttons stay flat).

## Motion

Restrained delight, not minimal-only and not maximal. Micro-interactions on key moments — saving a pick,
revealing a result — not on everything. Always respect `prefers-reduced-motion: reduce`.

**Celebration moments are tiered, not uniform**: an ordinary gameweek result gets the accent-color tint
treatment only (see Palette). The **season-winner reveal** — rare, once a season, high emotional value — earns
a fuller moment (e.g. a brief confetti burst). Don't spend the same delight budget on both; the everyday case
staying subtle is what makes the season-end moment actually feel special.

## Icons

**`lucide-react`**, restyled to match the brand — stroke width and color tuned to sit with the rest of the
system (`stroke-ink` by default, `stroke-2`), not used at its default styling out of the box. Reserved for
functional UI chrome: navigation, lock/unlock state, chevrons, filters.

Emoji stay the personalization layer, separate from functional icons: bot (🤖), player-chosen emoji, flags.
Never use emoji where a functional icon is needed (rendering is inconsistent across platforms for that use);
never use a functional icon where personalization is the point.

**Open / deferred**: whether a player's emoji renders inline next to their name or inside a small colored
circle chip (mini-avatar treatment) is undecided — resolve when the leaderboard/login screens are actually
built, not before.

## Copy tone

Playful, brief — not flat/utilitarian, not try-hard. Examples:

- Empty state: "No picks yet — the pitch is waiting!" (not "You have no predictions.")
- Error: state what went wrong and how to fix it, still warm — "That PIN didn't match. 4 more tries before a
  short break." (not "Invalid PIN." and not a scolding tone either)

Never contradicts the kid-friendly language rules already in `CLAUDE.md` (`prediction`/`pick`/`points`, never
`bet`/`odds`/`wager`).

## Team display in fixtures

**Two-letter initials badge** (e.g. `ARS` vs `CHE`) next to the team name — no crests or logos anywhere (not
just a style call: official club crests are trademarked, so this is a hard constraint, not a preference).
Scannable at a glance in a dense list; more designed than plain text alone.

## Match Centre structure

**Grouped by gameweek, collapsible** — one collapsed section per gameweek, expand to see that week's two
Tipped Matches (or one, if a slot was skipped). This directly replaces the old app's Match Centre pattern (one
giant, undifferentiated vertical scroll of every match ever played) with something that scales to a full
38-gameweek season without becoming unusable on a phone.

## Notification emails

**Lightly branded, simple** — palette and type nod to the app (accent color for the headline, Geist-adjacent
system font stack since custom fonts don't render reliably across email clients), but a plain single-column
template, not a full visual replica of the app. Email rendering is inconsistent enough across clients that a
heavier design investment here isn't worth it — but see `CLAUDE.md` → _Notifications_: these two emails
(pre-lock reminder, post-result score/rank) are the single highest-leverage retention feature in the product,
so "simple" must not mean "an afterthought" — get the copy tone and one accent touch right even if the layout
stays plain.

## Dark mode

**Token-ready, not shipped.** `CLAUDE.md` and the earlier `FRONTEND_BRIEFING.md` decision commit to light-only
for v1 — that's unchanged. What changes here: all component code must reference the named tokens above (Tailwind
utilities generated from `@theme`), never a raw hex value inline. That's what makes a future dark palette a
token-value swap instead of a find-and-replace across every component. No dark values are defined yet — don't
invent them speculatively; wait until dark mode is actually being built.

## Component build order

**Incrementally, as needed** — build a shared primitive (`Button`, `Badge`, `Card`, etc.) the first time it's
actually needed by a real screen, and promote it to a shared location the moment a second screen needs the same
thing. Mirrors the existing file-layout philosophy in `docs/standards/TESTING_STANDARD.md` §6 ("a module used by
exactly one route starts inline or beside it"). No upfront full component library — building components before
their real usage is clear risks guessing wrong about the API.

Use `tailwind-variants` for any component with more than one visual variant (button color/size, badge type,
card state) — type-safe, slot-based, automatic Tailwind class-conflict resolution. Don't hand-roll `clsx` chains
for anything with more than two variants.

## Reference

- `docs/FRONTEND_BRIEFING.md` — product-level UI context, screens, domain vocabulary.
- `docs/standards/TESTING_STANDARD.md` §5, §7, §9 — approved packages, canonical exemplars, installed-skill notes.
- `CLAUDE.md` — product spec; wins if this doc and it ever disagree on product behavior (this doc only governs
  visual/interaction design, not product rules).
