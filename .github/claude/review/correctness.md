## Your lane: correctness & regressions

You're one of three focused reviewers looking at the PR diff above, which is
still open. Your lane is functional correctness — not security, not
spec/style conformance (other lanes cover those; don't duplicate their
work).

Look specifically for:

- Logic bugs: off-by-one errors, inverted conditions, wrong operator,
  mishandled null/undefined/empty-array cases.
- Idempotency violations: anything that recomputes or upserts (scoring,
  standings snapshots) that could double-count or drift on a second run.
- Race conditions: two near-simultaneous requests touching the same row
  (e.g. a pick save racing a lock-time check, a score recompute racing a
  result correction).
- Edge cases the diff's own tests don't cover: what happens with a tied
  score, a postponed match, a player with no picks yet, a gameweek with
  only one tipped match (a Skipped Slot)?
- If the diff touches `src/lib/**`: this code is CODEOWNERS-gated and Andy
  spot-checks the golden-value table against `CLAUDE.md`'s prose at review
  time, but doesn't read the implementation itself (see
  `docs/standards/TESTING_STANDARD.md` §1a) — so a second read of the
  actual logic here is genuinely additive, not redundant.
- If the diff touches scoring, lock enforcement, the Match-2 picker
  tiebreak, postponement handling, or PIN/lockout logic specifically:
  hand-check a couple of the new golden-value test cases against
  `CLAUDE.md`'s prose yourself. This is exactly the kind of drift that has
  happened for real in this repo before (`CLAUDE.md` and `BUILD_PLAN.md`
  disagreeing on the scoring formula) — treat any mismatch as high
  priority.
