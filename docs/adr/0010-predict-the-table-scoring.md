# Predict the Table pays for information, not placements

The first implementation scored each team `6 − band_distance` (0–6, 120 available) plus a Band Bonus of +10 per Band and +20 for Champion (80 available), to a maximum of 200. It worked and was tested, but it barely discriminated: because most placements land within one or two Bands of the truth, nearly every player banked 90–110 of the 120 available on the per-team component. All the separation between players came from the lumpy, all-or-nothing Band Bonuses — the luckiest part of the feature.

An assumption-inversion session on the scoring rule produced one finding that reframes the problem, and everything below follows from it:

> **The scoring paid for placements, when what it should reward is information.**

Roughly eight of the twenty placements are near-free — everyone puts Manchester City near the top and everyone expects the promoted clubs to struggle. The genuine judgement in a Premier League table prediction lives in the six-to-eight clubs that could plausibly finish anywhere from 6th to 15th. Paying identically for common knowledge and for hard-won judgement is exactly what compressed the scores. Seen that way, the Band Bonuses weren't too lumpy — they were simply the only component with any variance left, doing the separating by default because the other component paid everyone a participation wage.

## Decision

```
PLACEMENT (per team, 20 teams)
  Right Band                      5
  1 Band out                      2
  2 Bands out                     1
  3+ Bands out, or unplaced       0                  max 100

BOLD CALL BONUS
  +3 per correct placement made by no more than roughly one in 10
  eligible players; best 5                            max  15

BAND BONUS (exact full membership, any order within)
  Champion / Champions League / Relegated     15 each
  Europe / Mid / Lower / Relegation Battle    10 each  max  85
                                                      -------
MAXIMUM                                                   200
```

**The placement curve is steeper and shorter.** `5 / 2 / 1 / 0` instead of a linear 6-down-to-0 across seven distances. This was raised as an explainability fix — four tiers with no mental arithmetic instead of seven — and it is one, but its larger effect is on discrimination. The old curve was nearly flat across the distances that actually occur, so everyone scored alike; the new one drops sharply across exactly that range. Rough modelling put the gap between a good and a weaker predictor at ~14% before and ~25% after. The explainability win was the stated reason; the compression fix is the reason it's the right call.

**Bold Call is surprisal scoring, capped and flattened.** A correct placement made by no more than roughly one in 10 eligible players pays +3. Competitions with fewer than 10 eligible players still allow one lone correct call; the threshold then grows by one agreement per 10 players. This is the direct mechanism for the finding above: it pays for information rather than for placements, and it takes its difficulty signal from the crowd, so nothing has to be modelled and it re-calibrates itself every season. Flat rather than proportional, and capped at five, because a ten-to-twenty player crowd is a thin sample and the rarity signal will be lumpy — a cap stops that noise being amplified into a runaway score. The cap is also what keeps the maximum at a quotable 200.

**All seven Bands carry a bonus, with 15 on Champion, Champions League and Relegated.** The three key Bands are what a season is actually about. They are also the *easier* ones to hit — Champion needs one team right where Mid Table needs three exact — so 15-against-10 is a larger premium per unit of effort than the ratio suggests. Paying a bigger multiple on top of that would have been paying the premium twice, which is why the wider 25/20/20-against-5 split was rejected.

**These two mechanisms cover each other's blind spots rather than cancelling.** Band Bonuses reward the Bands where players agree; Bold Calls can only fire where players disagree, which is almost never Champion and rarely Relegated. So the key Bands earn through bonuses and the "moot" middle Bands earn through Bold Calls. The apparent tension between "reward the key Bands" and "reward the non-obvious" resolves itself in practice.

**Late Joiners are on the board, visually de-emphasised, and cannot win it.** They sit outside the Bold Call process in both directions: they earn none, and their predictions never count toward anyone's rarity denominator. The cohort is frozen at Gameweek 1's lock, so a mid-season signup can never dilute a score another player already earned. Their ineligibility for the Predict the Table title is what turns the resulting 185 ceiling from an unfair handicap into a non-issue — and it matches their existing ineligibility for the season title.

**Predict the Table remains standalone**, per `docs/adr/0009`: it does not fold into Season Total and does not affect Season Winner.

## Structural consequences, resolved here rather than deferred

- **This breaks the pure-function property, knowingly.** `docs/adr/0009` established that a match score is a pure function of one player's pick, and rejected rank-relative scoring ("Closest to the Pin") to preserve it. Bold Calls need the whole cohort's predictions. The score stays deterministic and idempotent — fully recomputable from stored data at any time — but it is no longer a function of one prediction alone. This is the **second** deliberate divergence between the two scoring systems (the first being difficulty-shaped weighting, rejected for matches and effectively accepted here). Two divergences are defensible on the grounds that Predict the Table is standalone and cannot decide the season; a third would suggest there is no principle, only preferences.
- **The module has two entry points.** `scorePredictTable` scores one prediction's placement and Band Bonuses and remains pure. `scorePredictTableCohort` is the only entry point that can produce a complete score, because Bold Calls are inherently a property of the cohort. Callers wanting a real total must use the latter.
- **The maximum is still 200**, so `CLAUDE.md`'s existing "Maximum possible score: 200" survives the rewrite unchanged. Coincidence rather than design, but a welcome one.
- **A player's own prediction counts toward its own rarity.** With twelve eligible players, one agreement qualifies and two do not. Documented rather than adjusted — the alternative (excluding yourself) makes the threshold shift with cohort size in a way that's harder to explain.
- **The 3+ Bands out cliff means a badly-placed team scores exactly what an unplaced team scores.** ADR 0008 deliberately allows an untidy, under-filled table to still score; this slightly weakens the incentive to place a team you have no read on. Accepted: a player still has everything to gain by guessing within two Bands, which is most guesses.

## Considered and rejected

- **Keeping the old `6 − band_distance` curve.** Rejected as the direct cause of the compression: it is nearly flat across the distances that actually occur.
- **`5 / 3 / 1 / 0` rather than `5 / 2 / 1 / 0`.** Genuinely appealing — an arithmetic sequence expressible as a single sentence ("5 points, minus 2 for every Band you were out"), where the chosen curve needs a lookup table. Rejected for the sharper premium on getting a Band exactly right.
- **Scoring actual finishing position rather than Band** (`|predicted position − actual position|`), the most common form of this game in the wild and far more discriminating. **Blocked by a prior decision**: ADR 0008's capture UI deliberately does not elicit meaningful order within a Band, and `CLAUDE.md` states that order is incidental. Scoring position would score noise the player never intended to express. Reviving it means un-deciding the shipped capture UI.
- **Removing the Band Bonuses to smooth out the cliffs.** The intuitive fix, and backwards here — the smooth component is the one that fails to separate anyone, so removing the lumps makes the stated problem worse.
- **System-set difficulty weights per club** (×2 on clubs that finished 6th–15th last season, plus promoted sides). A cleaner statement of the same insight as Bold Calls, and it stays a pure function of one prediction. Rejected in favour of crowd-sourced rarity, which needs no weight table, re-calibrates itself annually, and has no fairness argument attached to it. It also sits closer to the odds-shaped weighting `docs/adr/0009` rejected for match scoring.
- **Doubling a rare correct placement (10 rather than 5) instead of a flat +3.** Same idea, bigger swing, and it amplifies exactly the noise a small crowd makes. The flat bonus is bounded and the cap is explicit.
- **Uncapped Bold Calls.** Simpler rule with nothing to explain, but the theoretical maximum becomes 210 and looks arbitrary on a "How it works" page. The cap rarely binds in practice — a realistic player earns two to four.
- **Bold Calls sitting outside the 200** (making the tidy `20 / 20 / 20 + 10 × 4 = 100` bonus split possible). Rejected because the real ceiling would be 215, and a neat quotable maximum was an explicit goal.
- **The `25 / 20 / 20 + 5 × 4` bonus split.** The strongest possible statement that the key Bands matter, and it pays 5 for naming three exact Mid Table clubs against 25 for naming the champion — a steep inversion of how hard each actually is.
- **Negative points for being 4+ Bands out**, to open up the bottom of the range. Wrong audience (players from ~10), and it punishes exactly the bold contrarian placements Bold Calls exist to encourage, so the two mechanisms would partly cancel.
- **Rolling re-prediction scored on how early you were right**, borrowed from Metaculus. Alive as an idea — it's how serious forecasting tournaments work — but it changes the feature from "your pre-season take" into an ongoing forecasting exercise, and it's a large build for a family competition.
- **Per-Band leaderboards ("seven jerseys")**, borrowed from grand-tour classifications, giving several simultaneous contests instead of one. Rejected *as a scoring answer* — it routes around the compression rather than fixing it — but it costs almost nothing now that per-Band scores are exposed on the result, and would compose fine with this decision if the leaderboard ever wants it.

## Deferred, not settled here

- **Whether the Champion Band Bonus is worth its 15.** It needs one team right, so in a typical season most of a twelve-player group will earn it and it will separate nobody, functioning as a flat addition to everyone's score. The counter-argument is that the rare season where a surprise club wins the league is exactly when it should blow the board apart, and variance is free in a standalone feature. Left at 15 without resolving which reading is correct; revisit after a season of real data.
- **The Bold Call threshold of roughly one in 10.** A judgement call, not a derived number, and the most likely thing to need tuning once there's a real cohort. It is a single threshold in `src/lib/scoring/predict-table.ts`; small competitions floor it at one qualifying agreement.
- **How "greyed out" renders for a Late Joiner** on the Predict the Table board — a display decision for whoever builds that surface.
