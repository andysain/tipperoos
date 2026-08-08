# Both Tipped Matches are auto-selected; the Picker mechanic is deferred

`CLAUDE.md`'s _Core weekly mechanic_ originally specified Match 1 as a random
auto-selection and Match 2 as chosen by whoever finished last the previous
Gameweek, with curated/marquee selection explicitly listed as a future
enhancement rather than v1. This ADR reverses both halves of that: **Match 1
becomes the marquee selection, Match 2 becomes the random one, and no human
picks anything.** It supersedes those two rules; everything else about Tipped
Matches (two per Gameweek, Skipped Slot on pre-lock postponement per
`docs/adr/0001-skip-slot-on-pre-lock-postponement.md`, Voided Match post-lock)
is unchanged.

## Decision

**Match 1 — the top-ranked matchup.** Of the Gameweek's Fixtures, choose the
one with the lowest average league position across its two clubs. Ties break
to the matchup containing the single highest-ranked club, then by a
deterministic final tiebreak (earliest kickoff, then `provider_match_id`) so
the rule never depends on arbitrary row order. Any club that appeared in the
previous Gameweek's Match 1 is excluded from the pool, so no club can be the
marquee two Gameweeks running.

**Rank source, by phase.** Positions come from last season's final table
(`teams.previous_season_position`, already seeded) until every club has played
at least ten matches of the current season, then from live standings. A club
promoted into the league has no previous-season position and counts as
position 21 — below every returning club. If live standings are unavailable or
stale at selection time, fall back to last season's table rather than blocking
selection. The switchover is expressed as "every club has played ≥10" rather
than a hardcoded Gameweek number so postponements can't shift it.

**Match 2 — uniform random.** An equal-chance draw from the Gameweek's
remaining Fixtures, excluding Match 1 and anything already kicked off. No
kickoff-slot spreading rule: marquee fixtures are usually moved to broadcast
slots anyway, so the two Tipped Matches tend to land in different windows
without engineering it. Within a single Gameweek every club plays exactly
once, so the two slots can never share a club and no rule is needed for that.

**When selection runs.** As soon as the previous Gameweek's Tipped Matches are
complete — the earliest moment the anti-repetition rule can be evaluated,
giving players roughly four to five days' notice. It runs on the existing
fixture-sync cadence; no new infrastructure. Gameweek 1 has no previous
Gameweek, so its two slots are chosen once by a seed script alongside fixture
seeding, both computable from last season's table with no live data.

**Selection is written, not recomputed.** The chosen Fixture ids are stored on
the `gameweeks` row and never re-rolled, so "random" is decided exactly once
and a page render can never produce a different answer than the last one.

## Structural consequences, resolved here rather than deferred

The `gameweeks` Match-2 Picker columns (`match_2_picker_id`,
`match_2_picker_status`, `match_2_picker_deadline`) become unused. They are
**retained, not migrated away** — they cost nothing empty, and dropping then
re-adding them is strictly more work than leaving them if the mechanic
returns. Treat them as reserved.

Selection no longer depends on the per-Gameweek Standings Snapshot. That
snapshot is still required for Season Standing and the leaderboard; it is no
longer on the critical path for opening a Gameweek, which removes a
dependency that previously had to land before Gameweek 2.

The Picker's notification, deadline window, and auto-pick-on-miss fallback all
disappear with the mechanic — that is roughly a third of the original
launch-critical automation surface, and removing it is what makes a
twelve-day runway to Gameweek 1 credible.

**The app now ships with no player-agency mechanic at all.** The Picker was
the only thing in the product a player could steer, and it gave the
week's worst performer something to enjoy. Accepting this is a real product
loss, taken deliberately in exchange for scope; it is the first thing to
reconsider once the season is running.

**Displayed positions and the selection rule can disagree.** The pick card
shows live league position (see
`docs/adr/0007-home-surface-and-pick-entry.md`), while this rule ranks on last
season's table for roughly the first ten Gameweeks. A "Top matchup" can
therefore read as, say, 14th v 3rd early in the season. Accepted as-is:
positions on the card are context, not a justification of the selection, and
players can work it out.

## Considered and rejected

**Keeping the last-place Picker for launch.** Rejected on runway, not on
merit — it needs the standings snapshot, a notification path, a deadline state
machine, and an auto-pick fallback, all of which must be correct by Gameweek 2. Deferred rather than dropped.

**No anti-repetition rule at all.** Defensible, since Match 2's randomness
already supplies variety, and it was the simplest thing to build and explain.
Rejected because a deterministic rule over a fixed fixture list will put the
same two or three clubs in the marquee slot for weeks at a stretch, and
"why is it always Arsenal?" is a worse conversation than three lines of code.

**A per-appearance penalty score, or requiring all twenty clubs to appear
before any repeat.** The penalty version makes the selection hard to explain;
the round-robin version forces genuinely dull fixtures into a slot whose whole
purpose is to be the interesting one.

**Rank source alternatives.** Last season's table all year needs no live data
but never notices a promoted side topping the table in March. Live standings
from Gameweek 2 reflect real form but treat a three-match sample as
meaningful — a good side sits 18th after one bad week. The phased blend costs
one extra branch and avoids both failures.

**Weighting Match 2 toward the lower end of the table**, for a deliberate
glamour/obscurity contrast. More character, harder to explain, and it makes
the "random" slot not actually random.

## Deferred, not settled here

- The last-place Picker mechanic, in full. Revisit once the season is running
  and there is appetite for a mechanic players can steer.
- Curated or hand-picked marquee selection — the ranking rule is a mechanical
  proxy for "the big game", and a human override is not built.
- Anti-gaming guardrails, which `CLAUDE.md` already rejects and which are
  moot while nothing is player-controlled.
- Whether the selection rule should switch to live standings from Gameweek 1
  so that it always agrees with what the card displays. Cosmetic; left open.
