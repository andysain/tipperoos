# Match Centre — implementation plan and issue set

Design is settled: `docs/adr/0013-match-centre-tense-and-axes.md` holds the
decisions, the throwaway branch `prototype/match-centre-design` holds the working reference,
and `docs/production-ui-findings.md` holds the defects the prototype surfaced
in shipped code.

This document is the bridge: how to get from that prototype to production, in
what order, and what each issue owns. **Nothing here has been filed yet.**
Delete this document once the issues are live.

Andy expects to keep tweaking the visual detail; the structure below is what
should be stable.

---

## The shape of the work

Four surfaces change and two are new:

| Surface             | State                                        |
| ------------------- | -------------------------------------------- |
| `/` Pick Board      | restructured — summary section, card changes |
| `/gameweek/[n]`     | **new** — the reveal (match axis)            |
| `/picks/[playerId]` | **new** — the picks record (player axis)     |
| `/leaderboard`      | defect fixes + the panel's link out          |

The dependency that shapes the order is not between surfaces — it is
underneath them. Three of the four screens are blocked on the same thing: a
house style that currently exists in a prototype file and nowhere else, and a
design system that contradicts itself about accent. **Every screen fix
re-litigates the same token questions until that lands.** So it goes first,
even though it ships nothing a player can see.

Second ordering constraint: the two new routes are the deliverable, but the
defects the prototype found in the **shipped** leaderboard and match card are
independent of them and can run in parallel — different files, no shared
state.

---

## Sequence

```
  A  Design-system amendments  (docs; needs one decision from Andy)
        │
  B  UI primitives + tokens    (implements A; touches many files)
        │
        ├─────────────┬──────────────┬────────────────┐
  C  Match card    D  Leaderboard  E  Home         F  #91 /gameweek/[n]
     defects         defects         restructure      (the match axis)
        │                                                  │
        └──────────────────────────────────────────────────┤
                                                     G  /picks/[playerId]
                                                        (the player axis)
```

`#33` (Voided / Skipped states) and `#157` (Table Prediction score) already
exist and now have designs to build against; they slot in beside E and F.

---

## A — Design-system amendments

**Docs only, but it blocks B, and one part of it is a decision only Andy can
make.**

`DESIGN_SYSTEM.md` currently gives **two different lists** of sanctioned
accent uses (line 21 says "exactly three"; the palette table lists a different
four). Until that is resolved, every accent question has two answers and the
41 accent usages across 13 files can't be audited. `docs/production-ui-findings.md`
→ **P0** states the problem and proposes a two-tier rule; that proposal needs
accepting, amending or rejecting before B starts.

The rest are corrections the prototype and the reviews established:

- **Close the type scale.** Seven values, a hard `0.7rem` floor, no Tailwind
  size keywords in app code. Nothing in the repo currently matches the spec'd
  `0.8rem` Label, and production ships text at `0.55rem`.
- **Name the text roles.** Twelve ink alphas are in use; five fail AA. Define
  `text` / `text-muted` / `text-decorative` / `on-ink` / `on-ink-muted` as
  theme tokens with baked hex values, because an alpha over `ink` inverts
  meaninglessly when ink becomes a light colour — which is the exact thing
  the dark-mode section says the component layer exists to prevent.
- **Extend the `success`-on-ink rule.** Already recorded for movement glyphs;
  it is palette-wide. `success` on `ink` measures 3.44:1.
- **Card anatomy is already stated and already broken** — six components ship
  a third, bordered, shadowless card shape.
- **Restate or retire the home/away rule.** "Home and away are stated, not
  implied" is now honoured by nothing: the shipped card dropped the label,
  and so has the prototype, both for the same reason (it costs width the
  score needs). Decide which way it goes rather than leaving the doc
  describing a rule the code doesn't follow.
- **Add three grammars the system doesn't yet rule on**: one card inset
  (`px-4`), one unit grammar for points (nine are in use), and an affordance
  grammar (five signals for "this is tappable", two of them the same control).

**Done when:** `DESIGN_SYSTEM.md` has one accent rule, a closed type scale, a
named text-role table, and the three new grammars — and `docs/production-ui-findings.md`'s
P0 is struck through with the decision recorded.

---

## B — UI primitives and tokens

**Implements A. Touches a lot of files; ships no new feature.** Worth its own
issue precisely because folding it into a feature issue is how it gets
half-done.

- Theme tokens for the named text roles; `bg-white` promoted to a surface
  token.
- **A focus ring, applied app-wide.** `grep -rn "focus-visible" src/` returns
  zero matches today. Every interactive card and button falls back to the
  browser default.
- `src/components/ui/`: `StatusChip`, a `Label` token, `Points` +
  `pointTone`, `PlayerChip` (the emoji circle chip, one rendering everywhere),
  and the card shadow in **one** place — the literal is currently copied
  across five files.
- `ordinal()` to `src/lib/format/` — four copies exist, and one call site
  renders `1nd`.

Reference implementations for all of these are in the prototype's
`shared.tsx`.

**Done when:** the tokens exist, the primitives exist and are used by at least
one production surface, no app code sets a raw ink alpha or an off-scale size,
and tabbing through `/`, `/leaderboard` and `/predict-table` shows the app's
own focus ring.

---

## C — Match card defects (`TippedMatchCard`)

Independent of the new routes; can run in parallel with D, E, F.

- **Two icon swaps.** `Dices` → `Shuffle` (a pair of dice is the most
  gambling-coded glyph in any icon set, on an app whose spec bans gambling
  language) and `Star` → `Flame` (`docs/in-app-help-spec.md` says not to hint
  at the deferred Star Match feature; a star does exactly that).
- **Accent off** the provenance label and the `locked` status chip — both
  compete with the card's one legitimate accent, the player's own predicted
  scoreline.
- **`success` off ink**, including _"You called it exactly"_ at 3.44:1.
- **Per-card close time.** The two tipped matches have different kickoffs, so
  a single section-level deadline is only ever the earlier one — and missing
  a lock is the one irreversible failure in the product.
- The `Open` chip says nothing a visible row of tappable digits doesn't; the
  close time replaces it.
- Add the half-played rendering: when this match is final and its sibling
  isn't, the result goes in the header and the player's own pick moves to a
  row beneath the seam.

**Done when:** no accent outside the sanctioned list, no `success` text on
ink, each card states its own close time, and a half-played gameweek renders
both cards correctly on a Preview URL.

---

## D — Leaderboard defects (`LeaderboardRowCard`)

All from `docs/production-ui-findings.md` P1–P6. Independent of the new routes.

- **P1 is an ADR breach:** `open` is per-row `useState`, so any number of
  panels can be open at once, against `docs/adr/0012` D11's _"one card is open
  at a time, so the list never doubles in height"_ — the guarantee D11 chose
  the panel on. Lift the state to the list.
- Type sizes, ink alphas and the `BOT` label's contrast (P2–P5).
- **P6:** D4's "20-character display name without truncation" doesn't hold at
  390px; it truncates around 16, worst on the signed-in player's own row.
  Dropping the chevron recovers 26px and loses nothing.
- Copy: `Spot on` → `Exact score` (the app has four names for one concept;
  `Right result` already matches `MATCH_SCORING_TERMS[0]`), `NEW` → `1st wk`
  in ink so it stops competing with the teal `BOT` 20px away, and the stat
  denominators read `7 of 44`.
- One line above the list — _"Bots play too, but only a real player can win
  the season."_ This is the only change that actually **teaches** `docs/adr/0012`
  D12's rule; a 30% dim and an 8.8px label can only hint at it.

**Done when:** one panel opens at a time, nothing renders below `0.7rem` or
below AA contrast, a 20-character name fits, and the bots line is on screen.

---

## E — Home restructure

Depends on B. Overlaps `#157` (the Table Prediction score) — build the strip's
shape here, let #157 fill in the number.

- The summary section: recap block + ladder, both doors, heading-only tap
  targets.
- The recap renders the **shared** `PicksTable`, the same component the record
  uses.
- Deadline promoted to a peer of the gameweek title; home's H1 dropped, since
  it restated the tab the player is standing on.
- The entry instruction hoisted out of the cards (it appeared twice).
- Day one keeps the Predict the Table prompt — suppressing rank and points on
  day one is correct (`docs/adr/0012` D8); suppressing the **next step** is
  not, and `CLAUDE.md` requires that prompt to be discoverable on the only
  screen a new player has seen.
- Table Prediction strip: shadow not border, `info` off the progress fill
  (it's a category token that also means "bot" two cards above), and the copy
  cut to a line.

**Done when:** the summary renders all four week states (scored, half-played,
missed, called off), the day-one variant shows the onboarding prompt, and the
recap and the record are visibly the same table.

---

## F — #91, the match axis: `/gameweek/[n]`

The existing issue, rescoped. Depends on B and C.

- The route, the strip (D14), and the cluster reveal (D13) via `picksForMatch`
  as-is.
- Two post-lock states, not three (D5), plus half-played, called-off and
  skipped-slot renderings (D16, with `#33` owning the underlying data).
- Wrong Way Round named where it fires — `docs/in-app-help-spec.md` calls it
  _"the single friendliest thing the app can say to a player who otherwise
  blanked"_, and it currently renders as a bare `+1` in the second-faintest
  tone available.
- The audit trail's reserved slot (D12), directly under the result it
  modifies rather than at the bottom of the card.
- Wire the stubbed link at `TippedMatchCard.tsx:582`.
- Correct the `tabs.ts:12` and `shell-metrics.ts:9` comments, and do the
  vocabulary pass in ADR 0013 → _Consequences for existing docs_.

**Explicitly out of scope:** all 380 fixtures (D4), the player axis (G), the
audit trail's data layer (`#31`).

**Done when:** a locked match shows every player's pick including bots and
non-pickers; an unlocked match shows none of them through any route here — a
committed Vitest test asserts this; and past gameweeks are reachable without
unbounded scrolling.

---

## G — The player axis: `/picks/[playerId]`

Depends on F (the shared `PicksTable` and strip) and D (the panel it hangs
off).

- **`picksForPlayer` in `src/lib/competitions/scope.ts`**, which resolves
  already-locked Tipped Matches **first** and reads picks within that set.
  Never `picks` by `player_id`. This is the one query in the app whose natural
  formulation breaks `#17`, and the prototype found the same failure in its
  own data model: a `result === null` that means both "kicked off, no result"
  and "not locked, nobody may see this" will leak. **Carry `locked`
  explicitly, and have the card refuse as well as the query.**
- The route: the shared table at season length, sticky legend, the strip as a
  scroll-to-week jump, week headings linking to the reveal.
- A Late Joiner's record starts where they do (D16).
- The link out from the leaderboard panel.

**Explicitly out of scope:** anything that makes this a profile (bio, join
date framing, "about") or analytics (charts, streaks, head-to-head) — both
banned. Notably **no "N agreed"**: it is a cohort statistic, and the week
heading's link to the reveal answers the same question better.

**Done when:** tapping a leaderboard row reaches that player's season of
locked picks with correct points; an unlocked pick is absent for every player
including yourself, verified by a committed Vitest test against
`picksForPlayer` plus a direct-API check.

---

## Cross-cutting: copy and `/how-it-works`

Not its own issue — each issue carries its own strings — but the vocabulary
decisions belong in one place so they don't drift:

| Retire                     | Use                          |
| -------------------------- | ---------------------------- |
| `Void`                     | **Called off**               |
| `Filed` / `Filing…`        | **Saved** / **Saving…**      |
| `Spot on`                  | **Exact score**              |
| `NEW` (rank column)        | **1st wk**                   |
| `sat this one out`         | **No pick from X this week** |
| `Locks from …`             | **Picks close …**            |
| `your pick` (table legend) | **pick**                     |

Cut rather than explained: the `Open` chip, the `Tipping` heading, the
Predict the Table progress _bar_, and the Median Bot's help caption.

Owed to `/how-it-works` (`docs/in-app-help-spec.md` already reserves space for
most of it): why `7 of 44` isn't `7 of 48`; what `4.3/wk` is for; what rank
movement counts and why bots have no rank; why these two matches and not the
other eight; and the Late Joiner rules.

---

## What is deliberately not in this plan

- **Live scores.** Not available on the free provider tier; the design has two
  post-lock states because of it (D5).
- **A `/gameweek` index page** (D14), **a fourth tab** (D1), and **Predict the
  Table standings on home** — all built or specified, all cut.
- **`#31`'s audit-trail data layer** — F reserves the slot, `#31` fills it, and
  it depends on `#14` which doesn't exist.
