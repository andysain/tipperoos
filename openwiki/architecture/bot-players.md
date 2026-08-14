---
type: concept
title: Bot Players
description: Three automated player types (Random, 1-1, Median Bot) that participate for fun and intrigue, not competition. Ineligible for season titles.
tags: [bots, scoring, leaderboard, game-design]
---

# Bot Players

Bot players (`is_bot = true` on the `players` table) exist in every competition as automated participants — they appear on the leaderboard, make picks, and earn scores, but serve as **benchmarks and entertainment**, not title contenders.

## Bot types

Three bot types are defined by the `bot_type` check constraint on the `players` table:

| Type           | Column value | Behavior (specified in CLAUDE.md)                                                                                                        |
| -------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Random Bot** | `random`     | Predicts a random plausible scoreline for each side, independently, per match                                                            |
| **1-1 Bot**    | `one_one`    | Always predicts 1–1 for every match                                                                                                      |
| **Median Bot** | `median`     | Predicts the rounded median of that match's _human players'_ submitted picks, derived only **after** the match locks (not a blind guess) |

These types carried forward from the retired World Cup app; the ELO bot was deliberately dropped.

> **Note**: Bot pick generation is currently specified but unimplemented. The schema (`bot_type` constraint, `is_bot` column) and login exclusion are present, but there is no bot-pick generation code or scoring integration. The boldCallEligible flag in the scoring test is the only bot-aware code in the scoring module.

## How bots differ from human players

### Login exclusion

Bots are filtered out of the player roster returned by `GET /api/auth/players` (`.eq("is_bot", false)`) — nobody logs in as a bot.

### Scoring inclusion

Bots' scores are computed identically to human players'. They appear on the leaderboard with a robot emoji (🤖) label.

### Bold Call exclusion

Bots are excluded from the Bold Call calculation in `scorePredictTableCohort()`. See `src/lib/scoring/predict-table.ts` — the `boldCallEligible` flag is always `false` for bots.

### Competition Admin exclusion

Bots cannot be Competition Admin (that role is assigned at competition bootstrap to a specific human).

## The Median Bot as Benchmark Line

The Median Bot is the leaderboard's **benchmark**: beating the crowd's own consensus over a full season is the app's one comparison that reflects skill rather than luck. It is deliberately not a competitor:

> "the season winner is always a person" — CLAUDE.md

With bots ineligible for the title (ADR-0009 reverses an earlier "bots are eligible" rule), the Median Bot functions purely as a skill-reference line.

## Eligibility summary

| Group               | Season Winner? | Table Prediction Title? | Bold Call eligible? |
| ------------------- | -------------- | ----------------------- | ------------------- |
| Human (on-time)     | Yes            | Yes                     | Yes                 |
| Human (Late Joiner) | No             | No                      | No                  |
| Competition Admin   | Yes            | Yes                     | Yes                 |
| Any Bot             | **No**         | **No**                  | **No**              |

## Per-competition scoping

Bots are **per-competition** — each competition has its own bot players, scoped by `players.competition_id`. The Median Bot in particular must derive from its own competition's human picks only.

## Related

- [Scoring Overview](../scoring/match-scoring.md)
- [Predict Table Scoring](../scoring/predict-table-scoring.md)
- [Competition Bootstrap](../competitions/bootstrap.md)
