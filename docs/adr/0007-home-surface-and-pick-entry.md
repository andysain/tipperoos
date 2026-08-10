# Home is the pick board; scorelines are entered as digit rows

`CLAUDE.md` specifies what a pick is but never says where a player goes to
make one. Today `/` is a Supabase connectivity probe and login dead-ends into
`/predict-table`, so nothing in the app tells a player they owe tips. This ADR
settles the surface, its states, and the entry mechanic. It was arrived at
through a design pass over three interactive prototypes; the rejected options
below were all built and looked at, not merely imagined.

## Decision

**`/` is the board itself.** No hub, no routing step, no redirect. With two
Tipped Matches and one primary action per week, a dashboard whose only real
destination is the pick screen is pure ceremony.

**The current Gameweek is derived, never flagged.** Lowest-numbered Gameweek in
this season and Competition with any Tipped Match not yet locked; failing that,
the highest-numbered Gameweek that has Tipped Matches. Computed per request
from kickoff times, which sync already keeps fresh. An `is_current` column was
rejected specifically because a missed job leaves it confidently wrong, where
a derived rule self-heals.

**Home advances immediately** when a Gameweek finishes, carrying a compact
last-week strip (points plus each Tipped Match's result) above the new board.
The payoff and the new task sit on screen together rather than the board
lingering until results arrive.

**Two slots, fixed order, never reordered.** Match 1 above Match 2, in every
state, all season. Positional constancy is the actual speed feature: a thumb
that knows where the second card lives beats any input widget. Both slots are
always rendered, including when one is a Skipped Slot or Voided Match.

**Both open slots show their entry rows immediately.** No accordion, no
"tap to open" step. This costs the board its fit above the fold on a phone —
accepted, because one scroll is cheaper than one tap, and a collapsed slot
reads as an accusation that the player hasn't done something.

**Settled slots collapse to a plate, and the card goes dark.** Once a slot is
filed, locked, live or finished, the white body is replaced entirely by an ink
panel carrying the scoreline at display size, flanked by both club badges.
Done and outstanding then read apart at a glance across the board, and the
`accent`-on-ink combination clears contrast where `accent`-on-white measured
2.05:1 and failed even large-text AA.

**Entry is two digit rows, one per side**, `0–4` in five cells with the club
code above the row, plus a `5+` control that adds a `5–9` row to that side
only. Exactly one tap per side; the second tap files the pick. There is no
Save button and no confirm step — tapping `0` is an affirmative act, so
nil-nil is unambiguous without one. A partially entered pick (one side set) is
never sent to the server and never restored on reload.

**Nothing is pre-filled.** No suggested or provisional scoreline is stored or
displayed. A player who never interacts has no pick row and scores nothing.
This keeps the Median Bot's input to genuinely submitted human picks and keeps
absent players where they belong in the standings.

**Live league position is shown ahead of each club.** Before any matches are
played this is alphabetical, which is honest and self-correcting. The card
renders positions only when standings data exists, so the feature degrades to
absent rather than to zeroes.

**Club colour appears twice, and earns it both times**: the three-letter badge
carries the club's colour for identity, and a bar beside each digit row ties
the row to the club it scores. Two rules make this safe — a **clash rule**
(when both clubs' primaries are too close, the away side falls back to its
secondary, then to ink) and a **contrast floor** (any kit outside a readable
luminance band is mixed toward paper or ink, hue preserved, until it clears
both the ink header and the white body). Without the floor, black kits vanish
against the header and white kits vanish against the body. See
`docs/DESIGN_SYSTEM.md`.

**The reveal lives in Match Centre, not here.** Home shows the player their
own pick, the result, and their own points; comparing against everyone else is
a link out. Home stays a task surface plus personal outcome.

**Times render in the viewer's local timezone, with the overnight case spelled
out** — a UK Saturday afternoon kickoff can genuinely be the small hours of
the following day wherever the viewer actually is, so, e.g. for a
Sydney-based viewer, `Sun 12:00am (Sat night)` rather than a bare weekday that
reads as the wrong night (see issue #93 for how the viewer's timezone is
resolved). The Gameweek header shows the earliest lock across the board.

**Provenance is stated inline, not badged.** `Top matchup` and `Random pick`
sit on the card's single meta line with the kickoff and countdown, because
nothing is player-chosen any more (`docs/adr/0006-auto-selected-tipped-matches.md`)
and players will otherwise ask why these two fixtures.

**Day one has its own variants.** Before any Gameweek is scored there is no
rank, no season points and no history, so the stats strip drops rank and points
entirely and the season-stats block is hidden rather than showing dashes. Both
revert automatically once scores exist.

## Structural consequences, resolved here rather than deferred

Showing live positions requires somewhere to put them: nothing in the schema
holds team league positions today (`standings_snapshots` is the per-player
table). A store plus a standings fetch is therefore a prerequisite of this
card, and is shared with Predict the Table's continuous scoring.

Match Centre becomes a hard dependency for the app to feel finished, since
every "compare all picks" path ends there. It had no issue before this ADR.

The stats strip and last-week strip depend on the scoring engine and the
per-Gameweek Standings Snapshot. Until those land, home runs in its day-one
variants — which is also exactly what Gameweek 1 needs, so the degraded state
is the launch state rather than a temporary shim.

Because the pick files on a tap with no confirm, the filing stamp is the only
feedback channel the player has. That makes the stamp's failure behaviour a
contract question, not a cosmetic one.

## Considered and rejected

**A hub landing page** listing outstanding actions, and **leaderboard-as-home**.
Both add a routing step in front of the only thing a visit is for.

**A pre-filled provisional pick** that scores if untouched. Rejected on
fairness: a player who never opens the app would score points, stay off the
bottom of the Gameweek, and pollute the Median Bot's input.

**Frequency-ordered scoreline tiles** (one tap for the common case, with an
outcome-first escape hatch) and **a goal tally with an explicit confirm**. Both
were prototyped. Tiles are genuinely faster but hide unusual scorelines behind
a secondary control; the tally is the most tactile and the slowest, and needs a
confirm because a half-built tally is a real state. Digit rows were chosen for
being uniform, discoverable, always exactly two taps, and free of hidden modes.

**Coarse-then-fine entry** — outcome first, then margin. Rejected as the
primary path: because scoring needs exact home and away goals, the outcome tap
can never end the interaction, so it is a filter that adds a tap rather than an
answer. It survives only as the escape hatch inside the rejected tiles option.

**An accordion**, showing one slot's rows at a time to fit the fold. Rejected
after seeing it: the collapsed slot reads as a to-do warning regardless of how
its copy is worded.

**A halftone print screen behind the entry area, goal pips beside the score,
reactive microcopy on filing, and an ambient "sundial" shade for the
countdown.** All prototyped. The screen and pips added visual weight without
adding information at this density; reactive copy risks reading as
judgemental over 38 weeks; the shade commits the card to a decorative device
before the countdown treatment is settled.

**Real kit colours as a multi-segment stripe.** Cut to two segments after
seeing that every club with white or black in its palette produced an
invisible segment.

## Deferred, not settled here

- **Offline and retry states for the filing stamp** — `Filing…` → `Filed` →
  `Couldn't file — tap to retry`. Deferred, but it determines whether the
  client renders optimistically or awaits the write, so it should be settled
  before the route contract hardens rather than bolted on.
- The ambient countdown treatment. The behavioural rule is agreed — quiet far
  out, explicit inside the last hour, always driven from server time — but its
  visual form is open.
- Remembering the `5+` row per player across cards and weeks.
- Skipped Slot and Voided Match card presentation. The rules are settled
  (`docs/adr/0001-skip-slot-on-pre-lock-postponement.md`, `CLAUDE.md`); the
  card states are not drawn.
