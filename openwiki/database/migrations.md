---
type: concept
title: Database Migrations
description: Inventory of Supabase migrations — schema v1, player auth, table predictions, competitions, gameweeks, standings, and display names.
tags: [database, migrations, supabase, schema]
---

# Database Migrations

All migrations are in `supabase/migrations/`, numbered by a fictional date scheme (20260801...) since the real year is used for semantic ordering.

## Migration inventory

| Migration file                                           | Changes                                                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260801045416_schema_v1.sql`                           | Core tables: competitions, players, seasons, teams, matches, gameweeks, picks, scores, table_predictions, table_prediction_ranks. Bot types constraint, match status enum. |
| `20260801063700_players_auth_v2.sql`                     | Player auth columns: `pin_hash`, `failed_pin_attempts`, `locked_until`, `pin_reset_required`. SQL function for verify+increment.                                           |
| `20260802010000_table_prediction_ranks_band.sql`         | Adds `band` column to `table_prediction_ranks` (replacing earlier rank-only schema).                                                                                       |
| `20260802020000_teams_previous_season_position.sql`      | Adds `previous_season_position` to `teams` for roster ordering in Predict the Table.                                                                                       |
| `20260804010000_competitions.sql`                        | Competition schema: `name`, `code_hash`, `created_at`.                                                                                                                     |
| `20260807010000_gameweeks_competition_scoped_unique.sql` | Adds `competition_id` to gameweeks unique constraint.                                                                                                                      |
| `20260808000000_create_competition_with_admin.sql`       | Creates `create_competition_with_admin()` RPC function for atomic competition + admin bootstrap.                                                                           |
| `20260809010000_team_standings.sql`                      | Creates `team_standings` table for live league positions.                                                                                                                  |
| `20260809020000_sync_log_sync_type.sql`                  | Adds `sync_type` column to `sync_log`.                                                                                                                                     |
| `20260813010000_team_display_names.sql`                  | Adds `display_name` column to `teams`.                                                                                                                                     |

## Applying migrations

```bash
supabase link --project-ref <ref>
supabase db push
```

**Discipline**: apply to staging first, confirm, then apply the same migration to production before merging the branch that depends on it. Schema drift between staging and production is the main failure mode.

## Writing migrations

Follow the existing naming pattern: `YYYYMMDDHHMMSS_description.sql` where YYYY is a fictional year (20260801+) for semantic ordering. Each migration should be idempotent where possible.

## Related

- [Schema Reference](schema.md)
- [Competition Bootstrap](../competitions/bootstrap.md)
