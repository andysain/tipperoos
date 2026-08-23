# Match Centre: a tense on the Pick Board, not a destination

Issue #91 ("Match Centre: gameweek archive + post-lock pick reveal") assumed a standalone route and a fourth tab — `docs/adr/0012-leaderboard-view.md` D1 says so explicitly ("Match Centre (#91) is still owed a tab slot"), and `src/components/nav/tabs.ts` names it as a future entry. Planning it out surfaced two reframings that make both assumptions wrong, and neither is a visual preference: the first collapses the route, the second doubles the feature. Resolved in a planning session against the current codebase, 2026-08-18.

The first: **the Pick Board and the Match Centre are the same object at different tenses.** The Pick Board is primarily future (matches you can still pick), the Match Centre primarily present and past (matches that have locked). They share fixtures, gameweek grouping, card grammar and result rendering; what differs is when you are standing.

The second: **"what did everyone pick for this match" and "what did this player pick across matches" are the same dataset on two axes** — match-first and player-first. #91 only ever described the first. The second is a separate paradigm, not a view option, and it turns out `docs/adr/0012` already punted it here by name.

## Current state this builds on (verified, not assumed)

- **`picksForMatch`** (`src/lib/competitions/scope.ts:225`) — competition-scoped post-lock reveal that **enforces the lock itself rather than trusting its caller**, folding non-pickers in as null rows. `foldCompetitionPicks` and `isMatchLocked` likewise exist and are tested. The match axis needs no new read-path.
- **`resolveCurrentGameweekForCompetition`** (`src/app/_lib/gameweek-access.ts`) and the Pick Board's slot resolution — the current gameweek is derived per request, never an `is_current` column.
- **`matches.matchday`** (`supabase/migrations/20260817100000_matches_matchday.sql`) — persisted from the provider by #92, so "which fixtures belong to gameweek N" is a column, not an API call.
- **The leaderboard row's tap-to-open panel** (`docs/adr/0012` D11, `src/components/leaderboard/LeaderboardRowCard.tsx`) — chosen for extensibility specifically so "the panel can take further stats later" (0012:100). This is the player axis's entry point, already built.
- **`docs/adr/0007-home-surface-and-pick-entry.md`** — the home surface shows a player their own pick and their own outcome only; the reveal "lives in Match Centre, not here". `src/components/pick-board/TippedMatchCard.tsx:582` carries the stubbed-out "see everyone's picks" link waiting on this issue.
- **`docs/DESIGN_SYSTEM.md` → _Match Centre structure_** — grouped by gameweek, collapsible, explicitly replacing the old app's single undifferentiated scroll.
- **No audit-trail store exists.** `matches` has `result_updated_at` but no `updated_by`, and there is no edit-history table. #31 additionally depends on #14 (admin override UI), which does not exist.

Nothing here needs a migration.

## Decision

### D1 — Match Centre is a tense, not a destination

There is no `/match-centre` route and no fourth tab. `TABS` stays at three (`Pick Board`, `Leaderboard`, `Predict the Table`); `tabs.ts`'s comment naming #91 as a future tab is corrected rather than acted on, and `docs/adr/0012` D1's "still owed a tab slot" is superseded here.

The tab-slot assumption was the product of describing the feature by its old-app name rather than by what it does. Once the Pick Board and the Match Centre are the same object at different tenses, a separate destination is a second front door onto one surface — which is how the old app ended up with a page per noun.

This also settles the tab-width problem it would otherwise have caused: four `flex-1` items at 375px give each ~93px, and "Predict the Table" already strains the current ~125px. That relabel is now unnecessary rather than deferred.

### D2 — Route shape is the tense

| Route           | Tense            | Shows                                                                       |
| --------------- | ---------------- | --------------------------------------------------------------------------- |
| `/`             | future / present | current gameweek, **your** picks only — unchanged                           |
| `/gameweek/[n]` | present / past   | that gameweek's Tipped Matches, results, **everyone's** picks, audit trail  |
| `/gameweek`     | past             | the archive index: one collapsed row per gameweek, carrying **your** points |

The current gameweek is deliberately reachable at both: `/` for filing, `/gameweek/[n]` for the room. After lock, the settled slot on `/` links across — which is what `TippedMatchCard.tsx:582` has been waiting for.

`/gameweek` is `docs/DESIGN_SYSTEM.md` → _Match Centre structure_ unchanged: grouped by gameweek, collapsible, scaling to 38 rows on a phone. It hangs off the Pick Board as a "past gameweeks" affordance rather than off the tab bar.

**One open gameweek at a time, driven by the URL.** This is the grammar the app already established in `docs/adr/0011-predict-the-table-capture-v2.md` (zero or one open Band, headers as the only navigation), and it is what keeps the archive cheap: collapsed rows come from one aggregate read, and only the open gameweek loads picks. Server-rendered, no client fetch, and a deep link the post-result email (#30) can point at — that email is the highest-leverage retention lever in `CLAUDE.md` → _Notifications_, and "see how everyone tipped" wants a real URL.

### D3 — ADR 0007's home-surface rule survives intact, and this is why

`docs/adr/0007` makes pre-lock secrecy hold **by construction** on the home surface: `/` shows a player their own pick and their own outcome only, so there is no visibility rule for a bug to get wrong. Folding the reveal into the home slot card would destroy that property and replace it with a conditional — the exact trade `BUILD_PLAN.md` decision 42 was relieved not to have made at launch.

The reveal therefore lives on a **different route**, not a different tab. `/gameweek/[n]` is a distinct surface with a distinct loader; `/`'s loader keeps reading only the signed-in player's picks. "The reveal lives in Match Centre, not here" is satisfied by route separation, which is all it ever required.

### D4 — Tipped Matches only, never all 380 fixtures

`docs/FRONTEND_BRIEFING.md:59` says Match Centre "shows fixtures/results", which reads as the full season. `docs/DESIGN_SYSTEM.md` resolves it to the gameweek's two Tipped Matches (or one, if a slot was skipped), and that wins: an untipped fixture carries no picks, no points and no reason to be here. Rendering 380 rows would reproduce the old app's undifferentiated scroll under a new name.

A Skipped Slot and a Voided Match still render, with their distinct states (`CONTEXT.md` — these are different things and need different empty states, not a generic "cancelled"). Those card states are undrawn and owned by #33.

### D5 — The reveal fires at lock, and there are two post-lock states, not three

Picks lock five minutes before kickoff, so there is a window where every scoreline is visible and no result exists — the most dramatic moment in the weekly loop, and the one an archive-shaped design would waste.

**Amended 2026-08-19.** This originally named three post-lock phases including "in progress". That state cannot be reached: `mapProviderStatus` (`src/lib/matches/map-matches.ts:55`) maps `IN_PLAY` and `PAUSED` to `scheduled` and writes scores only on `FINISHED`, and `PickBoardSlotCard.tsx:15` records the consequence — _"live is intentionally never produced by this mapping today."_ Live scores would need a paid provider tier. **Two states: revealed (picks visible, no result) → finished (result and points).**

**A gameweek, however, is routinely half-played** — the two tipped matches often kick off a day apart, so one can be final while the other is still to come. That is a first-class state on every surface: the finished card shows the result with the player's own pick moved beneath the seam, the other still shows their pick, and any total for that week is rendered `N pts so far`.

The consequence for framing: `/gameweek/[n]` for the current gameweek is a live room that later becomes history, not a history page with a live corner.

### D6 — There is no pre-lock filed list — withdrawn

**Withdrawn 2026-08-19.** This originally specified a named who-has-and-hasn't-filed list before lock. Prototyped and cut. No version of it earned its place: naming people reads as pressure on a family competition, a bare count is noise, and the thing that actually makes a player pick is the empty entry card already in front of them — the list was restating the card's own existence in worse words.

Cutting it also removes the Median Bot problem the rule was written to handle, and it removes a surface with no entry point: pre-lock there is no link from `/` to `/gameweek/[n]`, because there is nothing behind it yet.

**A gameweek page exists only once its matches have locked.** Before that, the Pick Board is the whole story.

### D7 — Two axes, each hanging off the surface whose primary object it already is

| Surface         | is a list of… | tapping an item gives…             |
| --------------- | ------------- | ---------------------------------- |
| `/gameweek/[n]` | matches       | everyone's picks for that match    |
| `/leaderboard`  | players       | that player's picks across matches |

Match-first off the board, player-first off the leaderboard. Neither needs a destination of its own, which is what makes D1 affordable rather than merely tidy.

`docs/adr/0012` rejected "a per-row expansion showing a player's gameweek-by-gameweek history" as out-of-scope analytics **and pointed at #91** ("per-match detail is Match Centre's job"). That handoff is honoured here: the player axis is legitimate, it is a picks record rather than a trend, and its entry point is the panel 0012 D11 already built and explicitly sized to grow.

### D8 — The player axis is a follow-up issue; the archive row is built for it now

#91 ships the match axis. The player axis is filed separately: it needs a new read-path helper (D10) that the match axis does not, and splitting keeps #91 shippable.

**One thing must be built for it now.** The archive index row (gameweek, its matches, points) and the player record row (gameweek, that player's scorelines, points) are the same component with one parameter swapped — _whose_ points. If #91's row hardcodes "the signed-in player" rather than taking a player as an argument, the follow-up pays to unpick it. Take the parameter now even though only one caller passes it.

### D9 — The player axis is a picks record, not a profile

`CLAUDE.md` bans public profiles. The boundary: **emoji, display name, picks, points** — every one of which is already public on the leaderboard — and nothing else. No bio, no join date framing, no "about", no charts, no streaks, no head-to-head. It is a list.

Route: **`/picks/[playerId]`**. It names the object, not the person, which `/player/[id]` does not — a small thing that keeps the surface honest about what it is as future work touches it.

Two things fall out for free and are worth recording as intent rather than accident: tapping **your own** row gives you your own season of picks, quietly restoring the old app's "My Predictions" screen without designing one; and tapping the **Median Bot** gives the season's crowd consensus, making concrete the benchmark line `CONTEXT.md` → _Median Bot Benchmark_ describes.

### D10 — `picksForPlayer` self-enforces the lock; a picks-by-player read is forbidden

This is the single highest-risk line in the feature. "Show me everything Andy picked" has an obvious formulation — `select … from picks where player_id = …` — that **bypasses the per-match lock check entirely** and leaks live, unlocked picks. It is precisely the failure `picksForMatch` was written to make impossible, and the player axis is the one shape in the app that routes around it.

The helper resolves the set of **already-locked** Tipped Matches first, then reads picks within it. It lives in `src/lib/competitions/scope.ts` beside its sibling, carries the same "cannot leave that one line optional" doc comment, and enforces the lock itself rather than trusting its caller. Issue #17's done-when (a second player cannot see another's pick pre-lock via any route, including direct API calls) applies to it identically.

### D11 — Season scoping is a parameter, not a constant

Both axes scope to the **current season** and expose no season selector. But `season_id` is carried through the query shape and defaults to current, rather than being assumed — so a future "look at last season" is a parameter change rather than a rewrite. No UI, no design work, no speculative surface.

Competition scoping follows `AGENTS.md` unchanged: `matches` carries no `competition_id`, so every read here joins through `players.competition_id` or `gameweeks.competition_id`.

### D12 — #31's audit trail gets a reserved slot, not an implementation

The match-result audit trail cannot ship with #91: there is no audit store, and #31 depends on #14 (admin override UI), which does not exist. What #91 owes it is a **defined place on the match card** for "Result corrected 21 Aug, 9:14pm" — so #31 becomes a migration plus a row rather than a redesign of a card that never anticipated it.

`CLAUDE.md` → _Trust, fairness, and admin integrity_ calls this visible-not-buried, and `docs/FRONTEND_BRIEFING.md:59` calls it a trust feature. Reserving the slot is how that survives the route dissolving.

### D13 — The reveal is a cluster list, ordered correct-first

Identical scorelines collapse into one row, so ~16 players read as ~5. Chosen over a home × away score grid and a one-row-per-player points ladder (all three prototyped). Ordered **correct-first, then by crowd size** — before a result exists it falls through to crowd size on its own, so the list reshuffles exactly once, when the result lands.

Within a cluster: **you first**, then people alphabetically, then bots. The row containing your pick carries the accent left-edge stripe — the same treatment, for the same reason, as `docs/adr/0012` D7's own-row findability, and inside the accent budget because that row _is_ your own predicted scoreline.

Non-pickers get **one warm sentence** (`No pick from Finn this week.`), not a wall of avatars under a "NO PICK" heading. ADR 0013 D6 sanctioned naming non-filers _pre-lock_, where a nudge has an action attached; this is the permanent, deep-linked archive, where the same list is only a monument to a kid missing a week. Bots and players who hadn't joined never appear in it.

### D14 — The archive is a control, not a page

There is no `/gameweek` index. **This supersedes D2's route table**, which listed one. A horizontally scrollable strip of gameweek chips — each carrying the viewer's points for that week — sits at the top of `/gameweek/[n]` and does everything an index would, as a header rather than a destination. Month dividers give it landmarks; step controls live at the **bottom** of the page, where reading ends, rather than competing with the strip for width at the top.

The same control is reused on `/picks/[playerId]` as a scroll-to-week jump, parameterised by player. Two jobs, two controls, no overlap: the week heading's chevron opens the reveal; the strip moves you down the page.

### D15 — Home's summary is a recap and a ladder, both doors

Two blocks at the top of `/`:

**The recap** — one gameweek: its total, and per match the player's own pick, the result, and what it scored. The detail is load-bearing, not decorative: by the time a player next opens the app the Pick Board has advanced to the next gameweek, so this is the **only** place their pick for the finished week still exists. It renders `PicksTable`, the same grammar as the season record — one design at two lengths, so the player learns it once.

**The ladder** — the two players either side of the viewer, rather than a bare rank. "Where does that leave me" is a comparative question in a family competition. `docs/adr/0012` deferred exactly this ("12 behind the top") rather than rejecting it. Always three rows, wherever the viewer sits.

**Amended 2026-08-21: no gap column.** This originally specified the gap written in words (`12 behind`, `level`). Built, seen on a real device, and cut: three ranked rows sitting next to each other already answer the comparative question, and on day one — with everyone on nothing — every row read `level`, which is noise dressed as information. The ladder also now hides entirely before the first scored match, matching the day-one rule `/leaderboard` already followed (`CLAUDE.md` → _Home surface_).

Both are tappable at the **heading only** — the rows inside are inert, so a scroll ending in a slight tap can't navigate away.

**Ordering.** The summary sits above the picks. Recorded honestly: a review measured that this pushes the second match card's entry controls to roughly y 850–990 on a pre-lock phone visit, against ADR 0007's cost-of-missing logic. It is a deliberate call made with the alternative on screen, and it is worth re-measuring on a real device once built.

### D16 — Absence, zero, not-yet and called-off are four different renderings

`CLAUDE.md`'s "No pick, no points" and `docs/adr/0012` D3 both work to stop absence reading as poor form, and a single muted dash undid it. Across every surface:

| Fact                          | Rendering                                                          |
| ----------------------------- | ------------------------------------------------------------------ |
| You didn't pick               | the words `no pick`, never a dash                                  |
| You picked and scored nothing | `0`                                                                |
| Not played yet                | blank                                                              |
| Called off (Voided Match)     | `off` in the row, `Called off` on the chip, `warning` not `danger` |

A week's heading distinguishes the same four: `N pts` / `N pts so far` / `You missed this one` / `Not scored yet` / `Called off`. The word **`void` is retired from player-facing copy** — one word for one thing, and a Voided Match is a neutral non-event for every player equally, which is not what red says to a ten-year-old.

A **Late Joiner's record begins at the gameweek they joined**, with one closing line (`Joined at Gameweek 13.`), rather than a dozen rows of failing to turn up.

## Considered and rejected

- **A fourth tab** (`docs/adr/0012` D1's assumption) — rejected by D1. It gives one object two front doors, and forces a relabel of the whole tab set to fit ~93px slots.
- **Swapping Predict the Table out of the tab bar for Match Centre** — genuinely tempting: #156's Table Prediction Strip already gives Predict the Table a permanent home-surface presence, and after 31 August its tab leads to a read-only page opened once more all season, while the Match Centre is weekly. Rejected on timing rather than merit — the Predict the Table deadline is ~two weeks out and its tab currently carries the "Next up" badge, so the swap would land at the worst possible moment; and a tab set that changes shape on a date is stateful navigation, against `docs/adr/0005`'s one-stable-pattern call. Moot under D1 anyway, and recorded because it is the better argument against the fourth tab than width is.
- **Contextual entry only, with no archive index** — rejected: past gameweeks would be reachable only by tunnelling through the current one, which is the orphaned-route failure `docs/adr/0005` exists to prevent.
- **Folding the reveal into the Pick Board's settled slot card** — rejected by D3. It converts a by-construction guarantee into a conditional.
- **A third segment on `/leaderboard`** — rejected: the existing two segments are both leaderboards, and a match archive is not one.
- **All 380 fixtures** — rejected by D4.
- **Showing the Median Bot as "hasn't filed" pre-lock** — rejected by D6: true to the data, false to the reader.
- **A `/player/[id]` route** — rejected by D9 in favour of `/picks/[playerId]`; the URL is the first place a picks record starts drifting into a profile.
- **A score grid and a points ladder** as reveal treatments — both prototyped, both beaten by clusters (D13).
- **A `/gameweek` archive index page** — replaced by the strip (D14). Reachable only by tunnelling from the current week, and a page whose only content is a list of links.
- **Predict the Table standings beside the tipping ladder** — built and cut. Two titles with two orders can't share a ladder, so it meant two ~185px ladders, and a once-a-season interest in weekly space.
- **"N agreed" on a picks record** — a cohort statistic on a surface D9 limits to emoji, name, picks and points, and a per-row read of every other player's picks on a route D2 keeps cheap. The week heading links to the reveal instead, which answers the same question with faces.
- **A pre-lock filed/not-filed list** — see D6, withdrawn.

## Prototype

`src/app/dev/match-centre-prototype/` — throwaway, dev-only, not linked from nav (same convention as `src/app/dev/tipped-match-card/`). Six passes, then three independent design reviews (consistency, ergonomics, comprehension) whose findings are implemented in it. Per the prototype skill it does not survive into `main`: it was removed from `feat/match-centre` before merge and preserved on the throwaway branch **`prototype/match-centre-design`**, which is the primary source for how these decisions were arrived at.

Its fixture is derived from a **single generator** and every score comes from the real `scoreMatch()`, after an earlier version had three independent generators disagreeing across surfaces. It carries the states that break these designs: a called-off match, a skipped slot, a week the viewer blanked, a half-played week, a Late Joiner, a Wrong Way Round pick, a rank tie, and the viewer deliberately mid-table.

## Deferred, not settled here

- **How a reveal actually looks** — the internal layout of "everyone's picks for this match" is deliberately left open. `docs/FRONTEND_BRIEFING.md:100` warns off the old app's "dense, cramped per-match comparison layout", so a flat 20-row player list is the one shape known to be wrong; grouping identical scorelines into clusters is one candidate among several, not a decision. This wants a prototype session against real gameweek-1 data, following `src/app/dev/tipped-match-card/` and `src/app/dev/leaderboard-prototype/` — dev-only, not linked from nav, not surviving into `main`. **Both axes are in scope for it**, not just the match axis.
- **Ordering within the reveal** — rank, alphabetical, or you-first. Part of the same prototype; rank ordering quietly turns every match into a mini-leaderboard, which may be more competitive than this app's tone wants.
- **The player axis itself** — filed as a follow-up to #91 per D8.
- **Skipped Slot and Voided Match card states** — undrawn, owned by #33.
- **The audit trail** — #31, per D12.
- **A season selector** — D11 keeps it cheap; nothing is designed for it.

## Consequences for existing docs

"Match Centre" survives as a **capability spread across surfaces**, not a page. That vocabulary shift has to be made explicit or the term rots into meaning a route that does not exist:

- `CLAUDE.md` — _Home surface_ and _Trust, fairness_ both reference the Match Centre as a place.
- `CONTEXT.md` — glossary entry.
- `docs/DESIGN_SYSTEM.md` → _Match Centre structure_ — the structure it describes is now `/gameweek`.
- `docs/FRONTEND_BRIEFING.md:59` — listed as a screen.
- `AGENTS.md:38` — cites "Match Centre pick-reveal" as a competition-scoping example; still true, now on two axes.
- `src/components/nav/tabs.ts:12` and `src/components/nav/shell-metrics.ts:9` — both name a future Match Centre tab / Match Centre modals.
- `docs/adr/0012-leaderboard-view.md` D1 — "Match Centre (#91) is still owed a tab slot" is superseded by D1 here.
