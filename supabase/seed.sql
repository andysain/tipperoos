-- Minimal seed: the current season row. Fixtures/teams are seeded separately (issue #5).
insert into seasons (label, start_date, end_date, is_current)
values ('2026-27', '2026-08-21', '2027-05-24', true)
on conflict (label) do nothing;
