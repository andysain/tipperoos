-- Issue #88: per-season, per-team current league position + matches-played
-- count. Feeds the Pick Board's "current league position" (ADR 0007) and
-- Match 1's live-standings rank source once every club has played ten
-- (ADR 0006). Overwritten each sync -- a current snapshot, not history (see
-- issue #88's assumption check).
create table team_standings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  season_id uuid not null references seasons(id) on delete cascade,
  position smallint not null,
  played smallint not null,
  -- Lets a future consumer (ADR 0006's "fall back to last season's table if
  -- live standings are unavailable or stale") judge staleness without a
  -- second lookup into sync_log.
  updated_at timestamptz not null default now(),
  unique (team_id, season_id),
  constraint valid_team_standings_position check (position between 1 and 20),
  constraint valid_team_standings_played check (played >= 0)
);

create index idx_team_standings_season on team_standings(season_id);
