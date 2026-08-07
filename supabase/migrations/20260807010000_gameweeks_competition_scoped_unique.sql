-- Issue #69: scope Tipped Match selection & Match-2 Picker state per competition.
-- See docs/adr/0004-multi-competition-foundational-scope.md decisions 1 and 2.
--
-- gameweeks.competition_id already exists (added as part of #68's migration,
-- 20260804010000_competitions.sql). What's still outstanding is the unique
-- constraint: it's still (season_id, number) from schema_v1.sql, which would
-- collide two competitions' gameweek rows for the same season/number pair.

alter table gameweeks drop constraint gameweeks_season_id_number_key;

alter table gameweeks
  add constraint gameweeks_competition_id_season_id_number_key
  unique (competition_id, season_id, number);
