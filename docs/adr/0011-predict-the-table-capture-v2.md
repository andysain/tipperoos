# Predict the Table capture v2: one grammar, no over-fill, eight Bands

`docs/adr/0008-predict-the-table-group-fill-capture.md` replaced a per-team capture flow with a per-group one, and shipped. In practice the product owner found the shipped board unpleasant in a specific way this ADR fixes. **0008 remains authoritative** for the group-first (not team-first) iteration order, the roster's fixed position ordering by last season's finish, "start again" as the one bulk action, the return-visit landing on the first incorrectly-filled Band, and the Champion ceremony. Its **two-grammar review mode, its "over- and under-filling are legal throughout" rule, and its seven-Band structure are superseded here.**

## The problem, in one line

0008 built one screen that changed grammar underneath the player: **filling** was group-first (open a Band, tap clubs into it) and **review** — reached automatically the instant the 20th club landed — was team-first (lift a club, then tap where it goes). The switch was silent and derived, not something the player did on purpose. That was the single largest usability complaint: a player mid-flow could cross the 20-club threshold and suddenly find taps meant something different, with no signal that anything had changed.

A second, smaller complaint sat alongside it: an untidy table (a Band over- or under-filled) was legal at any time, including at submission, with only a one-time warning. That made "am I actually done?" a question the player had to check by eye across eight counters rather than read off one number.

## The decision

**One tap grammar, no review mode.** The board has zero or one **open Band**. Tapping a club always means "put it in the open Band." Band headers toggle and are the only navigation. Collapsed rows carry full membership, so "everything closed" _is_ the review of the table — reached with the same gesture used to fill it. Editing a finished table is the same two taps as filling an empty one: open the Band, tap the club. This removes the unsignalled mode switch outright, rather than trying to signal it better.

**Bands cannot over-fill.** Tapping a club into a full Band swaps it in for that Band's last-added club (LIFO), which returns to the roster. This overturns 0008's "over- and under-filling are legal throughout" and "nothing is displaced." The justification is the invariant it buys: `20 placed` ⟺ every Band exact ⟺ every Band Bonus in play — one number tells the player everything, instead of eight counters plus a submit-time warning.

The known cost, recorded plainly: an evicted club becomes **unplaced**, and unplaced scores 0 while a mis-Banded club still scores 1–2 on Band distance (`docs/adr/0010-predict-the-table-scoring.md`'s placement curve). Eviction can therefore be a more expensive mistake than a bad placement. Two things mitigate it: eviction is **stated in advance** — a plain-English line above the roster names the club that would leave, plus a warm tint on its card — and it is **always undoable**, restoring both clubs via a snapshot (see "Structural consequences" below). LIFO rather than FIFO: a full Band behaves as settled slots plus one revolving door, so the earliest, most-confident picks survive every later tap while the most recent slot alone churns. FIFO would do the opposite and quietly dismantle the confident picks first. This is deliberately **not** the "insert-and-ripple" idea 0008 already rejected — a single step, no cascade, visible before it happens, undoable after.

**An 8th Band: Runners Up (position 2).** Champions League becomes 3–5. Sizes are now 1, 1, 3, 3, 3, 3, 3, 3 = 20. Three consequences to record:

1. **Placement gets harsher at the top.** A club placed in Champions League that actually finishes 2nd now drops from Band distance 0 (5 points) to distance 1 (2 points) — the finer grain at the top costs real points for what used to be a correct call.
2. **An 8th Band means an 8th Band Bonus**, so the bonus table was re-tuned to hold the 200 ceiling: Champion 15 → 10, Champions League 15 → 10, everything else unchanged, Relegated stays 15. That's `7 × 10 + 15 = 85`, unchanged, so `100 + 85 + 15 = 200` still (`docs/adr/0010`'s structure, re-tuned in `src/lib/scoring/predict-table.ts`).
3. **Band names stay honest.** Positions 1–5 all qualify for the Champions League under the current format, so "Champions League" now genuinely means those five positions split across two Bands rather than one Band overloading the name.

## Supporting decisions

- **Roster chips go to one line, not two.** Last season's position sits in a leading slot beside the name rather than on its own row, which nearly halves the chip. A placed club drops its Band label entirely — the collapsed Bands directly above already state, in full, who is in each one, so repeating it 20 times in the roster was the same fact at 20x the cost; the chip keeps only a muted treatment and a tick.
- **Already-placed clubs demote below an "Already placed · N — tap one to move it here" caption**, rather than being hidden. Demotion, not hiding, keeps every placed club still tappable — pulling a club out of one Band and into another still works with no extra disclosure control — and keeps 0008's "have I done Wolves yet?" answerable from the roster alone.
- **The re-group runs only when the open Band changes, never on a tap.** `handleOpenBand` in `PredictTableFlow` is the single entry point that enforces this — every call site that changes which Band is open goes through it, so the rule can't be bypassed by a call site that forgets it. Re-sorting on every tap would shift chips under the player's finger between taps, which is exactly the failure mode 0008 already specified fixed roster positions to avoid; this rule extends the same principle to the demoted grouping.
- **Members inside a Band are listed alphabetically**, never by insertion order or last season's position. Only Band membership scores; order within a Band carries no weight at all. Stacking members vertically under a range badge like "3–5" implied first = 3rd, second = 4th, third = 5th — reintroducing exactly the "9th or 10th?" non-decision that 0008's full-1–20-list rejection was trying to avoid. Alphabetical order is a _behavioural_ fix, not just a caption: a player who places Liverpool first and sees it render third learns immediately that the order isn't theirs and isn't being recorded. Backed by one line inside the open Band: "Any order — only who's in the Band counts."
- **Layout**: multi-club Bands render members in a fixed 3-column grid flush to the card edge, so gridlines align down the whole stack instead of each Band wrapping into its own ragged shape. One-club Bands (Champion, Runners Up) put their club inline on the header line instead, with its kit badge at full weight — there it is the answer, not one of three. Champion takes the `accent` tint (`docs/DESIGN_SYSTEM.md` reserves `accent` for the 1st-place tint); Runners Up gets a quieter neutral lift, the correct ordering between the two.

## What this deletes

`tapWhileFilling` (superseded by `tapWithEviction`), `dropInto` (the review-phase drop-target move), `swapBands`/`SwapResult` (the review-phase swap), and `modeFor`/`Mode` (the derived filling/review mode) — all from `src/lib/table-predictions/board.ts`. The `justSwapped` swap-pulse prop threading through `PredictTableFlow`, `BandsBoard`, and `PlacedTeamCard`, and the `SwapUndo` variant of `BandsBoard`'s `UndoState`. All were kept alive through the prototype phase specifically so the two-grammar board could be restored without a rewrite; now that the product owner has signed off on this design, that reversibility is no longer worth the standing cost of dead code paths and their tests.

The invariant binds **every** path that assigns a club, not just the obvious
one. The toggle-revert (tapping a club that is already in the open Band, to
send it back where it came from) is also an assignment, and it was possible
to break the invariant through it: move a club out of a full Band, refill
that Band, then toggle the club back and it lands in a Band that is full
again. The revert therefore checks capacity too, and returns the club to the
roster unplaced when its old Band no longer has room. It deliberately does
**not** evict a third club to make space — the "next out" marker only ever
describes the open Band, so an eviction there would be one the player was
never shown, which is precisely what the design is careful to avoid.

## Considered and rejected

- **Keeping the review board as a read-only stage**, reached the same way but rendered without the swap grammar — a middle ground that still signals "you're done." Rejected because the signal that mattered wasn't "you're in a different stage," it was "your taps mean something different now" — and a read-only stage doesn't fix that; it just delays the same silent switch to whenever the player next wants to edit.
- **Hiding placed clubs from the roster entirely** once they're assigned, rather than demoting them. Rejected because it removes the only way to pull a club out of one Band and into another without adding a new disclosure control (an "already placed" drawer, a search) — demotion keeps the single roster as the one place every club, placed or not, can be reached from.
- **A "NEXT OUT" badge on the evicted-next card.** Tried and removed: it named a mechanism rather than describing anything, and two words can't carry a rule this conditional — it only applies to one specific club, only while its Band is exactly full, only until the next tap. What the badge was protecting — eviction being stated before it happens — now lives entirely in the plain-English line above the roster, which actually names the club; the card keeps only the warm tint, giving that sentence something to point at.
- **Kit-colour rails as club identity in collapsed rows.** Looked right in the abstract and failed on the real Premier League: Arsenal, Liverpool, Man United, Sunderland, Forest, Palace, Bournemouth, and Brentford all render as the same red, so a wash of identical rails disambiguated nothing while costing a column of width. Replaced with the existing 3-letter club-code badge, which is unambiguous by construction.

## What this consciously does not fix

The residue from 0008's "What this consciously does not fix" still applies unchanged: confidence still doesn't set cost, and the packing arithmetic — Bands must still end exactly right for full marks — still requires the player to notice a Band is wrong and go fix it. What changes here is narrower: the _grammar_ used to fix it never switches underneath the player, and an out-of-target Band is no longer a state the board can silently sit in past 20 placements — over-fill is structurally impossible, so the only remaining imbalance is under-fill, which the fill-state tint and the return-visit landing already surface.

This also does not revisit whether eight Bands is the right number, or whether the harsher top-of-table placement curve (item 1 under "The decision," above) is a net improvement or just a side effect nobody weighed on its own. Both fell out of the Runners Up split, which was motivated by the layout problem (Champions League holding four clubs read badly as three-plus-one on a phone), not by a scoring goal. Worth revisiting once there's a season of real placement data to look at, per `docs/adr/0010`'s own "Deferred, not settled here."

## Structural consequences, resolved here rather than deferred

- **Undo restores a snapshot, not an inverse move.** An eviction changes two clubs in one tap, and the Band the evicted club came from is full again by the time an inverse move would try to put it back — "drop it back where it was" is not a legal move once eviction has made room for someone else, while "put the whole board back how it was a moment ago" always is. `PredictTableFlow` keeps one level of snapshot (`assignments`, `previous`, `placedAt`, and the touched team ids) taken immediately before the last saved tap, and undo replays it by re-persisting exactly the teams that tap touched — one for a plain move, two for an eviction.
- **The eviction-persistence path is two requests, not one**, fired together: an `assign` for the tapped club and an `unassign` for the evicted club, rolled back together if either fails. This is a direct consequence of eviction being a single UI action that changes two rows in the `table_prediction_ranks` table.

## Provenance

Prototyped on `proto/predict-table-rethink` (10 commits, `775d489`–`3fed0f6`), reviewed against the shipped `docs/adr/0008` design and the interaction spec in `docs/predict-table-capture-spec.md`. Behaviour and visual design signed off by the product owner on the prototype branch before this ADR was written; this document and the branch's cleanup pass (test coverage, doc updates, prototype-scaffolding removal) are what turn that sign-off into a mergeable state. `docs/predict-table-capture-spec.md` is rewritten alongside this ADR to describe the shipped behaviour exactly, the same relationship 0008 had to the spec before it.
