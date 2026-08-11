# Predict the Table: the capture-UX problem

Status: **resolved** by `docs/adr/0008-predict-the-table-group-fill-capture.md`. Recorded
2026-08-10; outcome added 2026-08-11.

This was never an ADR — it is the problem statement and cognitive walkthrough that the
redesign started from, kept because the reasoning about _how people actually predict a
league table_ outlives the particular interaction chosen. For what was decided, read ADR 0008. Where this document's design requirements and ADR 0008 disagree, 0008 wins: the
requirements below are what the redesign was aiming at, and 0008 records which ones it hit,
which it consciously missed, and why.

## Scope

The dissatisfaction is with **the selection UX**, not with the feature's concept, its
scoring, its placement in onboarding, or its standalone-from-Season-Total status. Those
were considered and are not the complaint.

## Fixed constraints (confirmed, not up for redesign)

- **Exact band sizes stay.** Champion 1, Champions League 4, Europe 3, Mid Table 3, Lower
  Table 3, Relegation Battle 3, Relegated 3. They force decisiveness and give the artifact
  meaning; they are also what makes the scoring model work.
- Consequence, and the single most important structural fact here: **the table is a
  permutation — a conserved quantity.** Every insertion is necessarily an ejection. The
  problem is not that constraint; it is that the current system makes the player manually
  perform the bookkeeping the constraint implies.
- Whether drag-and-drop is back on the table is **deliberately left open**. ADR 0003
  rejected it on build-timeline risk, which was a schedule call rather than a product one,
  but re-opening it is a decision for the redesign session, not a premise of it.

## Root cause: selection is indirect

The player never acts on the board. They act on a _subject_ the Picker holds — either
`reconsiderTeamId` (a team they tapped) or the head of an invisible `queueOrder` — and then
choose a _destination_ from a list inside the Picker. The board (`PredictTableFlow.tsx`) is
a read-only readout of results. Every symptom below falls out of that one property.

- **"Hard to know what you've selected."** The selected team's identity exists only inside
  the Picker's header, in a different visual plane from the board where the outcome lands.
  Nothing on the board is marked as the team under consideration. On phone the Picker is a
  `92svh` sheet — effectively modal — so at the moment of decision it covers the thing being
  decided about. Subject and destination are never visible together.
- **"Clunky swap."** The intention is one gesture (put this club there). The app spends 3–4
  taps across two sub-modes: tap team → drawer opens → scroll bands → tap band → `SwapChooser`
  → tap an occupant. Swap is not a feature anyone asked for; it is the tax on exact-size bands.
- **"Doesn't work if you want to move multiple."** `SwapChooser` is strictly 1-for-1. Shifting
  three clubs up costs either a 4-tap ceremony ×3 or clearing the band and re-calling
  everything through the queue. Late-stage table-building is _cluster nudging_ — "these two
  are too high, everything below shuffles" — and that operation does not exist in the model.
- **"The viewport feels unnecessary."** The drawer exists only because selection is indirect;
  it is somewhere to put the destination list. Four of ADR 0003's seven update entries are
  spent fighting that container (`vh`→`svh`, the flexbox `min-height: auto` trap, the CSS Grid
  rebuild, the clipped drawer heading). That is a container earning its keep by existing.
- **A second hidden state.** `queueOrder` decides who the player considers next, and
  remove-and-requeue pushes corrections to its front. "Call an uncalled team" and "fix one I
  got wrong" therefore run through the same mechanic despite being opposite tasks.

## What the player is actually trying to do

Produce **one artifact they would be willing to defend**. The felt goal is "yeah, that looks
about right" — a whole-board judgement made by _looking_, not by summing 20 individually
correct calls. The board is the deliverable; every interaction should serve looking at it.
Today the board is a receipt printed after the fact.

## The five phases of predicting a league table

1. **The dump — certainties, already loaded before the screen opens.** 4–6 beliefs held at
   ~90% confidence ("City or Arsenal win it", "Liverpool top four", "the promoted three go
   straight back down"). These are _recalled_, not decided. They want out fast, all at once,
   in whatever order they surface.
2. **The stakes — clubs they care about.** Their club, a mate's club, the one they hate. More
   deliberation on their own team's finish than on the entire 9–14 range combined. This is
   also where the emotion lives.
3. **The comparisons — the crux.** Nobody thinks "Brighton finish 9th"; they think "Brighton
   finish above Palace." Mid-table opinion exists almost entirely as **pairwise relative
   judgements**, never absolute positions — and contextually, since the right band for a club
   is a function of who is already placed. Translating a relative belief into an absolute
   category _is_ the hassle, and it is currently done with the board hidden behind a drawer.
4. **The residue.** 6–8 clubs placed by elimination, not belief. Zero cognitive content.
   Currently they cost exactly what the Champion pick costs.
5. **The review loop — where the real thinking happens.** Dump a rough table → look → "no,
   City can't be third" → adjust → look again. The first pass is _supposed_ to be sloppy and
   cheap. The system's cost structure is inverted: first pass expensive, adjustment more
   expensive still. It taxes precisely the loop that constitutes the thinking.

## Thought vs. system, per phase

| Phase   | What the player is doing                 | What the system makes them do                                          |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Dump    | Fire off 5–6 certainties fast, any order | Same 3–4 tap ceremony each, dealt in queue order, not confidence order |
| Stakes  | Deliberate hard on 2–3 clubs             | Can't reach them until the queue offers them                           |
| Compare | "Above or below X?"                      | Asked "which band?" with X hidden behind the drawer                    |
| Residue | Dump the don't-cares and move on         | Full ceremony ×8, though band arithmetic already determines most of it |
| Review  | Scan the whole table, spot wrongness     | **Works.** The persistent board is genuinely right                     |
| Adjust  | Nudge a _cluster_                        | 1-for-1 swap, or clear the band and re-call everything                 |

Three frictions that don't fit the table:

- **Displacement is treated as a second decision when it is half of one thought.** With fixed
  sizes, "Brighton deserves Europe" already _means_ "someone in Europe doesn't" — and the
  player usually knows who. `SwapChooser` stops and asks them to state the consequence as
  though it were news.
- **Recall load has no relief.** "Have I done Wolves yet?" can't be answered without opening
  the drawer: `FillDots` shows how many a band holds, not who is left. The state most needed
  at a glance is the one that's hidden.
- **The dealer never stops dealing.** Auto-advance genuinely helps during the dump — it
  removes "what next?" load. It becomes an obstruction the moment the player forms a specific
  intent ("I need to move Newcastle"). That mode switch happens in the player's head when the
  certainties run out; the system never makes it.

## Design requirements for the redesign

Requirements, not solutions.

1. **Confidence sets the cost.** Obvious calls near-free; the interaction budget goes to the
   contested middle. Uniform ceremony is the core mismatch.
2. **Never hide the board at the moment of decision.** Comparison needs context; a modal sheet
   is disqualifying, not merely awkward.
3. **The residue should cost nothing.** Leftovers should land somewhere sane and be ignorable.
   This brushes against ADR 0003's rejected "pre-filled smart default" — that rejection was
   about the _whole_ board being pre-filled and ceremony-free, so applying it only to the tail
   is a different call, but it must be re-opened deliberately rather than by accident.
4. **Displacement is a consequence, not a question.** Show what got pushed; don't stop to ask.
5. **Relative gestures, not only absolute ones.** "Put this above that" is the native unit of
   thought.
6. **Adjustment must be cheaper than first entry.** It is currently dearer. This one is nearly
   the whole problem by itself.
7. **"Who's left" must be visible without opening anything.**
8. **Spend ceremony where the emotion is** — the Champion pick and The Drop earn a moment;
   nothing in 9–14 does. Streamlining is not uniformly "make it faster."

## Framing question for the lateral session

> How can a player move a club — or several — to where they belong by acting directly on the
> table itself, with no mediating picker, when exact-size bands mean every move displaces
> someone?

## Outcome

The framing question turned out to be subtly wrong, which is the most useful thing this
document produced. It asks how to make _moving_ a club graceful. The answer that worked
was to stop iterating per club at all: fill one group at a time from a roster that never
leaves the screen, so there is no subject to hold, no destination list to house, and — since
over- and under-filling is legal — nothing to displace. See ADR 0008.

Scorecard against the eight requirements above:

| #   | Requirement                                    | Outcome                                                                                                                                  |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Confidence sets the cost                       | **Not met**, deliberately. Every group gets equal treatment                                                                              |
| 2   | Never hide the board at the moment of decision | **Met.** The roster sits inside the open group; the other six stay visible as summary rows                                               |
| 3   | The residue should cost nothing                | **Not met.** Still one tap per club                                                                                                      |
| 4   | Displacement is a consequence, not a question  | **Met by removal** — over/under-fill is legal, so nothing is displaced                                                                   |
| 5   | Relative gestures, not only absolute           | **Not met** as a gesture, but recovered in spirit: the roster is ordered by last season's table, so each placement is implicitly a delta |
| 6   | Adjustment must be cheaper than first entry    | **Met.** Two taps, board never hidden                                                                                                    |
| 7   | "Who's left" visible without opening anything  | **Met by construction**                                                                                                                  |
| 8   | Spend ceremony where the emotion is            | **Partly met** — a non-blocking beat on the Champion pick, nothing elsewhere                                                             |

Requirements 1, 3 and 5 all attack the same deeper thing: a player is asked for twenty
assertions while holding about six opinions. ADR 0008 repairs the interaction and leaves
that obligation intact. The ideas that would address it — better/worse/same against last
season, boundary duels, declaring only the few things you know — are recorded in 0008's
rejected list rather than discarded.
