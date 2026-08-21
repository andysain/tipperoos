# Production UI findings

**Status, 2026-08-21.** P0, P1, P4–P7, P9 and P10 are fixed on
`feat/match-centre`. The remainder is filed:

| Finding                                      | Where it went                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| P2 (focus ring), P3 (ink alphas), type scale | **#184** — design-system compliance sweep                                      |
| Fixed chrome overlapping content             | **#185**                                                                       |
| Kit colours on white grounds                 | **#186**                                                                       |
| P8                                           | prototype-only, moot — the prototype is now on `prototype/match-centre-design` |

P9's original remedy was **wrong** and is worth reading before trusting the
rest: it prescribed using `success` as a fill behind paper text, which
measured 3.14:1 against the 3.44:1 defect it replaced. The real cause was
that `success` at `#4c9a4a` failed AA in every direction; both `success` and
`danger` were darkened instead.

Delete this document once #184–#186 are closed.

---

Surfaced during the Match Centre prototype's design reviews (2026-08-19/20).
These are defects in **shipped components**, not in the prototype — the
prototype only made them visible. Nothing here has been changed, deliberately:
altering shipped components mid-exploration, without an issue, is scope creep.

File these as issues before or alongside #91. Delete this document once they
are live.

Every claim below was verified against the source. Contrast ratios were
measured independently against `paper` (`#f6f3ec`), the app's actual page
background — not against pure white, which flatters the numbers slightly.

---

## P1 — Multiple leaderboard panels can be open at once (ADR 0012 D11 breach)

`src/components/leaderboard/LeaderboardRowCard.tsx:79` holds `open` in
**per-row `useState`**, so every card in the list can be expanded
simultaneously. ADR 0012 D11 is explicit: _"One card is open at a time, so
the list never doubles in height."_ D11 chose the tap-to-open panel over an
always-visible stat line specifically on that guarantee, so this isn't a
detail — it's the condition the decision was made under.

**Fix:** lift `open` to the list component; pass `open` and `onToggle` down.

## P2 — No `focus-visible` treatment anywhere in the app

`grep -rn "focus-visible" src/` returns **zero** matches outside the
prototype, and `globals.css` defines no outline. Two inputs (`PinInput.tsx`,
`TextField.tsx`) style `focus:` with an accent ring — good, but `focus:` also
fires on mouse click, and neither covers the app's many interactive
**cards and buttons**: leaderboard rows, tipped-match controls, Predict the
Table's club cards, the tab bar. Those currently fall back to the browser's
default ring or to nothing.

**Fix:** one shared token, applied to every interactive element:
`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
focus-visible:ring-offset-2`. An accent focus ring is transient chrome, not a
palette spot, so it does not spend the accent budget.

## P3 — Five of six ink alphas fail WCAG AA for normal text

Measured against `paper`:

| Token    | Ratio    | AA normal (4.5:1)               |
| -------- | -------- | ------------------------------- |
| `ink`    | 11.98    | pass                            |
| `ink/70` | **4.61** | pass (the real floor)           |
| `ink/60` | 3.54     | **fail** (passes AA-large only) |
| `ink/50` | 2.74     | fail                            |
| `ink/45` | 2.44     | fail                            |
| `ink/35` | 1.95     | fail — decorative only          |

`LeaderboardRowCard` uses `ink/45` for the per-week caption and `ink/50` for
the stat-tile labels; both carry meaning. `DESIGN_SYSTEM.md` defines one
muted text role, not six, and its _Dark mode_ section commits to a future
palette being a **token-value swap** — hand-tuned alphas over ink don't
survive ink becoming a light colour.

**Fix:** three alphas total. `ink` (primary), `ink/70` (secondary, the floor
for anything meaningful), `ink/35` (decorative only — dividers, disabled
glyphs, never text a player must read).

**Note against ourselves:** the Match Centre prototype currently uses
`ink/60` (3.54) for secondary text at 0.8rem, which fails AA normal for the
same reason. It should move to `ink/70` when this lands, and the two should
be decided together rather than drifting apart.

## P4 — `BOT` label is illegible, at ~2.6:1

`LeaderboardRowCard` renders the rank column's `BOT` at **0.55rem (~8.8px)**
in `text-info` inside a row carrying `opacity-70` — an effective ~2.59:1
against paper. ADR 0012 D12's whole argument is that the rank column
_answers_ "where does this player stand"; at that size and contrast it
whispers it, and a ten-year-old is left to infer an eligibility rule from a
30% dim.

**Fix:** `0.75rem`, `font-extrabold`, full-strength `text-info`, and drop the
blanket `opacity-70` in favour of muting the bot's _points_ specifically. Add
one line of copy above the list — _"Bots play along, but a person always wins
the season."_ — which is the only change that actually teaches the rule.
`docs/in-app-help-spec.md` §4 already owes this sentence to `/how-it-works`.

## P5 — Rank movement fails contrast at its rendered size

`success` (`#4c9a4a`) is **3.14:1** on paper and `danger` (`#d8434b`) is
**3.93:1** — both below AA for normal text, and both currently rendered at
0.6rem (~9.6px). The palette is fixed and the ▲/▼ glyph carries a redundant
signal, so this is a **size** fix, not a palette change: take movement to
`0.75rem font-bold`, which clears AA-large.

Related, already recorded in `DESIGN_SYSTEM.md` → _Icons_: movement can't
live on an ink ground either. It also can't live at 9.6px on paper.

## P6 — A 20-character display name truncates (ADR 0012 D4 breach)

D4 specifies rows _"sized to hold a 20-character display name without
truncation."_ At 390px the fixed chrome — padding 24, rank 28, avatar 36,
points cluster ~62, chevron 16, four 10px gaps — consumes ~206px, leaving
~184px, minus the `You` badge and its gap ⇒ **~144px** for the name. A
20-character bold name at 16px runs ~170px, so it truncates around 16
characters — and it truncates **worst on the signed-in player's own row**,
the one carrying the badge.

**Fix:** drop the `ChevronDown` (+26px). The panel's own presence signals
open/closed and `aria-expanded` carries it for assistive tech. Tightening
`gap-2.5` → `gap-2` recovers ~10px more.

## P0 — `DESIGN_SYSTEM.md` contradicts itself on the accent budget

**This blocks P7 below, and it is a decision, not a fix.** The doc gives two
different lists and neither is a superset of the other:

| Source                       | Sanctioned accent uses                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Visual direction (line 21)   | 1st-place row · own predicted scoreline · Predict the Table Champion pick — "**exactly three**"           |
| Palette table (`accent` row) | Primary actions · `You` badge · 1st-place tint · own predicted scoreline — **four, and a different four** |

So `LeaderboardRowCard`'s accent `You` pill and `ui/Button.tsx`'s
`primary: bg-accent` are simultaneously sanctioned and in breach depending on
which paragraph is read. There are **41 accent utility usages across 13
files**; beyond P7's two, the ones covered by neither list are the active tab
in `TabBar.tsx`, `LastWeekStrip`'s `+N pts`, `TablePredictionStrip`'s `Edit`
link, and `ScoringBreakdown`'s "How points work" link.

**Proposed resolution — two tiers, not a flat count**, because "exactly three"
was never going to survive having a `Button` primitive:

> **Emotional accent** (the three named moments — 1st place, your own
> predicted scoreline, your Champion pick): accent as a **fill**.
> **Functional accent** (primary button, `You` badge, active tab): permitted,
> but **at most one functional accent object per viewport**, and never on a
> value, a label, a status chip, or a link that isn't the screen's primary
> action. Everything else — metadata, provenance, lifecycle chips, totals,
> secondary links — uses ink weight, not colour.

Under that rule: `TabBar` keeps accent; `LastWeekStrip`'s `+N pts` →
`text-ink font-extrabold`; the two links → `text-ink font-bold underline`;
`TablePredictionStrip`'s `bg-accent` not-submitted card stays (it is a genuine
primary action).

The Match Centre prototype currently follows the **stricter** reading, which
both lists agree on, so it stays correct whichever way this lands.

## P7 — Accent spent on metadata and on a lifecycle chip

`DESIGN_SYSTEM.md:21` reserves accent for **exactly three** spots — the
1st-place leaderboard row, a player's own predicted scoreline, and Predict
the Table's Champion pick — and ADR 0012 D7 explicitly declined to add a
fourth. `src/components/pick-board/TippedMatchCard.tsx` spends it on two
more:

- **line 213** — the provenance label (`font-bold text-accent` on
  "Top matchup" / "Random pick"). Provenance is metadata, not an emotional
  moment.
- **line 110** — the `locked` status chip (`bg-accent text-accent-ink`). A
  lifecycle status is not one of the three.

The card's _legitimate_ accent — the player's own predicted scoreline at line
176 — is the one those two are competing with, on the same card.

**Fix:** provenance to `text-paper/70 font-bold` (it sits on an ink ground;
weight and the icon already differentiate it); `locked` chip to
`bg-paper/15 text-paper`, leaving `final`'s paper-on-ink inversion as the
card's only strong chip.

Worth deciding explicitly rather than silently: either these are sanctioned
uses `DESIGN_SYSTEM.md` should name, or they are breaches. Right now the doc
says three and the code spends five.

## P9 — `success` is drawn as text on ink, at 3.44:1

`DESIGN_SYSTEM.md` → Icons already records that "`success`/`danger` don't
clear the contrast floor against `ink`" — but scopes it to rank-movement
glyphs. It is a **palette-wide** fact. Measured: `success` `#4c9a4a` on `ink`
`#123c43` = **3.44:1**.

`src/components/pick-board/TippedMatchCard.tsx:485` renders **"You called it
exactly"** as `font-bold text-success` on the ink footer — the single most
emotionally loaded string in the weekly loop, at 3.44:1 and 0.86rem.
`ScoringBreakdown.tsx:42,66,84` does the same for `+N pts` and every term's
value.

**Fix:** on ink grounds, positive verdicts carry weight and a paper fill, not
`success` text. Amend the Icons note to read: _"`success` and `danger` are
light-ground tokens. On an ink surface, use them as a fill behind paper text,
never as text colour."_

## P10 — Two gambling/feature-hint icon choices

- `TippedMatchCard.tsx` uses lucide `Dices` for a Random Pick. A pair of dice
  is the most gambling-coded glyph in any icon set, on an app whose spec bans
  gambling language. → `Shuffle`.
- It uses `Star` for Top Matchup. `docs/in-app-help-spec.md` → _Out of scope_
  says of Star Match: _"Do not document or hint at it."_ A star is that hint,
  and it collides with the universal favourite/starred meaning. → `Flame`.

Both are fixed in the prototype already.

## P8 — Two smaller drifts, prototype-only, recorded so they aren't ported back

Found by diffing the prototype's copy against the real component. **These are
bugs in the prototype copy, not in production** — production is correct on
both — but they're the kind of thing that gets copied in the wrong direction:

- Production guards the per-week caption with `row.pointsPerGameweek !== null`;
  without it a null renders a bare `/wk` with no number, and null is reachable
  (ADR 0012 D3, a player whose only gameweek isn't scored yet).
- Production gives movement an `aria-label` (`"Up 2 places since last week"`);
  without it a screen reader hears only the glyph.

---

## Suggested filing

**P0 first** — it is a documentation decision that unblocks P7, and it should
be made before any accent code is touched.

Then: one issue for **P1** (a named ADR breach with a contained fix), one for
**P2–P5 + P9** as an accessibility pass (they share a root cause: no house
style for size and contrast floors), one for **P6**, one for **P7** (after P0
settles it), and **P10** as a two-line fix that can ride along with anything.
