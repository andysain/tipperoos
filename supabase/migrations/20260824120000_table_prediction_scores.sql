-- Issue #157: stores each player's Predict the Table score, recomputed on
-- the standings sync and on every submit/assign/unassign (see issue's
-- decision log -- any player is editable until 2026-08-31, and Bold Call
-- rarity is cohort-wide, so a standings-only trigger would go stale on a
-- prediction edit too). Idempotent upsert on `player_id`, mirroring
-- `scores`' shape (issue #21 D4) -- never an accumulating counter. No
-- season_id: `table_predictions` itself has none (captured once per
-- season), so this follows the same precedent.
create table table_prediction_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique not null references players(id) on delete cascade,
  total_score integer not null default 0,
  placement_score integer not null default 0,
  band_bonus_score integer not null default 0,
  bold_call_score integer not null default 0,
  computed_at timestamptz not null default now(),
  constraint valid_predict_table_total check (total_score between 0 and 200)
);

create index idx_table_prediction_scores_player on table_prediction_scores(player_id);
