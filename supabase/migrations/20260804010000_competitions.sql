-- Issue #68: DB-backed, hashed competition codes (fixes Vercel login).
-- See docs/adr/0004-multi-competition-foundational-scope.md decisions 1 and 3.

create table competitions (
  id uuid primary key default gen_random_uuid(),
  -- Scrypt "<saltHex>:<keyHex>" (see src/lib/auth/scrypt-secret.ts), never
  -- plaintext. NOT unique: hashSecret salts every call, so two competitions
  -- sharing a plaintext code would still get different hash values -- a
  -- unique constraint here couldn't detect that, so it's deliberately
  -- omitted rather than shipped as a check that looks like it works and
  -- doesn't (see the #68 grilling session, 2026-08-04).
  code_hash text not null,
  name text not null,
  created_at timestamptz default now()
);

-- Placeholder row so existing/future players can be backfilled below before
-- the real per-environment code is set. code_hash has no ":" in it, so it
-- can never parse as a well-formed <saltHex>:<keyHex> value -- verifySecret
-- fails closed on it until scripts/set-competition-code.mjs sets the real
-- hash for this environment.
insert into competitions (name, code_hash)
values ('Tipperoos', 'placeholder-unset-' || gen_random_uuid()::text);

alter table players add column competition_id uuid references competitions(id);
update players set competition_id = (select id from competitions limit 1);
alter table players alter column competition_id set not null;

-- display_name uniqueness moves from globally unique to unique per
-- competition (docs/adr/0004 decision 1).
drop index if exists players_display_name_lower_idx;
create unique index players_competition_id_display_name_lower_idx
  on players (competition_id, lower(display_name));

alter table gameweeks add column competition_id uuid references competitions(id);
update gameweeks set competition_id = (select id from competitions limit 1);
alter table gameweeks alter column competition_id set not null;
