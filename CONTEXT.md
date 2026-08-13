# Tipperoos

A private Premier League tipping competition. Each Gameweek, a small number of Fixtures are opened for prediction; Players score points for accurate scorelines and climb a season-long leaderboard.

## Language

**Fixture**:
One of the 380 seeded matches in the season, whether or not it's ever opened for tipping.
_Avoid_: Match (too generic — overloaded with Tipped Match)

**Tipped Match**:
A Fixture selected for player predictions in a given Gameweek. Exactly two per Gameweek (Match 1 and Match 2).
_Avoid_: Open Match, Selected Match

**Match 1**:
The Tipped Match auto-selected each Gameweek as the **Top Matchup** — the Fixture whose two clubs have the best average league position (see `docs/adr/0006-auto-selected-tipped-matches.md` for the rule and its tiebreaks).
_Avoid_: Marquee match (fine casually; Top Matchup is the term shown to players)

**Match 2**:
The Tipped Match auto-selected as the **Random Pick** — an equal-chance draw from the Gameweek's remaining Fixtures.

**Top Matchup** / **Random Pick**:
The player-facing names for how each slot was chosen, shown on the Tipped Match card. They exist because nothing is player-chosen any more, so the card has to answer "why these two fixtures?" itself.

**Picker**:
_Deferred, not in the current product._ The Player who would choose Match 2, determined by the previous Gameweek's Standings Snapshot. Superseded for the initial launch by auto-selection (`docs/adr/0006-auto-selected-tipped-matches.md`); the term is retained because the mechanic and its `gameweeks` columns are reserved for a possible return.
_Avoid_: Loser, Last place (fine in casual conversation, but Picker is the domain term)

**Pick Board**:
The app's home surface at `/` — the two Tipped Match cards for the current Gameweek, plus the Player's own standing and last week's outcome. The Pick Board _is_ home; there is no hub in front of it (`docs/adr/0007-home-surface-and-pick-entry.md`).
_Avoid_: Dashboard, Home screen (Pick Board says what it's for)

**Gameweek**:
A round of the Premier League season. The unit against which exactly two Tipped Matches and one Standings Snapshot are attached.
_Avoid_: Round, Week

**Gameweek Score**:
The points a Player earned in one specific Gameweek, from that Gameweek's Tipped Matches only. Distinct from Season Total.

**Match Score**:
The points one Player earned on one Tipped Match: 0–7, drawn from `{0, 1, 3, 4, 5, 7}`. A pure function of that Player's own Pick and the match's authoritative result — it never reads other Players' Picks or their ranking. See `CLAUDE.md` → _Scoring_.

**Wrong Way Round**:
A Pick that names the exact scoreline with the sides swapped (called 2–1, it finished 1–2). Worth +1, and mutually exclusive with every other scoring term by construction. Can never occur on a draw.
_Avoid_: Reversed, Flipped (both read as an admin action on a result, not a Player's outcome)

**Benchmark Line**:
The Median Bot's Season Total, shown on the leaderboard as a bar to clear rather than a rival to beat — Bots can't win. Beating the crowd's own consensus over a full season is the app's one comparison that reflects skill rather than luck.

**Season Total**:
A Player's cumulative points across all Gameweeks played so far. Shown alongside **points-per-Gameweek-played**, so a Late Joiner or a Player who missed Gameweeks isn't visually buried by a total covering weeks they weren't in.

**Season Standing**:
A Player's rank among all Players by Season Total, as of a given Gameweek. Worst standing = highest rank number (closest to the bottom of the table), not lowest — this was the Picker tiebreak's second signal, and remains the leaderboard's ordering.
_Avoid_: Position (ambiguous — reads as "best" as easily as "worst")

**Standings Snapshot**:
The recorded Season Total and Season Standing for every Player, captured once per Gameweek starting at Gameweek 1. No longer a prerequisite for opening a Gameweek now that the Picker is deferred, but still required for the leaderboard and for the Pick Board's own standing display.

**Voided Match**:
A Tipped Match postponed _after_ its picks have locked. Scores nobody, permanently — no reroll, no substitute.

**Skipped Slot**:
A Match 1 or Match 2 slot left empty for a Gameweek because its Fixture was postponed _before_ picks locked. No replacement Fixture is selected; that Gameweek simply runs with one Tipped Match instead of two.
_Avoid_: Void, Voided Match (reserved for the post-lock case — the rules and player-facing meaning differ)

**Competition**:
A private group of Players tipping independently against each other on the same real Premier League season. Two Competitions may tip the same Fixtures/Gameweeks (they share the same underlying football facts) but never share Players, Picks, Scores, or a Season Winner. Exactly one exists today; see `docs/adr/0004-multi-competition-foundational-scope.md` for the foundational schema work enabling a second.

**Player**:
A participant in exactly one Competition. A Bot is a Player with `is_bot = true`, not a separate concept — it has picks, scores, and a Standings Snapshot like any other Player.

**Competition Admin**:
A Player (`is_admin = true`) with exactly one elevated write capability, scoped to their own Competition: resetting another Player's PIN (and, once they exist, administering that Competition's settings — e.g. a lockout duration). No elevated read visibility — bound by the same pre-lock pick-hiding rules as any other Player. Unlike the old single-tier "Admin" concept, does **not** correct match results or kickoff times (see Superadmin) — and is therefore eligible for their own Competition's Season Winner, since PIN resets can't influence scoring. Exactly one per Competition, assigned when the Competition is created.
_Avoid_: Admin alone (ambiguous now that the role is split — always say Competition Admin or Superadmin).

**Superadmin**:
A documented role, deliberately not built yet: a Player with cross-Competition match-result/kickoff-time correction rights — the only capability that would ever span every Competition, since Fixtures/Matches are shared, global facts with no Competition of their own. Would never partake in any Competition's gameplay (a pure administrative role) and would be excluded from every Competition's login roster via a separate gate. Not needed while one person administers every Competition that exists — see `docs/adr/0004-multi-competition-foundational-scope.md` decision 6. Match-result correction is, for now, a development-team database action, not an in-app capability at all.

**Season Winner**:
The Player with the highest Season Total at season end, within one Competition. Eligible pool excludes any Late Joiner, every Bot, and (if it's ever built) a Superadmin; a Competition Admin **is** eligible. **No Bot can be Season Winner** — Bots are there for fun and intrigue only, so the Season Winner is always a person (see `docs/adr/0009-match-scoring-formula-and-title-eligibility.md`).

**Late Joiner**:
A Player who signs up after Gameweek 1 has begun. Not eligible for Season Winner (didn't compete the full season). May submit Predict the Table at any time after joining, or skip it — both optional, unlike the mandatory pre-season capture for on-time Players.

**Table Prediction**:
A Player's full 20-team finishing-order prediction for the season, captured by sorting teams into Table Bands. Submitted once during onboarding, re-submittable any number of times until Gameweek 1's first kickoff, then locked. Optional for a Late Joiner.

**Table Band**:
One of 7 fixed groupings of final Premier League position, used to score a Table Prediction: Champion (1), Champions League (2–5), Europe (6–8), Mid Table (9–11), Lower Table (12–14), Relegation Battle (15–17), Relegated (18–20). A team's predicted Table Band is compared against its actual Table Band to score points; the order of teams within a Band carries no scoring weight.

**Table Prediction Score**:
A standalone points total (max 200) earned from a Table Prediction, recomputed continuously against current Premier League standings. Distinct from Season Total — does not affect Season Winner.
_Avoid_: assuming this contributes to Season Total — it deliberately doesn't, for now.
