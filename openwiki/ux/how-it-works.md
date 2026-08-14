---
type: concept
title: How It Works Page
description: Kid-friendly explanations of weekly picks, scoring, missing picks, Predict the Table, and bot eligibility. Accessed via HelpButton, not a tab-bar destination.
tags: [ux, help, how-it-works, scoring, rules, bots]
---

# How It Works Page

The How It Works page at `src/app/how-it-works/page.tsx` explains the game's rules in kid-friendly language. It is an **authenticated** route at `/how-it-works`, rendered `force-dynamic` — the page calls `getSessionPlayerId()` and `redirect("/login")`s when there is no session. It is not guest-accessible.

## Access

- Via the persistent `?` HelpButton in the top-right corner of every authenticated page
- Also via inline "How points work" links from `ScoringBreakdown` and `ScoringSummary`
- Not a tab-bar destination (ADR-0005)

## Page sections

### Weekly predictions

- Explains two matches per gameweek, auto-selection (Top Matchup / Random Pick)
- Full scoreline prediction, not just a result
- Lock timing (5 minutes before kickoff)

### How your pick scores

Renders the `WeeklyScoringTable` component showing:

- Right Result (+3)
- Right Goal Difference (+2)
- Home Team's Score (+1)
- Away Team's Score (+1)
- Wrong Way Round (+1)

### If you don't pick

- Missing picks are never filled in
- Scores 0 points

### Predict the Table

Renders the `TableScoringTable` component showing:

- Placement points (5/2/1/0 by Band distance)
- Band Bonus (15 or 10 per exact Band)
- Bold Call (+3, best 5 count)

### Wrong Way Round

Dedicated section explaining the swapped-scoreline edge case.

### Who can win

- **On-time players**: eligible for season winner (always a person)
- **Late Joiners**: not eligible (didn't play full season)
- **Bots**: "Bots play for fun and cannot win the season title"
- **Predict the Table**: has its own title (separate from season winner)

## Related

- [App Shell and Navigation](../navigation/app-shell.md)
- [Match Scoring](../scoring/match-scoring.md)
- [Predict Table Scoring](../scoring/predict-table-scoring.md)
- [Bot Players](../architecture/bot-players.md)
