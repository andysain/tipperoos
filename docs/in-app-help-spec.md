# In-app help: scoring + mechanics explainer — implementation spec

Implementation shape for issue #125. Written to `ISSUE_STANDARD.md` §1 — assume the reader has the codebase and the cited sources, and nothing else from the conversation that produced this.

**Every point value in this feature is derived, never authored.** `CLAUDE.md` → _Scoring_ and → _Season-long feature: Predict the Table_ are the single authoritative source for the numbers. Do not copy a value into a component, a constant, a test fixture, or a copy string in a form that could drift — read it from `src/lib/scoring/**` where one exists, and from `CLAUDE.md` when writing prose. This spec deliberately contains no point values, per `ISSUE_STANDARD.md` §2 failure mode 6, which this codebase has hit twice.

---

## Current state — verified against the code, 2026-08-13

Exists:

- `src/components/nav/AppShell.tsx` — wraps every authenticated route, renders `SwitchPlayerButton` top-corner and `TabBar` bottom. Login is the only excluded route.
- `src/components/nav/tabs.ts` — two tabs (`/`, `/predict-table`). ADR 0005 is explicit that only real destinations get a tab.
- `src/components/pick-board/TippedMatchCard.tsx` — already renders a points chip for a settled slot, from a `points: number | null` prop. **This is the anchor for Surface 1**; it needs a disclosure added, not inventing.
- `src/app/_lib/pick-board-access.ts` — reads `points` per match from the `scores` table, own-player-scoped.
- `src/lib/scoring/predict-table.ts` — the full Predict the Table scoring engine, including per-component breakdown fields on its result (`placementScore`, `bandBonusScore`, `boldCallScore`, `boldCalls`).

Does not exist:

- **Any match-scoring engine.** `src/lib/scoring/match.ts` is unwritten (issue #21). The `scores` table and the points chip exist, so the chip renders whenever rows exist — but nothing populates them yet. Surface 1 is therefore built and tested against seeded `scores` rows, not against a live scoring run.
- **Any Predict the Table score surface.** Nothing under `src/app/predict-table/` renders a score, and no open issue covers building one (#23 is per-gameweek standings snapshots, #24 is the leaderboard — neither is this). See _Out of scope_.
- Any help route, help affordance, or explainer copy anywhere in the app.

---

## The three surfaces

| # | Surface | Where | Ships in this issue |
|---|---|---|---|
| 1 | Points breakdown | Settled slot on the Pick Board | Yes |
| 2 | Scoring summary expander | Pick Board and Predict the Table | Yes |
| 3 | "How it works" page | New route `/how-it-works` | Yes |
| — | Live table-score breakdown | Predict the Table | **No — blocked**, see _Out of scope_ |

---

## Surface 1 — points breakdown on a settled slot

A settled slot already collapses to a dark plate carrying the scoreline and the player's own points (`docs/adr/0007-home-surface-and-pick-entry.md`). The points chip becomes a disclosure that expands into the reasoning behind that number.

**Closed** is exactly today's card, plus an affordance indicating the chip expands.

**Open** adds one row per scoring term that fired, each naming the term in plain language, plus a footer link into Surface 3.

```
ARSENAL   2 - 0   CHELSEA
You said 2-1                         N pts  ⌄
─────────────────────────────────────────────
    Right winner                        +N
    Arsenal's score                     +N
    Margin — you said 1, it was 2        —
                          How points work →
```

Rules:

- **One row per term in the formula**, in the order `CLAUDE.md` → _Scoring_ lists them. A term that scored shows its value; a term that didn't shows a dash and, where it costs nothing to say, why. Never hide a term that didn't fire — the contrast is the explanation.
- **Wrong Way Round is named, not just scored.** It is the least self-evident rule in the game and the single friendliest thing the app can say to a player who otherwise blanked. When it fires it replaces the row list entirely with its own line and the two scorelines side by side.
- **A blank week gets a sentence, not a bare zero.** Roughly a third of gameweeks now score nothing for a given player — a deliberate consequence of `docs/adr/0009`, and the state this surface most needs to handle gracefully. State what they picked, what happened, and when the next one is.
- **A missing pick is its own state**, distinct from a wrong pick: say that no pick was filed, that it therefore scored nothing, and that picks are never filled in automatically. This is where `docs/adr/0007`'s "nothing is pre-filled" rule gets explained instead of discovered.
- Both slots can be in different states in the same week (ADR 0007 — a mixed-state board is the normal case), so every state must read correctly stacked above or below any other.

---

## Surface 2 — scoring summary expander

A collapsed, one-line affordance on both the Pick Board and Predict the Table, opening into a short plain-language summary of how *that page's* scoring works, ending in a link to Surface 3. It carries no player data, so it renders identically for every player and needs no new data fetch.

- On the **Pick Board** it summarises weekly pick scoring.
- On **Predict the Table** it summarises Bands, the three scoring components, and what makes a Bold Call bold.

Rules:

- **Collapsed by default, on every visit.** Do not persist an open/closed state — this is reference material a player dips into, not a setting.
- **Summary, not duplication.** It should answer "roughly how does this work?" in a few lines and hand off. If it grows past a screenful it has become Surface 3 in the wrong place.
- Place it below the primary content on each page, not above it — it must never push the week's actual picks or the Bands board down the screen.
- Both instances derive their numbers from the same source as Surface 3; do not author two copies of the ladder.

---

## Surface 3 — the "How it works" page

New authenticated route `/how-it-works`, wrapped by `AppShell` like every other authenticated page.

**Entry points:**

- A persistent **?** affordance in the top corner beside `SwitchPlayerButton`, on every authenticated page. This is deliberately *not* a tab: ADR 0005 admits only real destinations to the tab bar, and Leaderboard (#24) and Match Centre (#91) are still to land there. `SwitchPlayerButton` is the precedent for a persistent, top-corner, non-destination affordance — follow its placement and sizing rather than inventing a new slot.
- The footer link on Surface 1 and Surface 2, deep-linking to the relevant section rather than the top of the page.

**Authentication:** the page requires a session, like every route except `/login`. A visitor cannot read it before joining.

**Sections, in the order a player's questions actually arrive:**

1. **Your week** — two matches, chosen automatically, why those two, and when picks close. Derive from `CLAUDE.md` → _Core weekly mechanic_ and `docs/adr/0006`.
2. **How your pick scores** — the ladder, shown as worked examples rather than a formula. Derive from `CLAUDE.md` → _Scoring_.
3. **Wrong Way Round** — its own section. Nobody guesses this rule.
4. **If you don't pick** — no points, never auto-filled, and what the leaderboard's points-per-gameweek-played column is for. Derive from `CLAUDE.md` → _Scoring_ and `docs/adr/0009`.
5. **Predict the Table** — the seven Bands, the three components, and what makes a Bold Call bold. Derive from `CLAUDE.md` → _Season-long feature: Predict the Table_ and `docs/adr/0010`.
6. **Who wins** — the season winner is always a person; bots play for fun; the Median Bot is a benchmark line to beat. Derive from `CLAUDE.md` → _Identity and auth_.

---

## Copy rules

- Second person, short sentences, written for a reader of about ten. `CLAUDE.md`'s kid-friendly constraint is a hard requirement, not a preference.
- **No formula ever appears in player-facing copy.** Every rule is shown as a worked example with a real scoreline. This is both the kid-friendly requirement and the cheapest structural guard against the numbers drifting out of sync with `CLAUDE.md` again.
- Banned vocabulary per `CLAUDE.md`'s no-gambling constraint: `bet`, `odds`, `wager`, `stake`, `payout`, `bookie`. Use `prediction`, `pick`, `points`, `leaderboard`, `competition`.
- Use the `CONTEXT.md` glossary's terms exactly — Tipped Match, Table Band, Band Bonus, Bold Call, Wrong Way Round — and its `_Avoid_` notes.

## Design constraints

- `docs/DESIGN_SYSTEM.md` applies throughout. Two findings from ADR 0007 bear directly on this work: **`accent` on white measures 2.05:1** and fails large-text AA, so it cannot carry explanatory text on a light ground; and club colour needs a contrast floor wherever it appears.
- Disclosures must be real buttons with correct `aria-expanded`/`aria-controls`, operable by keyboard, and must not shift the content above them when they open.
- Mobile-first at every breakpoint — the tab bar is used at all sizes (ADR 0005), so there is no desktop-only layout to design.

---

## Out of scope

- **The live Predict the Table score breakdown** — the hint showing a player's actual Placement / Band Bonus / Bold Call split. `src/lib/scoring/predict-table.ts` already returns every field it needs, but **no surface renders a table score at all**, and no open issue covers building one. Blocked, and per `ISSUE_STANDARD.md` §3 it does not belong in this issue's done-when. File the score-surface issue first, then a follow-up for the breakdown, and add `Depends on #N` there. Surface 2 covers Predict the Table in the meantime, since it needs no player data.
- **Star Match** — deferred in `docs/adr/0009`. Do not document or hint at it.
- **The leaderboard's points-per-gameweek-played column** — a leaderboard change (#24), not an explainer change. Section 4 explains it only if it exists by then; if it doesn't, drop that sentence rather than describing something a player can't see.
- Any change to scoring logic. This issue exposes what `CLAUDE.md` already defines.

---

## Done when

1. A player can reach `/how-it-works` from the top-corner affordance on both the Pick Board and Predict the Table, and it renders all six sections in kid-friendly language with no formula and no banned vocabulary.
2. The scoring summary expander renders collapsed by default on both the Pick Board and Predict the Table, opens on tap, and links to the relevant section of `/how-it-works`.
3. A settled slot's points chip expands to a per-term breakdown, and renders correctly in each of these states: a scoring pick, a Wrong Way Round, a zero-scoring pick, and no pick filed.
4. `/how-it-works` redirects to `/login` without a session.

## Verification

- **Committed tests** for the breakdown's state selection — which rows appear for a given pick and result. This is the only part with real branching logic, and where a wrong answer would be invisible.
  **Put this logic and its tests beside the component, not in `src/lib/**`.** `.github/workflows/ci.yml` runs a critical-module guard over `src/lib/**` enforcing the golden-value, test-first discipline of `TESTING_STANDARD.md` §1a — that exists for consequence-critical modules like the scoring engines, and this is presentation logic deciding which rows to render. Putting it there would subject copy decisions to scoring-engine ceremony and blur what the guard is for.
- **Manual, on the deployed Preview URL**, for everything else: the four Surface-1 states (seed `scores` rows directly against staging, since no match-scoring engine exists to produce them yet), both expanders, the six sections, and the unauthenticated redirect.
- Full validation sequence per `TESTING_STANDARD.md` §3: `npm run typecheck && npm run lint && npm run test && npm run build`.
- `TESTING_STANDARD.md` §4 applies: if anything here changes product behaviour or vocabulary, `CLAUDE.md`/`CONTEXT.md` are updated in the same change, not as a follow-up.

## Context you won't get from the codebase

Things that are true but not discoverable by reading the repo, and that change how this work should be approached.

### The season starts 2026-08-21 — and no player can see Surface 1 until well after that

This spec was written on 2026-08-13, eight days out. `BUILD_PLAN.md` decision 42 defines a deliberately narrow minimum launch: log in, land on the Pick Board, file a scoreline that a server-side lock enforces. **Scoring is explicitly sequenced behind launch**, so:

- **Surface 1 cannot be seen by any player at launch, or for some time after.** It needs a settled slot with points, which needs both the match-scoring engine (#21, unwritten) and a completed Gameweek. It is the most interesting part of this work and the least urgent.
- **Surfaces 2 and 3 are the ones with pre-launch value.** A new player joining for Gameweek 1 has no idea how any of this works and nothing in the app to tell them. If this issue gets split or partially delivered, ship those first.
- **The Pick Board is the launch-critical surface.** Surface 1 modifies `TippedMatchCard.tsx`, which is the one screen the whole launch depends on. Treat changes there as higher-risk than their size suggests: additive, behind the existing `points !== null` branch, and verified against a board with no scores at all (the day-one state — `BUILD_PLAN.md` decision 42 and ADR 0007 describe how the board renders before anything is scored).

### You are inventing the disclosure pattern, not following one

`grep -rn "aria-expanded" src` returns **nothing**. There is no existing accessible disclosure anywhere in this app; Predict the Table's Band accordion is driven from `BandsBoard.tsx` without one. Whatever this issue builds becomes the codebase's reference implementation for every future expander, so build it properly — real `<button>`, `aria-expanded`/`aria-controls`, keyboard operable — rather than matching the nearest existing thing.

### Use the existing kickoff formatter for any time or date in copy

`src/lib/dates/kickoff-format.ts` (tested) is the only correct way to render a kickoff time or date. `CLAUDE.md` has a hard constraint here: all comparisons in UTC, rendering in the viewer's browser-detected timezone via the `tz` cookie, falling back to `Australia/Sydney`. Blank-week copy that mentions when the next match is must go through that helper — a hand-rolled `toLocaleString` is a real bug, not a style nit. See issue #93 for the reasoning.

### The AppShell change touches every authenticated page

Adding the **?** affordance means editing `src/components/nav/AppShell.tsx`, which wraps all authenticated routes. It is a one-line-looking change with app-wide blast radius, and `SwitchPlayerButton` currently sits alone in that corner — check both together on a narrow phone viewport before calling it done.

### How this repo's automation will behave while you work

- **Husky pre-commit** runs `lint-staged`, `npm run typecheck`, `npm run test`. **Pre-push** runs `npm run build` and then `scripts/review/local-pr-review.mjs` — three Sonnet review passes (correctness, security invariants, spec conformance) over the diff vs. `main`.
- **If that review finds something it can safely fix, it commits the fix locally and aborts the push.** This is expected behaviour, not a failure: git had already resolved what to push before the hook ran. Just push again to include the fix. Don't fight it with `--no-verify`.
- Every change goes through a branch and PR (`BUILD_PLAN.md` decision 30). Paths outside `src/lib/**` and `.github/workflows/**` auto-merge once CI passes — which is all of this work, given the test-placement decision above.

## Notes for the implementer

- Surface 1 is the only part with meaningful logic; Surfaces 2 and 3 are copy and layout. Budget accordingly — and note that the hardest thing here is the writing, not the code.
- The scoring formula was finalised on 2026-08-13 — read `docs/adr/0009-match-scoring-formula-and-title-eligibility.md` and `docs/adr/0010-predict-the-table-scoring.md` before writing any copy. Both record what the scoring deliberately does *not* reward, which is usually what a player is actually asking about. The blank-week and no-pick-filed states exist because of specific decisions in 0009, not as afterthoughts.
- If any source document disagrees with another on a number, `CLAUDE.md` wins and the disagreement is a bug to fix in the same change, not to route around.
- If something in this spec turns out to be wrong or stale when you get to it, fix the spec in the same change rather than working around it — `ISSUE_STANDARD.md` §4 treats a stale spec as a bug, not a footnote.
