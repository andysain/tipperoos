# Match scoring rewards steady judgement; no bot can win the title

The additive per-match formula in `CLAUDE.md` (result +3, goal difference +2, each team score +1, exact-scoreline bonus +2, max 9) was inherited from the retired World Cup app's _documented_ intent — never from evidence about how it played. It had also already drifted once against the code that actually shipped (see `BUILD_PLAN.md`, scoring-divergence entry). Before building the scoring engine, the formula was worked through from the incentives outward rather than carried forward by default.

Two facts drove every call below.

**The season is only 76 scored matches** (2 Tipped Matches × 38 Gameweeks). That is a very small sample for a group whose members differ modestly in skill. A tight leaderboard is not something this competition has to engineer — it gets one regardless. The scarce commodity is _signal_: enough resolution that the final table reads as a season someone won rather than a coin-flip. This inverts the obvious move — "keep everyone close" does **not** mean smaller numbers or fewer scoring tiers; it means keeping resolution while removing the luck-heavy payouts.

**In the retired World Cup app, the Median Bot led for most of the season and won it, and the Random Bot finished a substantial last.** Empirical, from this same player pool. Everything about auto-filled picks and bot eligibility follows from it.

## Decision

**Per-match formula, maximum 7:**

```
Correct result:                              +3
Correct goal difference:                     +2
Correct home score   (only if result right)  +1
Correct away score   (only if result right)  +1
Wrong Way Round                              +1
```

Reachable scores are `{0, 1, 3, 4, 5, 7}` — six distinct levels, so per-match resolution is preserved.

**No exact-scoreline bonus.** An exact scoreline scores 7 from its components alone. Exact hits are largely chance; over 76 matches a +4 jackpot let a lucky player out-score a better one by roughly the whole margin that separates the group, which is the opposite of the stated goal.

**Team-score points require a correct result.** The previous formula paid +1 for a correct team score even when the result was wrong (called 2–1, it finished 0–1 → 1 point for having been right about nothing except that the away side scored once). That is a pure-luck payout and it is removed.

**Wrong Way Round** replaces it: the exact scoreline with the sides swapped (called 2–1, it finished 1–2) pays +1. It is mutually exclusive with every other term by construction — a reversed scoreline necessarily gets the result, the goal difference and both team scores wrong — so it can only ever pay exactly 1 and there is no overlap to reason about. It can never fire on a draw, since a reversed draw is the same scoreline. It rewards having read the match and got the sides round the wrong way, rather than having guessed a stray number.

**No bot is eligible for the season "winner" title.** Bots exist for fun and intrigue; the season winner is always a person. This reverses `CLAUDE.md`'s previous "bots are eligible" rule, and resolves that rule's standing contradiction with the Median Bot's own description as _"a 'wisdom of the crowd' reference pick, not a competitive prediction."_ The World Cup result showed which of the two held in practice. The simpler blanket rule was chosen over demoting only the Median Bot, because it needs no argument about why one bot is a legitimate competitor and another is not.

**Bots are per-competition.** Each competition has its own bot players (`players.competition_id`, already present). This matters most for the Median Bot, which must derive from _its own_ competition's human picks — deriving it across competitions is precisely the `match_id`-without-`competition_id` leak `docs/adr/0004` warns about, and here it would also corrupt the benchmark itself.

**No auto-filled picks.** `docs/adr/0007`'s "nothing is pre-filled" rule is upheld: a player who never interacts has no pick row and scores nothing. See _Considered and rejected_ — this was reopened and closed on the World Cup evidence.

**The leaderboard shows points-per-Gameweek-played alongside the cumulative total.** The scoring engine stays dumb (no picks, no points); the display absorbs the problem that a Late Joiner or a player who missed a fortnight is otherwise visually buried under a total that reflects Gameweeks they were never in.

## Structural consequences, resolved here rather than deferred

- **A per-match score stays a pure function of one player's pick and the result.** Nothing in the formula reads other players' picks. This preserves the idempotent `(player_id, match_id)` upsert `CLAUDE.md` requires, and it keeps a future Star Match (a nominated double-points match — see _Deferred_) layerable as a multiplier without recomputing history. It is also what rules out the rank-relative scoring rejected below.
- **Roughly a third of Gameweeks a player now scores nothing** (both results wrong, no Wrong Way Round). This is a deliberate consequence of removing the loose consolation point, and it lands on the post-result email — the retention lever `CLAUDE.md` calls the highest-leverage one in the app. That email must have something to say about a blank week beyond the number.
- **Maximum 14 per Gameweek, 532 per season theoretical; ~150 realistic.** Predict the Table's 200 maximum therefore stays comfortably larger than a realistic picking season, which independently reinforces keeping it standalone.
- **The Median Bot benchmark is more useful than it was.** Demoted from competitor, it becomes the bar: beating the crowd's own consensus is a meaningful thing to have done over a season, and it is the one comparison in the app that says something about skill rather than luck.

## Considered and rejected

- **Keeping the exact-scoreline bonus at +2 (max 9)** — the documented status quo. Rejected: exactness is the luckiest term in the formula, and the whole point of this revision was to stop luck deciding a 76-match season.
- **Magnifying it instead ("Bullseye": exact 10, result 1, nothing else)** — maximum drama, and most weeks most players score 0–2. Wrong audience; the competition includes ~10-year-olds.
- **Compressing to the old app's tiered, mutually-exclusive model** (Exact 5 / GD 4 / Result 3 / else 0). The intuitive way to keep the leaderboard tight, and rejected for the reason at the top of this ADR: with only 76 matches, further compression pushes the season toward noise and makes the final table read as arbitrary.
- **Auto-filling a missing pick with a Random Bot scoreline** — proposed so inactive players and Late Joiners still score something. Rejected on the World Cup evidence: the Random Bot finished a substantial last, so auto-fill would manufacture pick rows, reverse ADR 0007, and still deliver a bottom-of-the-table finish. It buys the appearance of participation without the outcome it was meant to produce.
- **Auto-filling with the Median Bot's pick instead** — rejected much harder, in the opposite direction. The Median Bot won the World Cup, so filling a non-submitter with the crowd's pick would hand the player who never opens the app the best-performing strategy in the competition. Not playing would be strictly better than playing.
- **A participation point for filing on time** — softens blank weeks, but an always-wrong player climbs, which muddies the one thing the leaderboard is supposed to mean.
- **"Closest to the Pin"** (+3/+2/+1 to the three closest predictions each week, borrowed from FPL's bonus-point system). Genuinely appealing — it self-normalises across hard and easy fixtures without modelling difficulty at all. Rejected because it scores a pick relative to other players' picks, breaking the pure-function property above.
- **Difficulty weighting by league position** — a correct call on an upset paying more. Rejected: odds-shaped, and it imports the concept the no-gambling constraint exists to keep out, however it is named.
- **A goal-distance metric** (`max(0, 9 − 2 × total goal error)`) as the primary formula — smooth, no cliffs, one sentence to explain, and it stops caring who won: 2–1 predicted against a 1–2 result would score the same as a correct-result 3–2. Fatal for a football competition.
- **Budget-and-deduct framing** (start at 7, lose points per goal of error) — arithmetically close to the above, and punitive framing for the age group.
- **Streak multipliers** — strong retention hook, but compounding multipliers make a mid-season leaderboard unrecoverable, which hurts exactly the casual player the competition is built around.
- **Demoting only the Median Bot to a benchmark, leaving Random and 1‑1 eligible** — defensible on the principle that a bot making a blind pre-lock prediction takes real risk while a post-lock derived one does not. Rejected as an unnecessary distinction to have to explain.

## Deferred, not settled here

- **Star Match** — the player nominates one of the Gameweek's two Tipped Matches to score double. This was the strongest idea the option-generation session produced, because `docs/adr/0006` left a player with no decisions at all except two scorelines, and scoring is the only place agency can now live. Deferred rather than adopted: it needs a `picks` column, a lock rule for the nomination, and a forgot-to-nominate default, and doubling a 7 across only two matches a week adds variance this revision was otherwise reducing. The formula above is deliberately shaped so it can be layered on later as a pure multiplier.
- **Wrong Way Round's value (+1)** is a judgement call, not a derived number. If blank weeks prove demoralising in practice, raising it is the cheapest available lever.
- **Predict the Table's Band Bonus sizing** (+10 per Band, +20 Champion — 80 of its 200 maximum in all-or-nothing lumps, and the part that does most of the separating between players). Explicitly parked, unchanged. Confirmed here only that Predict the Table remains **standalone**: it does not fold into Season Total and does not affect the season winner.
