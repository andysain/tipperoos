# Leaderboard view: one segmented route, live rank with snapshot movement, inline ineligibility

Issue #24 ("Leaderboard view") carried three sentences of scope — "sum of scores per player, ranked, bots clearly labelled" — while three separate documents had each pinned a leaderboard requirement to it without any of them describing the surface: `CLAUDE.md` → _Scoring_ mandates a points-per-gameweek-played column and never defines "played"; `CONTEXT.md` → _Median Bot Benchmark_ says the Median Bot is "shown on the leaderboard as a bar to clear rather than a rival to beat"; `CONTEXT.md` → _Table Prediction Score_ says that score "has its own leaderboard and its own title". #32 (late-joiner ineligibility) additionally depends on #24 while its own done-when is purely a leaderboard display rule, so #24 has to settle the visual grammar for ineligibility even though the flag lands later. Resolved in a planning session against the current codebase, 2026-08-16.

## Current state this builds on (verified, not assumed)

Most of the leaderboard's data layer already exists and is not re-derived here:

- `scoresForCompetition` (`src/lib/competitions/scope.ts`) — the sanctioned competition- **and** season-scoped read of `match_id`-keyed score rows (issue #71). Returns one row per player including players with no score rows at 0, carrying `displayName`, `emoji`, `isBot`, `joinedAt`, `points`, `matchesScored`.
- `rankScores` (`src/lib/leaderboard/rank.ts`) — standard ("skip") competition ranking, ties share a place and the next distinct value's rank accounts for every tied player above it (e.g. two tied 3rd, next is 5th). Reversed from an initial dense-rank default (no skipped numbers) on 2026-09-04, issue #204: dense reads as wrong against a standard football table, which people already expect this to imitate.
- `standings_snapshots` (`supabase/migrations/20260801045416_schema_v1.sql`) — `gameweek_score`, `season_total`, `season_standing` per `(gameweek_id, player_id)`. The compute and write path is `src/lib/standings-snapshot/` (#23), and **#166 wired it to the match-result sync**, so this populates in production on the normal sync cadence rather than only under test.
- `src/lib/bots/` (#35) — bot pick generation for all three types, so Bots carry real scores from their first scored gameweek. D12 is therefore load-bearing from day one, not a rule waiting for data.
- `resolveCurrentGameweekForCompetition` (`src/app/_lib/gameweek-access.ts`) and the previous-gameweek pattern the Pick Board's last-week strip already uses.
- ADR 0005's tab bar, built to take more destinations; `src/components/nav/tabs.ts` names #24 as a future tab by number.
- `docs/DESIGN_SYSTEM.md` already reserves the accent colour for "the 1st-place leaderboard row" — one of only three sanctioned accent uses in the app.

Nothing here needs a migration. **Updated 2026-08-17: #166 and #35 have both merged**, so scores, standings snapshots and bot picks all populate on the normal sync cadence — the leaderboard has real data to render and to verify against on Preview. This ADR's original text listed #166 as a blocker; it no longer is.

## Decision

### D1 — One route, `/leaderboard`, as a third tab; two segments is the long-term shape

`/leaderboard` joins Pick Board and Predict the Table in `TABS`. The route ships with a **segmented control** (Season Total / Predict the Table) as its layout, because the two-view shape is the settled long-term direction — but the Predict the Table segment is **absent until #157 lands**, not present-and-disabled. The app never shows a control that does nothing, and the second segment then becomes a data-wiring job against an existing layout rather than a redesign of a single-list page.

Two segments in one route, rather than two routes: a fourth tab is the wrong price for a view most players will open once a season, and the two lists share a row component, a rank grammar and an ineligibility grammar. **Superseded 2026-08-21**: Match Centre never took a tab slot. `docs/adr/0013-match-centre-tense-and-axes.md` D1 makes it a _tense_ rather than a destination — `/gameweek/[n]` is reached from a settled slot and `/picks/[playerId]` from a row on this very board — so the tab bar stays at three.

### D2 — Rank is live; movement is against the last completed gameweek's snapshot

The **displayed rank and points are computed live** from `scoresForCompetition` + `rankScores`, exactly as the Pick Board's stats strip already does (`loadSeasonStats`). Two surfaces showing the same player a different rank on the same day would be a trust bug, and the leaderboard has no licence to be staler than the Pick Board.

**Movement** (`▲2` / `▼1` / `—`) is that live rank compared against the player's `season_standing` in the **previous gameweek's** snapshot — the same previous-gameweek resolution `LastWeekStrip` already uses, not "the most recent snapshot that exists". Comparing against the most recent snapshot would read `0` for the entire post-gameweek period, which is the exact window a player is most likely to open the leaderboard. Comparing against last week's means the arrow moves as results land, which is what "since last week" should mean.

A player with no previous-gameweek snapshot (they joined since) shows no arrow, not a `▲` from nothing. **See D12** for how the previous rank is derived — not by reading `season_standing`, which is computed on a different basis.

**Amendment 2026-09-04 (issue #202):** "the same previous-gameweek resolution `LastWeekStrip` already uses" turned out to be the bug, not the fix — `LastWeekStrip`'s resolution is the Pick Board's _next gameweek open for picking_ minus 1, which rolls over to N+1 the moment gameweek N finishes, before N+1 has any results. In the gap between "N fully scored" and "N+1 kicked off", `(N+1) - 1 = N`: exactly the last scored gameweek, so live rank ended up diffed against its own snapshot — the "compare against the most recent snapshot" failure this section names two paragraphs up, reached by a different path. The implementation now derives "previous" from the last gameweek that actually has a `standings_snapshots` row (the already-fetched scored-gameweek list), not from the Pick Board's current-gameweek concept.

### D3 — Points per gameweek played counts **gameweeks since joining**

The denominator is the number of **scored** gameweeks in this competition and season whose earliest Tipped Match kickoff is at or after the player's `joined_at`. A gameweek counts as scored once it has snapshot rows.

This is the honest reading of the column's purpose. `CLAUDE.md` and `docs/adr/0009` introduce it so a **Late Joiner isn't visually buried** by gameweeks that happened before they existed — not to excuse a player who was present and didn't pick. The rejected alternative, counting only gameweeks the player actually filed a pick in, has the metric reward absence: not picking raises your average, which directly contradicts "No pick, no points."

A player who joins mid-gameweek — after that gameweek's first tipped kickoff — starts counting from the next gameweek, so an unavoidable zero is never charged to them.

Rendered as the secondary number beneath the season total, one decimal, e.g. `5.2 / week`. It is a de-burying device, not a headline; it never becomes the sort key.

### D4 — Row content, in phone-width order

Rank · movement · emoji + display name · season points (with per-week beneath) — five fields, sized to hold a 20-character display name without truncation.

Deliberately **not** carrying last gameweek's score: the Pick Board's last-week strip already tells a player their own recent points, and a sixth field pushes phone width for texture rather than information.

**Amended 2026-08-16** — see D10 and D11. Two derived counts (exact tips, correct results) join the row, carried by the matchday-program card shape, which has vertical room a table row doesn't. Last gameweek's score stays out.

### D5 — Everyone is ranked inline; ineligibility is a per-row treatment, not a section

**Amended 2026-08-16: on the season leaderboard, only Bots are ineligible.** A Late Joiner can now win the season title (`CLAUDE.md` → _Late joiners_), because joining late is a handicap rather than an advantage — fewer scored gameweeks means a lower cumulative total, so the points already do what the rule was doing, and the rule cost an explanation for nothing. A Late Joiner therefore renders as an ordinary row here, with no tag and no de-emphasis. The ineligibility grammar below still ships, applied to Bots; it is also what the **Predict the Table** leaderboard will need, where a Late Joiner _does_ stay ineligible (submitting a table after results exist is a real information advantage — the same reason Bold Calls already exclude them in both directions).

Bots sit in their true list position by points, rendered at reduced emphasis with a short tag — though **they carry no rank numeral at all, see D12**. One list means one definition of "rank" — the same one the Pick Board's stats strip shows, per D2. (Note this is _not_ the basis `standings_snapshots.season_standing` uses, which ranks Bots alongside humans by design (#23 D3) and stays that way; see D12 for why the two legitimately differ and how movement bridges them.)

The rejected two-section split — eligible field, then ineligible below — makes a bot beating half the field invisible, which `CONTEXT.md` treats as the interesting fact of the season, and creates two competing rank scales to explain to a 10-year-old.

**#24 builds the grammar and applies it to Bots.** #32 — which existed solely to exclude a Late Joiner from the season title — is **obsoleted for the season leaderboard** by the amendment above; what survives of it is the Predict the Table ineligibility, which belongs to that leaderboard's own issue. The predicate ("joined after Gameweek 1's first Tipped Match kickoff") is still computable from existing data with no column, and is still needed there.

Note the per-gameweek-played column (D3) now matters _more_, not less: with a Late Joiner actually able to win, normalising their total is the difference between a fair read and a misleading one.

### D6 — The Median Bot gets no special treatment beyond the bot tag

`CONTEXT.md`'s "a bar to clear rather than a rival to beat" is not implemented as a distinct visual — a divider-styled benchmark row and a pinned "you're 6 ahead of the crowd" strip were both considered and rejected for now. With bots ineligible and clearly tagged, a player reading the list already sees whether they are above or below the Median Bot; a bespoke treatment is a second thing to design, explain in `/how-it-works`, and keep correct, in exchange for emphasis the ordering already delivers. Revisit once there's a season of real data showing where players actually land relative to it.

`CONTEXT.md`'s Median Bot Benchmark entry should be softened to describe what the leaderboard actually does rather than promising a treatment that isn't built.

### D7 — Own-row emphasis and the accent budget

The signed-in player's row carries a "You" badge; the 1st-place row carries the accent tint. Both are already-sanctioned accent uses in `docs/DESIGN_SYSTEM.md` — the leaderboard does not introduce a third. When the signed-in player _is_ 1st, the two treatments coexist on one row rather than one suppressing the other.

**Amended 2026-08-16 — own-row findability is a solid accent stripe on the card's left edge.** The signed-in player's row needs to be findable by colour before any word is read, which a text badge can't do while scanning sixteen rows. An earlier pass put that colour on the **emoji chip** (tint plus ring) and was rejected: the emoji is the one element a player chose for themselves, and recolouring it puts the app's palette on top of their identity — the chip reads as a system state rather than as them. The stripe is the same signal moved to a surface the app owns. It's an extension of the palette's existing "You badge" accent use, not a fourth spot, carrying the one meaning _this row is you_. It survives the 1st-place collision without a ring, since the row tint is 20% accent and the stripe is 100%.

### D8 — Day one drops numbers rather than showing zeros

Before the competition's first scored match, the leaderboard shows the roster with **no ranks, no points and no per-week column** — names and emoji only, alphabetical, under a kid-friendly line explaining that points start after the first results. This mirrors ADR 0007's day-one variant for the Pick Board ("the stats strip drops rank and points"), and it reverts automatically the moment scores exist.

A tab that renders a table of twenty identical zeros teaches a player the leaderboard is broken. A tab that renders nothing at all teaches them it's empty. Showing who's playing does neither.

### D9 — Composition is a pure module; the route stays a thin reader

A new pure `src/lib/leaderboard/` module composes roster + score rows + previous-gameweek snapshot + scored-gameweek list into the rendered row list, reusing `rankScores` and `foldCompetitionScores` rather than reimplementing either. It lands under `src/lib/**`, so it draws CODEOWNERS review and the critical-module test bar (`docs/standards/TESTING_STANDARD.md` §1a: golden values, test-first).

Serial Supabase depth on the route is **3**: `seasonId` → current gameweek number → one parallel wave of (scoped scores, previous-gameweek snapshot, scored-gameweek kickoff list). The first two are genuinely sequential — the gameweek resolver takes `seasonId` as an argument — and match the Pick Board route's existing shape (`docs/standards/PERFORMANCE_TESTING_STANDARD.md` §4.1).

### D10 — Exact tips and correct results are shown, and cost nothing to derive

Each row also carries **exact tips** and **correct results**. Neither needs a schema change, a new column or a new query, because the additive formula's reachable score set is `{0, 1, 3, 4, 5, 7}` (`docs/adr/0009`):

- **Exact tip** ⟺ `points = 7`. Seven is only reachable by taking result, goal difference _and_ both team scores — and those four together **are** the exact scoreline.
- **Correct result** ⟺ `points >= 3`. Every term except Wrong Way Round (+1) requires the result to be right, and Wrong Way Round is mutually exclusive with all of them by construction.

Both are therefore counted inside the iteration `foldCompetitionScores` (`src/lib/competitions/scope.ts`) already performs to sum points. This is a change to a CODEOWNERS-gated module and inherits `docs/standards/TESTING_STANDARD.md` §1a's golden-value bar — including a case pinning the `points >= 3` and `points = 7` predicates to the reachable set, so a future scoring change that adds a reachable value can't silently corrupt both counts.

Correct results renders **against matches scored** (`12/16`), not as a bare count: a bare count reads as a second ranking the same way the per-week number can, and a Late Joiner's `5` means something very different from an on-time player's `5`.

**Amended 2026-08-16**: these two are the first stats in the panel, not the last. D11's tap-to-open placement was chosen specifically so the panel can take further stats later without the closed list paying for them in height — that extensibility is now a stated requirement of the design, not an accident of it.

The bound that still holds: the panel is a **player's record against their own picks** (counts and averages derived from the `scores` ledger), never a trend, chart, streak or head-to-head. Those are the analytics pages `CLAUDE.md` puts explicitly out of scope, and the per-match detail behind any of it is `/gameweek/[n]`'s job. A stat that can't be computed by folding the score rows this route already reads is the signal that the line has been crossed.

### D11 — The row is a matchday-program card, not a table row

Chosen by prototyping three structurally different directions against real app chrome and a realistic 16-player mid-season roster — a dense league table (A), a matchday-program card list (B), and a proportional-bar ladder (C). See _Prototype_ below.

**B wins.** The leaderboard is a roster of ~16 people opened a few times a week, not a dataset scanned under time pressure, and the card shape is what the rest of the app is already built from (`docs/DESIGN_SYSTEM.md` → _Card anatomy_) — so it inherits the lift-shadow depth and the sanctioned accent treatments instead of inventing a leaderboard-specific visual language. Its vertical room is also what makes D10's counts possible at all; the extra detail is a consequence of the shape, not the reason it was picked.

**Final form: variant T, "Tightened."** After B3 won the direction, three finals were built on it — T (tightened), P (podium block for the top three), S (ink spine down each card's left edge). **T wins**: it's the same card with the refinements below and no new structure.

**Movement lives in the rank column**, stacked under the numeral, not on the name line. Rank and how that rank changed are one fact and now read as one unit; it also frees the name line entirely, which was the only place a 20-character display name could collide with the You or Bot badge. It costs no height — the stacked pair fits inside the avatar's own 36px.

**Placement of D10's counts: tap to open.** Of the three placements prototyped (`?variant=B` baseline, `B2` always-visible stat line, `B3` tap-to-open panel), B3 wins — chosen for extensibility rather than tidiness. An always-visible stat line charges every card permanent height for numbers most players glance at rarely, and it caps at whatever fits; a panel behind a tap keeps the closed list as scannable as a table row **and** leaves somewhere for further stats to go (see D10's amendment). One card is open at a time, so the list never doubles in height.

**Card density is a first-class constraint, not a polish pass.** The first B3 pass stacked name-then-badges on the left and points-then-per-week on the right, making every card two rows tall in both columns — ~120px for five short values, six cards visible on a phone. The shipped shape puts the entire left column on one line (name, You badge, ineligible tag and movement inline) and pairs the total with a tighter per-week caption on the right, roughly halving card height. A leaderboard whose whole job is comparing players fails if it can only show six of them; if a future addition can't fit on one line per column, it belongs in the tap panel, not on the closed card.

**This resolves the open question in `docs/DESIGN_SYSTEM.md` → _Icons_** — "whether a player's emoji renders inline next to their name or inside a small coloured circle chip (mini-avatar treatment) is undecided — resolve when the leaderboard/login screens are actually built". Variants A and B were built to disagree on exactly this. **The circle chip wins**, as part of B. That doc should be updated to record it, and the login list should follow rather than diverge.

### D12 — Bots are ranked past, not ranked

**A Bot displays no rank numeral and no movement**, and — the part that matters — **rank is computed over humans only**. With Bots removed from the ranking, Sophie is 1st and the player behind the Median Bot is 2nd, not 3rd.

The rank column stays reserved on a Bot's row so every row still aligns, and **carries the label `BOT`** rather than sitting empty. That retires the separate "Bot" chip from the name line: one mark instead of two, placed in the column whose entire job is "where does this player stand" — saying, in the only place a player looks for that answer, that this one doesn't stand anywhere. It also gives the name line back to the name, which is what D11's movement change was buying in the first place. The muted row treatment (D5) still applies underneath it.

The ineligibility **chip** grammar isn't dead — it's simply unused on this board now that Bots are the only ineligible entrants and the column says so. The **Predict the Table** leaderboard still needs it, for a Late Joiner sitting at a real rank that they can't win from (D5).

The reasoning is that a player mentally discounts Bots the moment they see them: Bots can't win the season title (`docs/adr/0009`), so a rank that counts them answers a question nobody asks. The alternative — keep the ranking Bot-inclusive and merely hide the numeral — is worse than either honest option, because it leaves visible gaps (1, then blank, then 3) that read as a rendering fault rather than a deliberate exclusion.

This is a genuine semantic change, not a display tweak, and it forces two things that would otherwise silently break:

- **The Pick Board's stats strip must switch to the same basis.** `loadSeasonStats` (`src/app/_lib/pick-board-access.ts`) currently ranks over every player including Bots. Leaving it would violate D2's invariant that the two surfaces can never show one player two different ranks on the same day — the exact trust bug D2 exists to prevent. This lands inside #24 by necessity, even though it edits the Pick Board.
- **Movement can no longer read `standings_snapshots.season_standing` directly.** That column is Bot-inclusive by design (#23 D3) and stays that way — it's a full-roster record and correct for its own purpose. The leaderboard instead re-ranks the previous gameweek's stored `season_total` values on the same humans-only basis, and diffs against that. Comparing a humans-only live rank against a Bot-inclusive stored rank would produce plausible-looking but wrong arrows — off by one for every player below a Bot, which is most of them.

Deriving movement from `season_total` rather than `season_standing` is also the more robust shape independent of this decision: it makes the arrow immune to any future change in how the snapshot defines its own ranking.

The **Median Bot still needs no special treatment** (D6) — it keeps its position in the list by points, so "am I above or below the crowd's consensus?" is still answerable at a glance. It simply has no number beside it.

### D13 — The Predict the Table segment reuses the row, and diverges in exactly three places

Prototyped as the second segment (`src/app/dev/leaderboard-prototype/TableBoard.tsx`) to check D1's bet that one route with two segments is worth it. It holds: same card, same rank column, same tap-to-open panel, same own-row accent stripe. Points become `152/200` and the three panel stats become **Placement / Bands / Bold calls** — the components the score is already made of (`docs/adr/0010`), so the panel needs no new derivation.

Three divergences, all structural rather than cosmetic:

**No Bots.** Bots predict scorelines — Random, 1-1, Median — and nothing in the spec gives them a Table Prediction. The roster is humans only, so the "can't win" slot D12 created is free for a different occupant.

**A Late Joiner is ineligible here, and is rendered exactly as a Bot is on the season board**: no rank numeral, the reserved column carrying `LATE`, the muted row treatment, real score and real list position intact. This applies D12's principle uniformly — _the rank column answers "can you win, and where do you stand"_, so an entrant who can't win is ranked past rather than ranked. The prototype's fixture deliberately puts the Late Joiner **top of the board on 152 with the leader on 148**, because that's the case the rule has to survive; the answer is that the board shows no rank-1 collision at all, and the eligible leader is unambiguously `1`. Accepted as slightly harsher than D5's original "everyone ranked inline" wording, and consciously so: a Late Joiner here is not being penalised for being late, they are being excluded from a title they had an information advantage on. Their score is still shown in full.

**No movement, and it cannot be added by this work.** Season movement exists because `standings_snapshots` records a previous `season_total` to diff against. **Nothing stores Table Prediction score history** — the score is recomputed continuously against live standings and never written down — so there is no previous value, and the rank column carries no arrow on this segment. This is a permanent asymmetry between the two boards unless a per-gameweek Table Prediction snapshot is added, which is a new store and a new writer, not a display change. Deferred rather than filed: it's only worth building if the arrows are actually wanted, and a season of use will answer that better than a guess now.

## Prototype

`src/app/dev/leaderboard-prototype/` — throwaway, dev-only, not linked from nav (same convention as `src/app/dev/tipped-match-card/`). Variants switch on `?variant=`; a **Day one** toggle on the floating switcher renders D8's empty state for whichever variant is showing. The winning variant `T` also carries the live segmented control, with `TableBoard.tsx` as the second segment (D13) — shown there to prove the shared row grammar, though the real route ships without it until #157. The fixture is hand-built because #166 hasn't populated `scores` or `standings_snapshots` anywhere yet, and deliberately loads the cases that break a leaderboard design: a rank tie (skip ranking shares a place, then the next distinct value skips ahead by the tie count), three ineligible rows spread through the table rather than clustered, the Median Bot sitting **above** the signed-in player, and a Late Joiner whose 8.0/week is the best per-week figure on the board while she sits 13th.

Per the prototype skill, this directory is a primary source and does not survive into `main`: once the real route lands it moves to a throwaway branch, with the branch name recorded on #24.

## Considered and rejected

- **Building the Predict the Table leaderboard inside #24** — rejected: it would pull in #157's blocked dependency and stop #24 being shippable on its own.
- **Two separate leaderboard routes** — rejected: a fourth tab slot for a once-a-season view, with duplicated row and rank grammar.
- **Denominator = gameweeks with a pick filed** — rejected: rewards not picking (D3).
- **Median Bot as a divider row, or as a pinned benchmark strip** — rejected for now (D6).
- **Two sections, eligible above ineligible** — rejected (D5).
- **Rank read straight from the latest `standings_snapshots` row** — rejected: cheaper, but goes stale against the Pick Board's live stats strip between snapshots, and D2's movement needs live rank anyway.
- **A per-row expansion showing a player's gameweek-by-gameweek history** — rejected as the leading edge of the analytics pages `CLAUDE.md` puts explicitly out of scope; per-match detail is `/gameweek/[n]`'s job. (Distinct from D10's three fixed counts, and from the tap-to-open _placement_ of those counts, which is still open below.)
- **Variant A, the dense league table** — the most scannable option and the closest to how a football table is normally read, but it reads as a spreadsheet at this app's tone, has no room for D10's counts, and would have been the app's only screen not built from cards.
- **Variant P, the podium** — top three broken out into a 2-1-3 block above the list. Rejected on two counts. `docs/DESIGN_SYSTEM.md` → _Motion_ tiers celebration deliberately, reserving the fuller moment for the once-a-season winner reveal; a permanent podium spends that budget every week and leaves nothing for the end. It also handles ties badly — it must either pick between equal totals (wrong) or share a plinth (built, and workable at two, awkward at three).
- **Variant S, the ink spine** — a dark ink block down each card's left edge carrying rank and movement in reverse-out type, using the `CardShell` ink-as-surface grammar so the leaderboard reads as _this_ app's. Rejected because ink at sixteen-rows-in-a-column frequency stops being an accent and becomes the page. It also surfaced a real constraint worth recording: **`success`/`danger` don't clear the contrast floor on an ink ground**, so movement on a spine can only be carried by the ▲/▼ glyph, breaking the palette rule that rank movement always reuses those two colours. Movement on a light ground (T) keeps both the glyph and the colour.
- **Variant C, the proportional-bar ladder** — showed point _gaps_ rather than just order, which is arguably the more useful truth in a 76-match season. Rejected as a whole-page treatment: it spends the horizontal budget on a bar, leaving names and numbers cramped, and its bars compete with the accent budget. The gap idea is worth revisiting as a single line of copy on the signed-in player's own row ("12 behind the top"), which needs no bars at all.

## Deferred, not settled here

- **The Predict the Table segment** — designed in D13 and prototyped, but not built by #24: it needs #157 (live Table Prediction scoring) first. Filed separately.
- **Table Prediction score history**, and therefore movement arrows on that segment — see D13. Not filed; build only if the arrows turn out to be wanted.
- **A "12 behind the top" line on the signed-in player's own row** — the one idea worth salvaging from Variant C, deliberately not folded in now so B's shape is judged on its own first.
- **Season Winner presentation** at season end (a crown, a locked final standing) — nothing in the spec describes it and the season has 38 gameweeks to run.
- **Median Bot benchmark emphasis** — revisit with a season of real data (D6).
- **Whether the leaderboard needs its own `/how-it-works` anchor** for the per-week column — `docs/in-app-help-spec.md` §4 already reserves a sentence for it, conditional on this column existing. It now will.
