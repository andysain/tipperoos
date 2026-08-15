-- PROTOTYPE (proto/predict-table-rethink): add the Runners Up Band, so the
-- top of the table is two single-club calls (Champion, Runners Up) and
-- Champions League becomes positions 3-5. Still 20 clubs across the Bands.
--
-- Data-safe as a pure constraint widening: no stored row can currently hold
-- 'runners_up', so nothing needs rewriting. Reverting is only safe while no
-- row has been written with the new value.
alter table table_prediction_ranks drop constraint valid_table_band;

alter table table_prediction_ranks add constraint valid_table_band check (
  band in (
    'champion',
    'runners_up',
    'champions_league',
    'europe',
    'mid_table',
    'lower_table',
    'relegation_battle',
    'relegated'
  )
);
