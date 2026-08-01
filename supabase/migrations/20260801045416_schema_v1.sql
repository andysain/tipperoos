-- Tipperoos EPL rebuild — schema v1
-- Terms below match CONTEXT.md (Fixture, Tipped Match, Gameweek Score, Season Standing,
-- Voided Match, Skipped Slot, Picker, Season Winner). See CLAUDE.md for product rules
-- and BUILD_PLAN.md for the decisions this schema encodes.

create extension if not exists pgcrypto;

create table seasons (
  id uuid primary key default gen_random_uuid(),
  label text unique not null,
  start_date date not null,
  end_date date not null,
  is_current boolean default true,
  created_at timestamptz default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  short_code text,
  crest_url text,
  provider_name text not null,
  provider_team_id text not null,
  active boolean default true,
  created_at timestamptz default now(),
  unique (provider_name, provider_team_id)
);

-- A Fixture: one of the 380 seeded matches, whether or not it's ever a Tipped Match.
create table matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  provider_name text not null,
  provider_match_id text not null,
  team_a_id uuid not null references teams(id),
  team_b_id uuid not null references teams(id),
  kickoff_time timestamptz not null,
  status text not null default 'scheduled',
  team_a_score integer,
  team_b_score integer,
  result_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider_name, provider_match_id),
  constraint valid_match_status check (status in ('scheduled', 'completed', 'postponed')),
  constraint valid_match_scores check (
    (team_a_score is null or team_a_score >= 0) and
    (team_b_score is null or team_b_score >= 0)
  )
);

create index idx_matches_kickoff on matches(kickoff_time);
create index idx_matches_status on matches(status);

create table players (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  pin_hash text not null,
  failed_pin_attempts integer default 0,
  locked_until timestamptz,
  phone text,
  is_admin boolean default false,
  is_bot boolean default false,
  bot_type text,
  joined_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint valid_bot_type check (
    bot_type is null or bot_type in ('random', 'one_one', 'median')
  ),
  constraint bot_type_requires_bot check (
    bot_type is null or is_bot = true
  )
);

create index idx_players_bot on players(is_bot);

-- One row per Premier League round. Match 1 / Match 2 slots and the Match-2 Picker
-- state machine both live here, as DB columns, so a missed cron cycle or cold start
-- always resumes safely.
create table gameweeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  number integer not null,

  -- Tipped Match slots. Null = a Skipped Slot (fixture postponed before lock, not replaced).
  match_1_id uuid references matches(id),
  match_2_id uuid references matches(id),

  -- Voided Match: slot's fixture was postponed AFTER picks locked. Match stays
  -- referenced (it WAS tipped); no points are ever awarded for it.
  match_1_voided_at timestamptz,
  match_2_voided_at timestamptz,

  -- Match-2 Picker state machine.
  match_2_picker_id uuid references players(id),
  match_2_picker_status text not null default 'pending',
  match_2_picker_deadline timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (season_id, number),
  constraint valid_picker_status check (
    match_2_picker_status in ('not_applicable', 'pending', 'notified', 'picked', 'auto_picked')
  )
);

-- One pick per player per Tipped Match.
create table picks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  pred_home_score integer not null,
  pred_away_score integer not null,
  submitted_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (player_id, match_id),
  constraint valid_pick_scores check (pred_home_score >= 0 and pred_away_score >= 0)
);

create index idx_picks_match on picks(match_id);
create index idx_picks_player on picks(player_id);

-- Idempotent points ledger — upsert on (player_id, match_id), recomputed from the
-- match's current authoritative result. Never an accumulating counter.
create table scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  points integer not null default 0,
  computed_at timestamptz default now(),
  unique (player_id, match_id)
);

create index idx_scores_match on scores(match_id);
create index idx_scores_player on scores(player_id);

-- Per-gameweek Standings Snapshot — Gameweek Score + Season Total + Season Standing
-- (rank; 1 = best) for every player, recorded starting gameweek 1. Required to
-- compute the Match-2 Picker tiebreak, independent of when the picker UI ships.
create table standings_snapshots (
  id uuid primary key default gen_random_uuid(),
  gameweek_id uuid not null references gameweeks(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  gameweek_score integer not null default 0,
  season_total integer not null default 0,
  season_standing integer not null,
  created_at timestamptz default now(),
  unique (gameweek_id, player_id)
);

create index idx_standings_gameweek on standings_snapshots(gameweek_id);

-- Predict the Table — captured once per player. Always the full 20-team ordering;
-- scoring shape is deliberately deferred (see CLAUDE.md) and has no table yet.
create table table_predictions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique not null references players(id) on delete cascade,
  is_skipped boolean default false,
  submitted_at timestamptz,
  updated_at timestamptz default now()
);

create table table_prediction_ranks (
  id uuid primary key default gen_random_uuid(),
  table_prediction_id uuid not null references table_predictions(id) on delete cascade,
  team_id uuid not null references teams(id),
  predicted_rank integer not null,
  constraint valid_predicted_rank check (predicted_rank between 1 and 20),
  unique (table_prediction_id, predicted_rank),
  unique (table_prediction_id, team_id)
);

-- Lightweight sync attempt/outcome log — not a full raw-payload event-sourcing log.
create table sync_log (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  run_at timestamptz default now(),
  status text not null,
  matches_updated integer default 0,
  error_message text,
  constraint valid_sync_status check (status in ('success', 'failure'))
);

create index idx_sync_log_run_at on sync_log(run_at);

-- Every match-result edit (admin corrections included) gets a timestamped audit
-- entry — the mitigation for the admin-is-also-a-player credibility problem.
create table match_result_audit (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  changed_by uuid references players(id),
  old_status text,
  new_status text,
  old_team_a_score integer,
  old_team_b_score integer,
  new_team_a_score integer,
  new_team_b_score integer,
  changed_at timestamptz default now()
);

create index idx_match_result_audit_match on match_result_audit(match_id);
