---
type: concept
title: Database Schema
description: Supabase Postgres schema — tables for competitions, players, seasons, teams, matches, gameweeks, picks, scores, table predictions, standings, and sync logging.
tags: [database, schema, supabase, migrations, postgres]
---

# Database Schema

The schema is managed as Supabase CLI migrations under `supabase/migrations/`. All migrations are numbered by a fictional date scheme (20260801...) since the real year is used for semantic ordering.

## Entity-Relationship Overview

```mermaid
erDiagram
    competitions ||--o{ players : contains
    competitions ||--o{ gameweeks : scopes
    players ||--o{ picks : makes
    players ||--o{ scores : earns
    players ||--o{ table_predictions : "has one"
    seasons ||--o{ matches : schedules
    seasons ||--o{ gameweeks : belongs_to
    matches ||--o{ picks : receives
    matches ||--o{ scores : for
    teams ||--o{ matches : "as home (team_a)"
    teams ||--o{ matches : "as away (team_b)"
    teams ||--o{ team_standings : has
    table_predictions ||--o{ table_prediction_ranks : contains
    gameweeks ||--|| competitions : scoped_to
```

## Core tables

### `competitions`

| Column       | Type        | Notes                           |
| ------------ | ----------- | ------------------------------- |
| `id`         | UUID        | PK                              |
| `name`       | text        | Display name                    |
| `code_hash`  | text        | scrypt hash of competition code |
| `created_at` | timestamptz |                                 |

A competition is a private group of players tipping independently on the same Premier League season. Two competitions share match data but never players/picks/scores. Exactly one exists today.

### `players`

| Column                | Type        | Notes                                                                                                                                               |
| --------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | UUID        | PK                                                                                                                                                  |
| `competition_id`      | UUID        | FK → competitions                                                                                                                                   |
| `display_name`        | text        | Unique (case-insensitive), 2-20 chars                                                                                                               |
| `pin_hash`            | text        | scrypt hash `salt:key`                                                                                                                              |
| `emoji`               | text        | Curated emoji                                                                                                                                       |
| `email`               | text        | Optional, not unique — schema_v1 shipped `email text unique not null`, but `20260801063700_players_auth_v2.sql` dropped the constraint and NOT NULL |
| `is_admin`            | boolean     | Competition Admin                                                                                                                                   |
| `is_bot`              | boolean     | Bot player flag                                                                                                                                     |
| `bot_type`            | text        | `random`, `one_one`, or `median`                                                                                                                    |
| `failed_pin_attempts` | int         | Lockout counter                                                                                                                                     |
| `locked_until`        | timestamptz | Lockout expiry                                                                                                                                      |
| `pin_reset_required`  | boolean     | Forced-reset flag                                                                                                                                   |

### `seasons`

| Column       | Type    | Notes                      |
| ------------ | ------- | -------------------------- |
| `id`         | UUID    | PK                         |
| `label`      | text    | e.g. "2026-27"             |
| `start_date` | date    |                            |
| `end_date`   | date    |                            |
| `is_current` | boolean | Exactly one current season |

### `teams`

| Column                     | Type    | Notes                                                                                              |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `id`                       | UUID    | PK                                                                                                 |
| `name`                     | text    | Short name, suffix-cleaned (e.g. "Brighton & Hove Albion" → "Brighton & Hove Albion" → "Brighton") |
| `full_name`                | text    | Provider's original full label; unique, not null                                                   |
| `display_name`             | text    | Common UI label for Predict the Table filling (e.g. "Brighton"); unique, not null                  |
| `short_code`               | text    | e.g. "ARS"                                                                                         |
| `crest_url`                | text    | Team crest URL                                                                                     |
| `provider_name`            | text    | e.g. "football-data.org"                                                                           |
| `provider_team_id`         | text    | External API ID                                                                                    |
| `active`                   | boolean | Default true                                                                                       |
| `previous_season_position` | int     | Last season's finishing position (for roster ordering)                                             |

### `matches`

| Column              | Type        | Notes                                 |
| ------------------- | ----------- | ------------------------------------- |
| `id`                | UUID        | PK                                    |
| `season_id`         | UUID        | FK → seasons                          |
| `provider_name`     | text        | Source API                            |
| `provider_match_id` | text        | External match ID                     |
| `team_a_id`         | UUID        | FK → teams (home)                     |
| `team_b_id`         | UUID        | FK → teams (away)                     |
| `kickoff_time`      | timestamptz | UTC                                   |
| `status`            | text        | `scheduled`, `completed`, `postponed` |
| `team_a_score`      | int         | Actual result: home                   |
| `team_b_score`      | int         | Actual result: away                   |
| `result_updated_at` | timestamptz | Last time the result was changed      |

### `gameweeks`

| Column                    | Type        | Notes                                                             |
| ------------------------- | ----------- | ----------------------------------------------------------------- |
| `id`                      | UUID        | PK                                                                |
| `season_id`               | UUID        | FK → seasons                                                      |
| `competition_id`          | UUID        | FK → competitions                                                 |
| `number`                  | int         | Gameweek number (1-38)                                            |
| `match_1_id`              | UUID        | FK → matches (nullable — Skipped Slot)                            |
| `match_2_id`              | UUID        | FK → matches (nullable — Skipped Slot)                            |
| `match_1_voided_at`       | timestamptz | Set when Match 1 voided post-lock                                 |
| `match_2_voided_at`       | timestamptz | Set when Match 2 voided post-lock                                 |
| `match_2_picker_id`       | UUID        | FK → players — Match-2 picker (deferred feature), reserved column |
| `match_2_picker_status`   | text        | `not_applicable`, `pending`, `notified`, `picked`, `auto_picked`  |
| `match_2_picker_deadline` | timestamptz | Deadline for the picker to choose (deferred feature)              |

Unique constraint: `gameweeks_competition_id_season_id_number_key` on `(competition_id, season_id, number)` — schema_v1 shipped `(season_id, number)`, which would have collided two competitions' rows for the same gameweek; `20260807010000_gameweeks_competition_scoped_unique.sql` drops and replaces it.

### `picks`

| Column            | Type        | Notes                          |
| ----------------- | ----------- | ------------------------------ |
| `id`              | UUID        | PK                             |
| `player_id`       | UUID        | FK → players                   |
| `match_id`        | UUID        | FK → matches                   |
| `pred_home_score` | int         | Player's prediction: home      |
| `pred_away_score` | int         | Player's prediction: away      |
| `submitted_at`    | timestamptz | When the pick was filed        |
| `updated_at`      | timestamptz | When the pick was last changed |

Unique constraint: `(player_id, match_id)`.

### `scores`

| Column        | Type        | Notes                        |
| ------------- | ----------- | ---------------------------- |
| `id`          | UUID        | PK                           |
| `player_id`   | UUID        | FK → players                 |
| `match_id`    | UUID        | FK → matches                 |
| `points`      | int         | Points earned                |
| `computed_at` | timestamptz | Timestamp of (re)computation |

Unique constraint: `(player_id, match_id)`.

### `team_standings`

| Column       | Type        | Notes           |
| ------------ | ----------- | --------------- |
| `team_id`    | UUID        | FK → teams      |
| `season_id`  | UUID        | FK → seasons    |
| `position`   | int         | League position |
| `played`     | int         | Games played    |
| `updated_at` | timestamptz | Sync timestamp  |

Unique constraint: `(team_id, season_id)`.

### `table_predictions`

| Column         | Type        | Notes                                |
| -------------- | ----------- | ------------------------------------ |
| `id`           | UUID        | PK                                   |
| `player_id`    | UUID        | FK → players (unique)                |
| `submitted_at` | timestamptz | Confirmation timestamp               |
| `is_skipped`   | boolean     | Late Joiner skip flag                |
| `updated_at`   | timestamptz | Tracked by transactional RPC inserts |

### `standings_snapshots`

| Column            | Type        | Notes                              |
| ----------------- | ----------- | ---------------------------------- |
| `id`              | UUID        | PK                                 |
| `gameweek_id`     | UUID        | FK → gameweeks                     |
| `player_id`       | UUID        | FK → players                       |
| `gameweek_score`  | int         | Points earned in that gameweek     |
| `season_total`    | int         | Cumulative points for the season   |
| `season_standing` | int         | Rank within competition (1 = best) |
| `created_at`      | timestamptz |                                    |

Unique constraint: `(gameweek_id, player_id)`.

### `table_prediction_ranks`

| Column                | Type | Notes                                            |
| --------------------- | ---- | ------------------------------------------------ |
| `id`                  | UUID | PK                                               |
| `table_prediction_id` | UUID | FK → table_predictions                           |
| `team_id`             | UUID | FK → teams                                       |
| `band`                | text | Band key (`champion`, etc.)                      |
| `predicted_rank`      | int  | 1-20, stable after assignment (never renumbered) |

Two unique constraints protect data integrity:

- `table_prediction_ranks(table_prediction_id, team_id)` — prevents the same team appearing twice in one prediction
- `table_prediction_ranks(table_prediction_id, predicted_rank)` — prevents two teams sharing the same rank slot

The `predicted_rank` constraint was originally described as firing `23505` for the now-removed client-side retry loop. As of migration `20260813020000_table_prediction_deadline.sql`, the assign/unassign/submit routes use **transactional Postgres RPCs** (`table_prediction_assign`, `table_prediction_unassign`, `table_prediction_submit`) that handle rank computation and concurrency inside a single DB transaction — no client-side retry loop.

### `sync_log`

| Column            | Type        | Notes                                 |
| ----------------- | ----------- | ------------------------------------- |
| `id`              | UUID        | PK                                    |
| `provider_name`   | text        | e.g. "football-data.org"              |
| `sync_type`       | text        | e.g. "standings"                      |
| `run_at`          | timestamptz | When the sync cycle started           |
| `status`          | text        | `success` or `failure`                |
| `matches_updated` | int         | Number of matches updated in the sync |
| `error_message`   | text        | Present only on failure               |

### `match_result_audit`

| Column             | Type        | Notes                                          |
| ------------------ | ----------- | ---------------------------------------------- |
| `id`               | UUID        | PK                                             |
| `match_id`         | UUID        | FK → matches                                   |
| `changed_by`       | UUID        | FK → players (nullable, null = automated sync) |
| `old_status`       | text        | Previous match status                          |
| `new_status`       | text        | New match status                               |
| `old_team_a_score` | int         | Previous home score                            |
| `old_team_b_score` | int         | Previous away score                            |
| `new_team_a_score` | int         | New home score                                 |
| `new_team_b_score` | int         | New away score                                 |
| `changed_at`       | timestamptz |                                                |

Every match-result edit (admin corrections included) gets a timestamped audit entry. Indexed on `match_id`.

## Related

- [Migrations](migrations.md)
- [Pick Board Data Access](../pick-board/overview.md)
- [Competition Scope Model](../competitions/scope-model.md)
