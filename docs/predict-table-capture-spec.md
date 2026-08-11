# Predict the Table capture: interaction spec

Implementation reference for the capture flow decided in
`docs/adr/0008-predict-the-table-group-fill-capture.md`. The ADR records _what_ was decided
and why; this records the interaction precisely enough that the model doesn't have to be
re-derived at build time.

Written from a working prototype (Variant C of three, judged on the real route behind
`?variant=`). The prototype's **behaviour is right; its styling is not** — it was built under
prototype constraints and does not follow `docs/DESIGN_SYSTEM.md`. Treat every rule below as
binding and every visual detail as indicative only. The prototype code is preserved on the
`prototype/predict-table-capture` branch; nothing in it should be promoted verbatim.

## Screen anatomy

One screen. All 7 Bands are rendered as a vertical stack in table order (Champion →
Relegated) at all times. There is no rail, no chevrons, no picker, no drawer, and no separate
review route.

A Band renders in one of three treatments:

| Treatment             | When                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Collapsed summary** | Filling, and this Band is not the open one. One row: Band name, position range, a truncated list of member short codes, the fill count |
| **Open**              | Filling, and this is the open Band. Members as cards, then the drop-target block (review only, so absent here), then the full roster   |
| **Expanded**          | Review. Members as cards, no roster                                                                                                    |

Below the stack: the placed count (`14 of 20 placed`), then the seal button. Nothing is
sticky.

## State

```
assignments : Map<teamId, BandKey>          // the prediction; persisted per move
previous    : Map<teamId, BandKey | null>   // one level of history, for toggle-revert
openBand    : BandKey                       // which Band is armed while filling
lifted      : teamId | null                 // review only: the club being moved
undo        : { teamId, label } | null      // transient, not persisted
```

Derived, never stored:

```
placedCount = assignments.size
mode        = placedCount === 20 ? "review" : "filling"
fillTone(band) = count < target ? "under" : count === target ? "ok" : "over"
```

`mode` is derived, not a state machine — there is no transition to get wrong, and no way to
be in the wrong mode. Filling exists precisely while something is unplaced.

## Interaction rules

### Filling (group-first)

- **Tap a collapsed Band's header** → it becomes `openBand`. This is the only navigation.
- **Tap the open Band's header** → no-op.
- **Tap a club** (in the roster, in the open Band, or in any collapsed Band's summary):
  - already in `openBand` → revert it to `previous[teamId]` (its prior Band, or unplaced).
    Standard multi-select toggle semantics; this is the misclick escape.
  - anywhere else, or unplaced → record `previous[teamId] = current`, assign to `openBand`.
    If it came from another Band, show the undo affordance naming where it came from.
- No confirmation dialog, ever. Prevention is the group label on every roster chip.
- Bands may be over- or under-filled freely. Nothing blocks, nothing auto-corrects, nothing
  is displaced.

### Review (team-first)

Reached automatically when the 20th club is placed. All Bands expand; the roster disappears
(it lives inside the open Band, and there is no open Band).

- **Tap a club** → lifts it (tapping the lifted club again cancels).
- **While lifted**, every Band except the club's current one shows an explicit drop-target
  button — _"Move BHA here"_. This is deliberate: the affordance is stated, not implied by a
  quietly-clickable header.
- **Tap a drop target** → move, clear `lifted`, show undo.
- There is no toggle-revert here and no unplace: an unplaced club scores zero while a badly
  placed one still scores band distance, so removal is strictly self-harm.

### Both phases

- Every move persists immediately. The flow is resumable at any point.
- **Start again** — a single confirm-gated bulk action returning all 20 clubs to the roster.
  The only escape from a table the player wants to bin, and the only operation that can't be
  reconstructed from cheap individual moves.

## The roster

- All 20 clubs, always, in **fixed positions** — the list never shrinks or re-sorts, so a
  club stays where the player learned it was.
- Ordered by **last season's finishing position**, with that position shown. Promoted clubs
  last, marked "Promoted". This is decision support and an implicit delta anchor: because the
  source list _is_ last season's table, each placement carries "they'll improve / decline"
  without a mechanic for it.
- A placed club stays in the roster, **labelled with the Band it's in** — this is what makes
  "have I done Wolves yet?" answerable without opening anything, and what removes the need
  for a confirmation on moves.

## Fill-state presentation

Tint means **"something to do here"** and nothing else. A Band that is exactly right is not
tinted — the board opens fully washed and visibly calms down as it's finished, rather than
colouring in both the resolved and the unresolved states.

| Fill state    | Ground                      | Count reads               |
| ------------- | --------------------------- | ------------------------- |
| Under         | soft neutral wash           | `3/4 · 1 to go`, muted    |
| Exactly right | none (plain)                | `✓ 4/4`, confident weight |
| Over          | danger tint + warmer border | `5/4 · 1 over`            |

Never an error state, never a blocking state, never loud. Champions League holds 4, which
reads badly as three-plus-one on a phone — give it 2×2 until there's width for a single row.

## Submission

Submit **never blocks**. If any Band is the wrong size it warns once — _"2 Bands aren't the
right size — you'll miss 2 Band Bonuses. Seal it anyway?"_ — dismissible in one tap, with
"Let me fix it" as the alternative. Then it seals: sets `submitted_at` (which is what
silences the Pick Board's prompt banner), plays the seal moment, and leaves the table
editable until Gameweek 1's first kickoff.

An untidy table still scores. Per-team band distance computes normally on any assignment;
only the Band Bonus needs exact membership, and over-filling hedges nothing since a club sits
in exactly one Band regardless.

## Specified, not prototyped

Decided in ADR 0008 but absent from the prototype — implement from here, not from the code:

- **Return visits** open the first Band that isn't correctly filled. Champion on a first
  visit; wherever the work actually is on a later one.
- **After Gameweek 1 kicks off**: the expanded review board, read-only. Lifting disabled,
  drop targets absent, tints dropped — once locked, "one too many" is history, not a task.
- **Ceremony** on the Champion pick: a non-blocking visual beat (the card landing with
  weight, the Band lighting up). Never an interstitial, never anything to dismiss — players
  change their champion, and a celebration that punishes reconsidering is worse than none. If
  it can't be made re-triggerable without irritating, fire it only on the first champion
  named in a session. The existing seal moment is unchanged.
- **Late joiners** are unchanged from today: the explanatory line plus a ghost "Skip for now"
  below the seal button.

## Known gaps in the prototype

Beyond styling: no persistence or API calls (state is in-memory and resets), no Start again,
no locked state, no ceremony, no late-joiner variant, and a leftover `confirm` toggle in the
switcher bar exercising a confirmation dialog that was **rejected** — do not reintroduce it.
