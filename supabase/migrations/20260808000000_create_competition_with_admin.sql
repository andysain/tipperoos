-- Issue #70: atomic competition + Competition Admin bootstrap.
-- See docs/adr/0004-multi-competition-foundational-scope.md decision 7.
--
-- @supabase/supabase-js talks to PostgREST, which has no multi-statement
-- transaction -- two separate .insert() calls from scripts/bootstrap-competition.mjs
-- would be two HTTP requests, and a failure between them would leave a
-- competition live with no admin able to fix anything (the exact failure
-- mode #70 exists to prevent). This function does both inserts in one
-- implicit transaction instead.
--
-- code_hash/pin_hash arrive already scrypt-hashed from Node -- this
-- function never sees plaintext, so nothing sensitive reaches a SQL
-- statement or a query log. The app-level collision guard (findCollidingCompetition)
-- runs script-side, before this function is called; this function does the
-- two inserts and nothing else.
--
-- This is the repo's first Postgres function and first RPC call --
-- TESTING_STANDARD.md §7 names it the canonical exemplar for the shape.
create function create_competition_with_admin(
  competition_name text,
  competition_code_hash text,
  admin_display_name text,
  admin_pin_hash text,
  admin_emoji text
)
returns table (competition_id uuid, admin_id uuid)
language plpgsql
-- security invoker (the default, stated explicitly): the script already
-- authenticates as service_role. `security definer` combined with the
-- default PUBLIC execute grant below is the worst available combination,
-- and the one you get by copying most plpgsql examples -- don't.
security invoker
set search_path = ''
as $$
declare
  new_competition_id uuid;
  new_admin_id uuid;
begin
  insert into public.competitions (name, code_hash)
  values (competition_name, competition_code_hash)
  returning id into new_competition_id;

  insert into public.players (
    competition_id,
    display_name,
    pin_hash,
    emoji,
    is_admin,
    is_bot,
    pin_reset_required
  )
  values (
    new_competition_id,
    admin_display_name,
    admin_pin_hash,
    admin_emoji,
    true,
    false,
    false
  )
  returning id into new_admin_id;

  return query select new_competition_id, new_admin_id;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST exposes any
-- callable function in `public` as an RPC endpoint -- left alone, this
-- becomes an endpoint the anon key can hit to create a competition and an
-- admin account.
revoke execute on function create_competition_with_admin(text, text, text, text, text) from public;
grant execute on function create_competition_with_admin(text, text, text, text, text) to service_role;
