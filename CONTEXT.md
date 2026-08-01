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
The Tipped Match auto-selected at random each Gameweek.

**Match 2**:
The Tipped Match chosen by that Gameweek's Picker (or auto-selected, for Gameweek 1 only).

**Picker**:
The Player responsible for choosing Match 2 in a given Gameweek, determined by the previous Gameweek's Standings Snapshot (see tiebreak order in CLAUDE.md).
_Avoid_: Loser, Last place (fine in casual conversation, but Picker is the domain term)

**Gameweek**:
A round of the Premier League season. The unit against which exactly two Tipped Matches and one Standings Snapshot are attached.
_Avoid_: Round, Week

**Gameweek Score**:
The points a Player earned in one specific Gameweek, from that Gameweek's Tipped Matches only. Distinct from Season Total.

**Season Total**:
A Player's cumulative points across all Gameweeks played so far.

**Season Standing**:
A Player's rank among all Players by Season Total, as of a given Gameweek. Worst standing = highest rank number (closest to the bottom of the table), not lowest — this is the Picker tiebreak's second signal.
_Avoid_: Position (ambiguous — reads as "best" as easily as "worst")

**Standings Snapshot**:
The recorded Season Total and Season Standing for every Player, captured once per Gameweek starting at Gameweek 1 — independent of whether the Picker UI has shipped yet.

**Voided Match**:
A Tipped Match postponed _after_ its picks have locked. Scores nobody, permanently — no reroll, no substitute.

**Skipped Slot**:
A Match 1 or Match 2 slot left empty for a Gameweek because its Fixture was postponed _before_ picks locked. No replacement Fixture is selected; that Gameweek simply runs with one Tipped Match instead of two.
_Avoid_: Void, Voided Match (reserved for the post-lock case — the rules and player-facing meaning differ)

**Player**:
A competition participant. A Bot is a Player with `is_bot = true`, not a separate concept — it has picks, scores, and a Standings Snapshot like any other Player.

**Admin**:
A Player (`is_admin = true`) with exactly two elevated write capabilities — entering/correcting match results and kickoff times, and resetting another Player's PIN — and no elevated read visibility. Bound by the same pre-lock pick-hiding rules as any other Player; there is no "sees everything early" version of this role.
_Avoid_: assuming "admin" implies broader visibility or permissions than the two listed above — it doesn't, by deliberate design.

**Season Winner**:
The Player with the highest Season Total at season end. Eligible pool excludes the Admin and any Late Joiner; Bots are eligible to win.

**Late Joiner**:
A Player who signs up after Gameweek 1 has begun. Not eligible for Season Winner (didn't compete the full season). May submit Predict the Table at any time after joining, or skip it — both optional, unlike the mandatory pre-season capture for on-time Players.
