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
the accent color spent sparingly and by rule (see _Accent budget_ below). Restraint everywhere else is what
makes those moments land.

## Card anatomy

Two card shapes exist, chosen by what a card needs to communicate, not by which screen it's on:

- **Plain surface** (`src/components/ui/Card.tsx`) — a single white surface, shadow-only (see Spacing & radius
  below), no border. Used where the whole card is one undifferentiated area: `/login`.
- **Ink-header shell** (`src/components/ui/CardShell.tsx`) — a three-part sandwich for cards that need a
  structural break between "identity" and "content": an ink header (`CardShellHeader`, `bg-ink`) carrying
  whatever most needs weight (club identity, a status chip), a kit-coloured seam (`CardShellSeam`) tying the
  header to what sits below it, and a white body (`CardShellBody`) for the interactive or detail content. Dark
  ink is used here as a _surface_, not just as text colour — that structural use of ink is what gives a card
  built this way its shape. Originated inside the Pick Board's Tipped Match card
  (`docs/adr/0007-home-surface-and-pick-entry.md`); extracted into `src/components/ui/` so a second screen can
  adopt the same shape without reading that component — Predict the Table's Band cards and picker sheet are
  that second consumer (issue #107). A card built from this shell can still end a state below the seam with
  more ink rather than a white body (see `TippedMatchCard.tsx`'s locked/live/finished states, which collapse to
  header + seam with no separate plate), or skip the seam entirely when there's no kit colour to bridge (a
  Table Band isn't two clubs — its cards go straight from header to body) — the seam and the white body are
  each one option, not a hard requirement of the shell.

Reach for the ink-header shell when a card's identity (which two clubs, whose pick) needs to read before its
content does. Reach for the plain surface everywhere else — it's the default, not a fallback.

Neither shape ever gets a border; depth comes from the shadow alone, on both (see "Visual direction" above:
"real depth, not flat bordered boxes"). The club-code badge used inside an ink header (`ClubCodeBadge`, in
`src/components/ui/`) always resolves its own text colour via `badgeTextColor()` — a caller only has to hand it
a fill that's already been run through `kit-colors.ts`'s contrast floor and clash rule for the grounds it'll
actually be drawn on (see the kit-colour rules under Palette below).

## Palette

| Token (Tailwind: `bg-<token>` / `text-<token>` / `border-<token>`) | Hex       | Usage                                                                               |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------- |
| `ink`                                                              | `#123c43` | Headings, primary text, nav, card ink                                               |
| `accent`                                                           | `#f0a63d` | See _Accent budget_ — two tiers, not a flat list                                    |
| `accent-ink`                                                       | `#123c43` | Text color used on top of `accent` backgrounds                                      |
| `success`                                                          | `#3d7b3c` | Correct pick, rank-up, season-total increases                                       |
| `danger`                                                           | `#c23540` | Wrong pick, rank-down                                                               |
| `warning`                                                          | `#ebc94c` | Locks-soon countdown, a corrected result, a Called Off match, other caution states  |
| `info`                                                             | `#3e7c86` | Bot / Admin / Late Joiner badges — neutral, non-alarming, never implies good or bad |
| `paper`                                                            | `#f6f3ec` | App background — warm, not stark white                                              |
| `paper-line`                                                       | `#e2dbc9` | Borders and hairlines on `paper`                                                    |

No other colors. Rank-movement indicators reuse `success`/`danger` rather than introducing a separate palette,
so color meaning stays consistent everywhere in the app, not just on the leaderboard.

**`success` and `danger` are light-ground tokens, and were darkened on 2026-08-21 to make that true.** At their
original values they failed AA in _every_ direction — `success` `#4c9a4a` measured 3.14:1 as text on `paper`,
3.47:1 on white, 3.44:1 as text on `ink`, and 3.14:1 as a **fill** under `paper` text. No usage rule could have
rescued a mid-tone that carries nothing, which is why the first attempt at this rule ("use it as a fill behind
paper text") prescribed something _worse_ than the defect it replaced.

Current values measure: `success` 4.63:1 on `paper`, 5.13:1 on white; `danger` 4.89:1 and 5.42:1. Because
contrast is symmetric, both now work **as text on a light ground** and **as a fill under `paper` text**. Use
whichever suits; prefer text colour, since a fill is a heavier object than most verdicts deserve.

They are still **not** text colours on an `ink` surface — that direction is a property of the ink, not of these
tokens. On ink, use a fill. This generalises the rule previously recorded under _Icons_ for rank-movement
glyphs only; it was never specific to movement.

**A Voided Match is `warning`, not `danger`.** It is a neutral non-event for every player equally; red says
"you got this wrong" to a ten-year-old. Player-facing copy calls it **Called off**, never "void".

## Accent budget

Amended 2026-08-20. This section previously existed in two places that disagreed — _Visual direction_ said
"exactly three" spots, the palette table listed a different four — so every accent question had two answers and
the 41 accent usages across the codebase could not be audited. One rule, in two tiers, because "exactly three"
was never going to survive having a `Button` primitive:

- **Emotional accent** — the three moments worth spending it on: the **1st-place leaderboard row**, a player's
  **own predicted scoreline**, and **Predict the Table's Champion Band pick**. Accent as a **fill**.
- **Functional accent** — the **primary button**, the **"You" badge**, the **active tab**, and the
  **focus ring**. Permitted, but **at most one functional accent object per viewport**.

Accent never appears on a **value**, a **label**, a **status or lifecycle chip**, **metadata or provenance**, or
a **secondary link**. Those use ink weight, not colour.

The focus ring is transient chrome and does not count against the per-viewport limit.

**Amended 2026-08-09**: the kit-colour exception below now also covers the **Tipped Match card** on the home
pick board, where club colour carries the three-letter badge and a bar beside each digit row — see
`docs/adr/0007-home-surface-and-pick-entry.md`. Two rules make that safe and are **mandatory wherever real kit
colours are rendered**, including Predict the Table:

- **Clash rule** — when both clubs' primary colours are too close to tell apart, the away side falls back to its
  secondary, then to `ink`. Deterministic, no per-fixture curation.
- **Contrast floor** — any kit whose luminance falls outside a readable band is mixed toward `paper` or `ink`,
  hue preserved, until it clears every ground it will be drawn on. Without this, black kits disappear against an
  ink surface and white kits disappear against a white one; both cases are real (Newcastle, Fulham).

Kit colours remain scoped to these two features. This does not reopen the palette generally.

**One deliberate, scoped exception**: Predict the Table's team cards (issue #26) show each club's real kit
colors as a two-tone stripe, at the product owner's explicit request after comparing options directly — real
club colors read clearer and pack more identity into less space than a flat code pill, and make each Band's
membership scannable as a group. This is presentation only (no crests — that trademark constraint is
unchanged) and is scoped to that one feature; it doesn't open the palette back up generally. See
`docs/adr/0003-predict-the-table-shape.md`'s build-log addendum.

## Text colour roles

Text colour comes from **named roles**, never from a hand-tuned alpha over `ink`. Twelve ink alphas were in use
across the app when this was written and five of them failed AA; more importantly, an alpha over `ink` inverts
meaninglessly the moment `ink` becomes a light colour, which is exactly what the _Dark mode_ commitment below
says the component layer exists to prevent.

| Role                | Ground | Contrast on `paper` | Use                                                          |
| ------------------- | ------ | ------------------- | ------------------------------------------------------------ |
| `text`              | light  | 12.0:1              | Headings, primary text, any number a player reads            |
| `text-muted`        | light  | 4.6:1               | Secondary text — the floor for anything carrying meaning     |
| `text-decorative`   | light  | 2.0:1               | Dividers, disabled glyphs. **Never text a player must read** |
| `text-on-ink`       | ink    | —                   | Primary text on an ink surface                               |
| `text-on-ink-muted` | ink    | 6.2:1               | Secondary text on an ink surface                             |

Three roles per ground, no more. `text-muted` is the AA floor; anything quieter is decorative by definition.

## Typography

Geist only (already wired via `next/font/google` in `layout.tsx`) — no second typeface. Hierarchy comes from
Geist's full variable weight range, not a second family:

| Role                                   | Weight | Size (mobile) | Notes                           |
| -------------------------------------- | ------ | ------------- | ------------------------------- |
| Display (score/rank, read at a glance) | 800    | `1.75rem`     | `tabular-nums` — see note below |
| H1 (page title)                        | 800    | `1.9rem`      |                                 |
| H2 (section / gameweek header)         | 700    | `1.3rem`      |                                 |
| Body                                   | 400    | `1.0625rem`   | max `52ch` line length          |
| Dense list body                        | 400    | `0.9rem`      | Leaderboard rows and similar    |
| Caption / secondary                    | 400    | `0.8rem`      | `text-muted`                    |
| Label (uppercase, tracked)             | 700    | `0.7rem`      | `letter-spacing: 0.08em`        |
| Micro-label (inside chips only)        | 800    | `0.7rem`      | `letter-spacing: 0.06em`        |

**Display was `clamp(2.5rem, 7vw, 3.25rem)` and nothing ever used it.** Corrected 2026-08-21 to `1.75rem`, the
size the Tipped Match card's scoreline actually renders and the one that has been through real-device review.
Three definitions of "how big is a score" existed at once — this table, a `T.score` token at `1.5rem`, and a
hardcoded `1.75rem` — so the same scoreline rendered at two sizes on adjacent surfaces.

**The scale is closed** (amended 2026-08-20). Those are the only values, and no Tailwind size keywords
(`text-xs` … `text-xl`) appear in app code. **`0.7rem` is a hard floor** — nothing in this app is set smaller,
at any weight, on any ground. The youngest players are ten and the app is read over a shoulder on a shared
phone. Before this amendment the app shipped text at `0.55rem` and used eighteen distinct sizes; the Label role
was specified at `0.8rem` and implemented at six different sizes and four different trackings.

`font-variant-numeric: tabular-nums` on every numeric display (scores, ranks, countdowns) so digits never
jitter mid-column — apply via Tailwind's `tabular-nums` utility, don't hand-roll.

## Numbers and units

Points are labelled exactly one way per context, and there are three contexts:

1. **A total** — a bare numeral, `tabular-nums`, with the word `points` as a Label beside or beneath it.
   **Exception, added 2026-08-21:** inside a dense repeated row — a week heading in a season-length list — `pts`
   is permitted, because `points` at that repetition rate is the noisier choice. ADR 0013 D16 relies on this.
   `Pts`, `PTS`, `Season points` and `Per week` remain retired.
2. **A delta** — signed and abbreviated, inline: `+5`. **`+` means points gained and nothing else**, so a value
   of zero renders `0`, never `+0`, and an absent value renders blank.
3. **A rate** — `4.3/wk`, only on a leaderboard row.

`PTS`, `Pts`, `Season points` and `Per week` are retired. A fraction (`118/200`) always carries its unit as a
Label.

Four facts must always render differently, because a single muted dash previously carried all of them:

| Fact                      | Rendering                              |
| ------------------------- | -------------------------------------- |
| Didn't pick               | the words `no pick` — never a dash     |
| Picked and scored nothing | `0`                                    |
| Not played yet            | blank                                  |
| Called off                | `off` in a row, `Called off` on a chip |

**A pick and the result it is judged against are shown side by side, never one restated as prose**
(added 2026-08-23). On a finished Tipped Match card the Player's own scoreline sits in its own column beside
the result, captioned `YOU` and `RESULT`, one number per team row — the same comparison the picks record makes
with its `PICK` / `FINAL` columns, so the two surfaces read the same way. It replaces a `You tipped 1–3` line
below the seam, which put the two halves of one comparison in different places and in different grammars. The
own-pick column steps one stop down the type scale (`h2` against the result's `score`) and keeps the accent;
the result keeps `paper`. The caption is `RESULT`, not `FINAL`, only because the status chip on the same card
already says `FINAL`.

The column is dropped entirely when no pick was filed, rather than showing an empty one — a dash there would
break the four-facts rule directly above it, so the card falls back to the single result column and says
`No pick filed` in words.

**Measured note, 2026-08-23.** The second column costs the team name ~50px. At 375px the name row affords
155px, which holds every current club name except `Brighton & Hove Albion` (191px) and `Tottenham Hotspur`
(160px), both of which truncate on a finished card only. Captions are rendered in a row spanning the grid
rather than as grid cells, so a caption wider than the digits beneath it can't widen the column — that alone
was worth 24px, the difference between holding and clipping `Manchester United`.

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
to cards, not to every element (buttons stay flat). The literal lives in **one** place in code; four copies of
it existed when this was written.

**One card inset: `px-4` at mobile, on every card, on every screen.** Vertical padding varies with density
(`py-2` a dense row, `py-3` standard, `py-3.5` a header); horizontal never does, and a card's contents never
step in or out from its own header.

`rounded-full` is not used in app code — pills use `radius-badge`. Inline chips and stat tiles use
`radius-btn-sm`.

### Affordances

So that "this is tappable" has one signal rather than five:

- **Navigation `›`** means "this card is a door to another screen" and sits at the **end of the card's own
  header line**, once per card — never on a row inside a card. Where a card is a door, only its heading is the
  tap target; the rows beneath are inert, so a scroll that ends in a slight tap can't navigate away.
- **Expansion carries a `ChevronDown`** that rotates when open — on the leaderboard row's stat panel and on
  Predict the Table's Band headers alike. Amended 2026-08-23: this briefly said expansion carried no glyph, on
  the grounds that `aria-expanded` and the panel's own presence are the signal. They are — but only _after_ a
  player has discovered the gesture, and nothing told them it was there. The width that removing it was meant
  to buy turned out not to exist (see _Team display_ note below), so it cost discoverability for nothing.
- **Direction glyphs are fixed by meaning**: `ChevronRight` navigates forward, `ChevronLeft` goes back. Arrows
  are **not** navigation — `→` is reserved for "became", as in a pick against a result.
- Anything tappable that is not a card uses the `Button` primitive.
- **Every interactive element carries the focus ring.** No exceptions.

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

**Resolved 2026-08-16 — the circle chip wins.** A player's emoji renders inside a small circle chip
(mini-avatar treatment), not inline beside their name. Decided by building both against a realistic 16-row
leaderboard and comparing directly (`docs/adr/0012-leaderboard-view.md` D11): inline emoji sit at name size and
disappear into the text line, while a chip gives the player a fixed, findable object at a consistent position
down the column. **The login list should follow this**, rather than diverging — it's the other screen this
question was parked for.

Two rules the leaderboard settled alongside it, both worth honouring wherever the chip is reused:

- **The chip's fill is never used to signal state.** An early leaderboard pass tinted the signed-in player's own
  chip accent and it was rejected: the emoji is the one element a player chose for themselves, and recolouring
  it puts the palette on top of their identity, making the chip read as a system state rather than as them.
  Own-row emphasis moved to an accent stripe on the card's left edge instead. The chip's only fill variation is
  the muted ground used for an ineligible entrant.
- **Rank movement can't live on an ink ground.** `success`/`danger` don't clear the contrast floor against
  `ink`, so a movement indicator drawn on a dark surface loses its colour coding entirely and falls back to the
  ▲/▼ glyph alone. Keep movement on a light ground so it keeps both signals.

## Copy tone

Playful, brief — not flat/utilitarian, not try-hard. Examples:

- Empty state: "No picks yet — the pitch is waiting!" (not "You have no predictions.")
- Error: state what went wrong and how to fix it, still warm — "That PIN didn't match. 4 more tries before a
  short break." (not "Invalid PIN." and not a scolding tone either)

Never contradicts the kid-friendly language rules already in `CLAUDE.md` (`prediction`/`pick`/`points`, never
`bet`/`odds`/`wager`).

## Team display in fixtures

**Three-letter initials badge** (e.g. `ARS` vs `CHE`) next to the team name — no crests or logos anywhere (not
just a style call: official club crests are trademarked, so this is a hard constraint, not a preference).
Scannable at a glance in a dense list; more designed than plain text alone.

On the Tipped Match card the badge is filled with the club's kit colour (per the Palette amendment above,
subject to the clash rule and contrast floor), with its text colour flipped to `ink` or `paper` by measured
luminance rather than hardcoded per club. Elsewhere the badge stays `ink` on `paper`.

**Home and away are stated where there is room, and given weight where there isn't** (amended 2026-08-20).
Order alone is a convention adults read fluently and ten-year-olds don't. The original rule required an explicit
`home` label on every card; in practice both the shipped Tipped Match card and the Match Centre prototype
removed it for the same reason — it costs the width the scoreline needs — so the doc was describing a rule
nothing followed.

The rule now has two forms:

- **Where the fixture has a line to itself** (the reveal's column header, the Predict the Table board), state
  it: `NEW (home) v AVL`.
- **Where it shares a line with numbers** (compact picks rows, the Tipped Match card's team rows), give the
  home side **visual dominance** instead — home code at full `text` weight 700, `v` in `text-decorative`, away
  code at `text-muted` weight 500. First code is home becomes learnable within a screen.

A rendered scoreline is still flanked by both badges on the Tipped Match card, so `2–1` can't be read
backwards there.

**Measured note on row width, 2026-08-23.** `docs/adr/0012` D4 asks the leaderboard row to hold a
20-character display name without truncation. It doesn't, and can't at 375px: a real 20-character name needs
172px and the row affords 172px at 393px with nothing to spare, 141px at 375px. Removing or restoring the
expansion chevron changes that by ~14px and does not change the outcome. D4's promise needs revisiting — by
shortening what else the row carries, not by stripping affordances.

## Match Centre structure

**Amended 2026-08-20** — see `docs/adr/0013-match-centre-tense-and-axes.md`. Match Centre is not a
destination; it is the Pick Board's past tense, at `/gameweek/[n]`. The archive is a **control, not a page**: a
horizontally scrollable strip of gameweek chips, each carrying the viewer's points for that week, with month
dividers as landmarks and step controls at the bottom of the page where reading ends. There is no `/gameweek`
index.

What the original rule was protecting still holds — the old app's single undifferentiated scroll of every match
ever played is exactly what the strip prevents, and it does so without spending a destination on a list of
links.

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
