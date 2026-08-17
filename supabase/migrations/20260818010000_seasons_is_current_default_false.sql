-- Issue #174 item 1.
--
-- `seasons.is_current` was declared `default true` in schema_v1. On a column
-- where at most one row should ever be current, that default is backwards:
-- every season insert that doesn't say otherwise becomes current, silently
-- producing two current seasons.
--
-- This is not test-only. Seeding the 2027-28 season in production would have
-- made it current alongside 2026-27 the moment it was inserted. It was found
-- when the scripted gameweek simulation (which inserts a season and never
-- touches is_current) left staging with two current seasons, and every
-- authenticated route began returning 500 -- see the companion fix to
-- getCurrentSeasonId, which now survives that state rather than throwing.
--
-- Flipping the default does not change any existing row: 2026-27 stays
-- current, and this migration deliberately does not touch data. Callers that
-- genuinely mean to create a current season must now say so explicitly.
alter table seasons alter column is_current set default false;

comment on column seasons.is_current is
  'At most one row should be true. Defaults to false (issue #174) -- set it explicitly when promoting a season, and clear the previous one in the same transaction.';
