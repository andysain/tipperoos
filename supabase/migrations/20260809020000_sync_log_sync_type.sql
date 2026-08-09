-- Issue #88: distinguishes a standings-sync failure from a fixture/result-
-- sync failure in sync_log, once both exist independently. Nullable and
-- additive -- doesn't require #11's fixture/result sync (not yet built) to
-- adopt a value; it can stay null for those rows or adopt 'fixtures' later.
alter table sync_log add column sync_type text;
