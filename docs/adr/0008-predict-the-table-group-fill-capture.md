# Predict the Table capture: fill groups, don't place teams

`docs/adr/0003-predict-the-table-shape.md` decided the feature's shape (20 teams into 7 fixed-size Table Bands, band-distance scoring, no drag-and-drop) and then accumulated seven build-update entries refining a capture interaction that the product owner still found unpleasant to use. This ADR replaces that interaction. **0003 remains authoritative** for the band structure, the scoring model, the standalone-from-Season-Total decision, the no-crest constraint, and the rejection of drag-and-drop; everything it says about the Picker, the calling queue, swapping, and remove-and-requeue is superseded here.

## The problem, in one line

The old flow iterated **per team** — for each of 20 clubs, choose a destination — which forces an indirection: the club being decided has to be held somewhere (`queueOrder` / `reconsiderTeamId`) while a destination list is presented somewhere else (the Picker drawer). Every symptom followed from that: you couldn't tell what was selected, the drawer covered the board at the moment of decision, moving a club into a full Band demanded a one-for-one swap, and there was no way to move several clubs at once. `docs/predict-table-problem.md` carries the full cognitive walkthrough and the design requirements that came out of it.

## The decision

**Iterate per group, not per team.** One group is open at a time and the player taps as many clubs as they want into it. Seven iterations instead of twenty, and the emotionally loaded groups ("who goes down?") are held in the player's head as _sets_, which is the unit the interaction now matches.

The screen is **one surface that changes density**, not two passes and not a static board:

- **While filling** — the open group is expanded, with the roster inside it directly beneath its members, so the source and the destination are adjacent with no travel. The other six groups collapse to a one-line summary of who's in them, so nothing you've already decided is hidden while you decide the next thing.
- **Once all 20 are placed** — the accordion opens out. Every group expands into a full card grid, the roster is gone (it lives inside the open group, and there is no open group), and the screen is a review board. No gate, no mode to be in the wrong one of; the screen simply relaxes when the work changes.

**Two grammars, deliberately.** Filling is group-first (a group is armed; tapping any club sends it there) because that is a scaffold for the load of placing twenty clubs. Reviewing is team-first (tap a club, then tap where it goes) because at that point you notice the _club_ is wrong, not the group. Tapping a club anywhere — roster or board — acts on that club; the phase decides the verb.

**Over- and under-filling are legal throughout, and an untidy table still scores.** Band-distance scoring works on any assignment, since a club sits in exactly one group regardless of how full it is; only the Band Bonus needs exact membership, and over-filling hedges nothing. So an untidy table is a _worse_ table, not a void one — worse by exactly the amount of structure the player didn't use. Submit therefore never blocks; it warns once with each affected group's count, then lets the player either submit anyway or keep editing. This restores 0003's original free-form intent, which was never revoked on purpose — it was squeezed out when the #26 build made the flow one-team-at-a-time.

### Supporting decisions

- **Roster**: all 20 clubs always visible in fixed positions, ordered by last season's finishing position with that position shown (promoted clubs last, marked "Promoted"). Placed clubs stay in the roster, labelled with the group they're in. Because the source list _is_ last season's table, every placement is implicitly a judgement about improvement or decline — the anchor is present without a mechanic for it.
- **Navigation**: no rail and no chevrons. Group headers are the navigation — tapping a collapsed group opens it. Global progress ("14 of 20 placed") sits above the submit button, where finishing is decided; per-group counts cover the local picture.
- **Fill state**: tint means "something to do here" and nothing else. Under-filled takes a soft neutral wash, over-filled a danger tint, and a group that is exactly right goes plain white with a ticked count. The board opens fully washed and visibly calms down as it is finished, rather than colouring in both the resolved and unresolved states.
- **Correction while filling**: tapping a club already in the open group toggles it back to its previous state (previous group, or unplaced) — standard multi-select semantics, so a misclick needs no new mechanic. There is **no unplace action**, since an unplaced club scores zero while a badly placed one still scores band distance; removal is strictly self-harm.
- **Moving a placed club**: no confirmation dialog. The move happens with a quiet undo. Prevention is handled by the group label on every roster chip, and a modal on a frequent path is how a flow starts to feel like fighting.
- **Drop targets are stated, not implied**: lifting a club in review makes every other group grow an explicit "Move BHA here" button, rather than relying on the group header being quietly clickable.
- **Start again**: one bulk action survives, confirm-gated. It is the only escape from a table the player wants to bin, and the only operation that cannot be reconstructed from cheap individual moves.
- **Return visits** arm the first group that isn't correctly filled — Champion on a first visit, the real work on a later one.
- **After the fixed Table Prediction deadline**: the expanded review board, read-only, with lifting disabled and the tints dropped — once locked, "one too many" is history, not a task.
- **Ceremony** goes on the Champion pick: a non-blocking visual beat, never an interstitial, since players change their champion and a celebration that punishes reconsidering is worse than none. The existing submitted moment stays.
- **Late joiners** are unchanged: the optional-and-skippable variant, with "Skip for now" below the submit button.

## What this deletes

The Picker (drawer and side panel), `queueOrder` and auto-advance, `SwapChooser` and the swap concept entirely, remove-and-requeue, per-Band Clear, Clear all, and the hard validation gate. Four of 0003's seven build-update entries — all four of which were fixing the drawer — stop applying. This is a design that removes more code than it adds.

## Considered and rejected

- **Two passes with a gate** (fill on a dedicated one-group screen, then a separate review board) — prototyped as Variant B. Rejected because the filling screen hides the other groups, and mid-table judgement is entirely "above or below the ones I've already placed"; it also optimises for a player's first ten minutes at the cost of every visit afterwards.
- **A permanently fully-expanded board** (Variant A) — rejected as too heavy while filling; the accordion earns its keep by keeping the decision and the roster adjacent.
- **Insert-and-ripple** (moving a club into a full group pushes the bottom occupant down, cascading) — genuinely solves displacement, but implies the player is choosing exact 1–20 positions rather than group membership, which is a larger change than the complaint warranted.
- **Resolving the whole feature into a 1–20 ordered list** with group boundaries drawn across it — would make exact group sizes structural and unrepresentable-as-wrong, and would make CLAUDE.md's "always store the full 20-team ordering" honest rather than nominal. Rejected for now as a bigger departure than needed, and because a 20-row list makes "9th or 10th?" a visible decision that carries no scoring weight. Worth revisiting if group sizes ever become contentious again.
- **Pre-filling the board and editing only what you disagree with** (0003 rejected this too, as a "smart default") — re-examined and rejected again, for a sharper reason than last time: the objection isn't pre-filling as such, it's that correcting a machine's guess at your opinion feels like proofreading, while building from a _factual_ starting point (last season's table, as the roster ordering) feels like authorship. The roster ordering captures the benefit without the cost.
- **Better/worse/same against last season's table** — a strong idea, native to how fans actually talk, and immune to the intransitivity that pairwise club-vs-club comparison suffers. Rejected because 20 deltas don't resolve into a table with fixed group sizes; it needs a delta-to-ordering resolution step that is the shakiest joint in that design.
- **Stepping the groups in confidence order** (Champion, Relegated, Champions League, then the middle) rather than table order — would stop the most charged remaining call, Relegated, being answered last by elimination. Rejected in favour of table order's legibility; free jumping between groups mitigates it, since a player who arrives certain about the drop can go straight there while the roster is still full.
- **The system resolving an untidy table at lock**, or auto-spilling overfilled groups — rejected on the same grounds each time it came up. Deciding which club drops out of the top four _is_ the prediction; handing that to the system at the moment it is hardest is where authorship leaks out.

## What this consciously does not fix

Confidence still doesn't set cost — Mid Table gets the same ceremony as Champion — the residue of clubs a player has no opinion about still costs a tap each, and there are no relative gestures. This repairs the _interaction_, not the underlying mismatch between twenty required assertions and roughly six real opinions. That is a deliberate scope: it is the low-risk repair of what was actually complained about, and it forecloses none of the larger ideas above.

The packing arithmetic also survives: groups must still end exactly right for full marks, so someone still has to notice that Champions League holds five. What changes is the tax on fixing it — roughly four taps through a drawer per move, down to two with the whole board visible. The puzzle remains; the fight does not.

## Implementation reference

`docs/predict-table-capture-spec.md` carries the interaction model in full — state shape,
every tap rule for both phases, the fill-state presentation table, and the decisions that
were specified but never prototyped — so the model doesn't have to be re-derived at build
time. Its styling is explicitly not binding; `docs/DESIGN_SYSTEM.md` governs that.

## Provenance

Problem statement and cognitive walkthrough: `docs/predict-table-problem.md`. The shape was reached through a lateral-thinking provocation session and a decision-by-decision grilling, then settled against three prototyped variants (A: one screen fully expanded; B: two passes; C: accordion focus) on the real route behind `?variant=`. Variant C won, amended so its accordion opens out into A/B's expanded review board once all 20 are placed. The prototype set is the primary source and lives on a throwaway branch, not `main`.
