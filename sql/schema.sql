create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text not null,
  pin_hash text not null,
  emoji text,
  household text,
  is_admin boolean default false,
  is_bot boolean default false,
  bot_type text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint valid_bot_type check (
    bot_type is null or bot_type in ('random', 'median', 'one_one')
  )
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  external_id integer unique,
  name text unique not null,
  fifa_code text,
  group_letter text,
  icon text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  match_id text unique not null,
  match_number integer unique,
  stage text not null,
  stage_order integer,
  group_name text,
  match_label text,
  team_a text,
  team_b text,
  team_a_code text,
  team_b_code text,
  team_a_icon text,
  team_b_icon text,
  kickoff_time timestamptz not null,
  is_knockout boolean default false,
  city text,
  venue text,
  status text default 'scheduled',
  team_a_score integer,
  team_b_score integer,
  advance_team text,
  result_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint valid_match_status check (
    status in ('scheduled', 'completed', 'cancelled', 'postponed')
  ),
  constraint valid_scores check (
    (team_a_score is null or team_a_score >= 0) and
    (team_b_score is null or team_b_score >= 0)
  )
);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  pred_team_a_score integer not null,
  pred_team_b_score integer not null,
  pred_advance_team text,
  submitted_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(player_id, match_id),
  constraint valid_prediction_scores check (
    pred_team_a_score >= 0 and pred_team_b_score >= 0
  )
);

create table if not exists winner_picks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  team text not null,
  submitted_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(player_id)
);

create table if not exists settings (
  id integer primary key default 1,
  winner_pick_deadline timestamptz,
  final_winner text,
  lock_minutes_before_kickoff integer default 30,
  allow_player_signup boolean default true,
  timezone text default 'Australia/Sydney',
  updated_at timestamptz default now(),
  constraint only_one_settings_row check (id = 1)
);

alter table settings
add column if not exists allow_player_signup boolean default true;

insert into settings (id, lock_minutes_before_kickoff, timezone)
values (1, 30, 'Australia/Sydney')
on conflict (id) do nothing;

create index if not exists idx_players_active on players(active);
create index if not exists idx_players_bot on players(is_bot);
create index if not exists idx_matches_kickoff on matches(kickoff_time);
create index if not exists idx_matches_stage on matches(stage);
create index if not exists idx_predictions_player on predictions(player_id);
create index if not exists idx_predictions_match on predictions(match_id);
