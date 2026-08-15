# Predict the Table capture: interaction spec

Implementation reference for the capture flow decided in
`docs/adr/0008-predict-the-table-group-fill-capture.md` and revised in
`docs/adr/0011-predict-the-table-capture-v2.md`. The ADRs record _what_ was
decided and why; this records the interaction precisely enough that the
model doesn't have to be re-derived at build time.

This describes the **shipped** behaviour. The code
(`src/app/predict-table/`, `src/lib/table-predictions/`) is authoritative;
this document is kept in sync with it rather than the other way round.

## Screen anatomy

One screen. All 8 Bands are rendered as a vertical stack in table order
(Champion → Relegated) at all times. There is no rail, no chevrons, no
picker, no drawer, and no separate review route or review mode.

A Band renders in one of two treatments:

| Treatment     | When                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Collapsed** | This Band is not the open one. One-club Bands (Champion, Runners Up) put their club inline on the header line; multi-club Bands show a fixed 3-column grid of members, alphabetical, beneath the header. |
| **Open**      | This is the open Band. Members as cards, then (while the Band is full) the eviction-warning line, then the roster.                                                                                       |

There is zero or one open Band at any time; the board never has more than
one. Below the stack: the placed count (`14 of 20 placed`), then the submit
button. Nothing is sticky.

## State

```
assignments : Map<teamId, BandKey>          // the prediction; persisted per move
previous    : Map<teamId, BandKey | null>   // one level of history, for toggle-revert and undo
placedAt    : Map<teamId, number>           // placement sequence, for the LIFO eviction rule
openBand    : BandKey | null                // which Band is armed; null when nothing is open
undoSnapshot: { assignments, previous, placedAt, teamIds } | null  // pre-tap snapshot, for undo
```

Derived, never stored:

```
placedCount = assignments.size
fillTone(band) = count < target ? "under" : "ok"   // "over" is unreachable -- see below
```

There is no `mode` field and no review/filling distinction anywhere in
state. The board's only state machine is "which Band, if any, is open" —
closing the last open Band (or never opening one) leaves every Band
collapsed, which already reads as the whole table on one screen.

## Interaction rules

### The one tap grammar

- **Tap a collapsed Band's header** → it becomes `openBand`, closing
  whichever Band (if any) was open before. This is the only navigation.
- **Tap the open Band's header** → it closes; `openBand` becomes `null`.
- **Tap a club** (in the roster, in the open Band, or in any collapsed
  Band's summary) — only meaningful while a Band is open:
  - already in `openBand` → **toggle-revert**: it goes back to
    `previous[teamId]` (its prior Band, or unplaced). Standard multi-select
    toggle semantics; this is the misclick escape. The revert obeys the
    capacity rule too: if that prior Band has refilled in the meantime, the
    club returns to the roster unplaced instead. It never evicts a third
    club to make room, because the "next out" marker only ever describes the
    _open_ Band — an eviction there would be one the player was never shown.
  - anywhere else, or unplaced, **and `openBand` has room** → record
    `previous[teamId] = current`, assign to `openBand`.
  - anywhere else, or unplaced, **and `openBand` is already at its target
    size** → **eviction**: the Band's most-recently-placed club (by
    `placedAt`, ties broken on team id) is displaced back to the roster
    (unplaced), and the tapped club takes its place. Last-in-first-out: a
    full Band behaves as settled slots plus one revolving door, so the
    earliest, most-confident picks survive every later tap.
- No confirmation dialog, ever, for either a plain move or an eviction.
  Prevention is the group label on every roster chip, and — for eviction
  specifically — the plain-English line stated below.
- **A Band can never exceed its target size.** Over-filling is not a state
  the board can be in; the eviction rule is what enforces this on every tap.

### Eviction is stated before it happens

While the open Band is exactly at its target size, a line appears above the
roster: _"[Band] is full. Tapping another club swaps it in for **[club
name]**."_ The named club's card also carries a warm tint. Both disappear
the moment the Band has room again (a club is moved out, or the Band
changes). This is deliberate: the whole reason automatic eviction is
defensible at all is that the player is told, before they tap, exactly what
it will cost.

### Both phases

- Every move persists immediately. The flow is resumable at any point.
- **Undo** replays a snapshot, not an inverse move. A snapshot of
  `assignments`/`previous`/`placedAt` plus the touched team ids is taken
  immediately before the last saved tap; undo restores it and re-persists
  only the touched teams (one for a plain move, two for an eviction). An
  inverse move for an eviction specifically is not always legal — the
  evicted club's old Band is full again by the time you'd want to put it
  back — so the snapshot approach is load-bearing, not a style choice.
- **Start again** — a single confirm-gated bulk action returning all 20
  clubs to the roster. The only escape from a table the player wants to
  bin, and the only operation that can't be reconstructed from cheap
  individual moves.

## The forward prompt

At the foot of the open Band, one slot carries one of two mutually-exclusive
prompts, or nothing:

| Shown                   | When                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **"Next: [Band] →"**    | the open Band is exactly its target size, and some Band _after_ it in table order is still under target. Tapping opens that Band. |
| **"Review my table ^"** | every Band is exactly its target size. Tapping closes the open Band, leaving the whole table visible.                             |
| nothing                 | otherwise                                                                                                                         |

The finish prompt is gated on the **whole board** being correct, not on
`nextUnfilledBand` returning null. Those differ: the search runs forward
only, so it returns null on the last Band regardless of what is empty above
it. A Table Prediction saved under the previous 7-Band structure can
therefore show neither prompt — correctly, since it is neither finished nor
advanceable from where it sits, and the tinted Band headers are what point
at the remaining work.

Both render identically and in the same position, so finishing reads as the
same motion as advancing rather than as a new control appearing at the end.

## The roster

- All 20 clubs, always present, tappable into the open Band.
- Ordered by **last season's finishing position**, with that position
  shown. Promoted clubs last, marked "Promoted." This is decision support
  and an implicit delta anchor: because the source list _is_ last season's
  table, each placement carries "they'll improve / decline" without a
  mechanic for it.
- One line per club, not two: last season's position sits in a leading slot
  beside the name.
- **Already-placed clubs demote below an "Already placed · N — tap one to
  move it here" caption**, rather than staying interleaved with the
  unplaced group or being hidden. A placed chip drops its Band label
  entirely — the collapsed Bands above already state, in full, who is in
  each one, so repeating it 20 times in the roster restates the same fact
  at 20x the cost; the chip keeps only a muted treatment and a tick.
- **The demoted grouping re-computes only when the open Band changes, never
  on a tap.** `handleOpenBand` in `PredictTableFlow` is the single entry
  point that changes which Band is open, and it is the only thing that
  re-groups the roster — every call site that opens or closes a Band goes
  through it, so a club can never shift position under a player's finger
  mid-tap. It re-settles at the moment the player is already changing
  context.

## Band membership order

Members inside a multi-club Band are listed **alphabetically**, never by
insertion order or last season's position. Only Band membership scores;
order within a Band carries no weight at all. A vertical stack under a
range badge like "3–5" would otherwise imply first = 3rd, second = 4th,
third = 5th — reintroducing a ranking this feature deliberately doesn't
record. A line inside the open Band states this: "Any order — only who's in
the Band counts."

One-club Bands (Champion, Runners Up) put their club inline on the header
line instead of in the members grid — there it is the answer, not one of
three, and there is only ever one of it.

## Fill-state presentation

Tint means **"something to do here"** and nothing else. A Band that is
exactly right is not tinted — the board opens fully washed and visibly
calms down as it's finished, rather than colouring in both the resolved and
the unresolved states.

| Fill state    | Ground            | Count reads               |
| ------------- | ----------------- | ------------------------- |
| Under         | soft neutral wash | `2/3 · 1 to go`, muted    |
| Exactly right | none (plain)      | `✓ 3/3`, confident weight |

There is no "over" fill state in the shipped board — a Band can never
exceed its target, so `fillTone`'s `"over"` branch is unreachable in
practice and exists only because the type is shared with other
under/exact/over-shaped UI in the app.

## Submission

Submit **never blocks**. If any Band is short of its target it warns once,
listing each affected Band with its current and target team count. The
player can submit anyway, forfeiting those Band Bonuses, or keep editing.
Submission sets `submitted_at` (which is what silences the Pick Board's
prompt banner), plays the submitted moment, and leaves the table editable
until the end of 31 August 2026 in Australia/Sydney (the exclusive UTC
cutoff `2026-08-31T14:00:00Z`). Late Joiners remain editable after that
cutoff.

An under-filled table still scores. Per-team band distance computes
normally on any assignment, including a Band left short; only that Band's
Bonus is forfeited. Over-filling cannot happen, so there is nothing to warn
about on that side.

## Implemented (was "Specified, not prototyped")

All four of the behaviours decided in ADR 0008 but absent from the original
prototype are shipped — the last two in #118 (2026-08).

- **Return visits** open the first Band that isn't correctly filled.
  Champion on a first visit; wherever the work actually is on a later one.
  Client-side only (`firstIncorrectlyFilledBand` in
  `src/lib/table-predictions/board.ts`).
- **After the fixed Table Prediction deadline**: the expanded read-only
  board, tints dropped, nothing tappable — once locked, "one too many" is
  history, not a task.
- **Ceremony** on the Champion pick: a non-blocking visual beat (the card
  landing with weight, the Band lighting up). Never an interstitial, never
  anything to dismiss — players change their champion, and a celebration
  that punishes reconsidering is worse than none. Fires once per session, on
  the first champion named that session; a "Start again" re-arms it.
- **Late joiners** are unchanged from the original design: the explanatory
  line plus a ghost "Skip for now" below the submit button.

## Superseded by ADR 0011

The following, from the original prototype and from ADR 0008, no longer
describe the shipped board:

- The derived `mode` (`"filling" | "review"`) and the two tap grammars it
  switched between (group-first while filling, team-first — lift then
  drop — in review). There is one grammar now, always.
- "Bands may be over- or under-filled freely. Nothing blocks, nothing
  auto-corrects, nothing is displaced." Over-filling is now structurally
  impossible; see "Eviction is stated before it happens," above.
- The stated "drop targets" review-mode affordance ("Move Bournemouth
  here" buttons growing on every other Band while a club is lifted) and the
  swap concept (exchanging two placed clubs' Bands in one action) — both
  belonged to review mode and are gone with it.
- Seven Bands. There are eight; see CLAUDE.md → _Season-long feature:
  Predict the Table_ and `docs/adr/0011-predict-the-table-capture-v2.md`.
