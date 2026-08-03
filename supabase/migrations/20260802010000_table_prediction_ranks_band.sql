-- Predict the Table capture UI (issue #26): the shape decided in
-- docs/adr/0003-predict-the-table-shape.md sorts teams into 7 fixed Table
-- Bands, not a raw 1-20 rank a player enters directly. `band` is the field
-- that actually carries scoring meaning; `predicted_rank` (existing column)
-- stays populated too, as an assignment-order value, so the "always store
-- the full 20-team ordering" storage principle in CLAUDE.md still holds.
alter table table_prediction_ranks add column band text not null;

alter table table_prediction_ranks add constraint valid_table_band check (
  band in (
    'champion',
    'champions_league',
    'europe',
    'mid_table',
    'lower_table',
    'relegation_battle',
    'relegated'
  )
);
