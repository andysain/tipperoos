-- Issue #132: keep the Table Prediction deadline authoritative to Postgres
-- time and make the lock check part of each mutation transaction.

create function public.get_db_time()
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select current_timestamp;
$$;

create function public.table_prediction_lock_status(p_player_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  player_joined_at timestamptz;
  gameweek_one_kickoff timestamptz;
begin
  select joined_at
    into player_joined_at
    from public.players
   where id = p_player_id
   order by id
   limit 1
   for update;

  if not found then
    return 'player_not_found';
  end if;

  select min(m.kickoff_time)
    into gameweek_one_kickoff
    from public.seasons s
    join public.matches m on m.season_id = s.id
   where s.is_current = true;

  if public.get_db_time() >= timestamptz '2026-08-31 14:00:00+00'
     and (gameweek_one_kickoff is null or player_joined_at <= gameweek_one_kickoff) then
    return 'locked';
  end if;

  return 'editable';
end;
$$;

create function public.table_prediction_submit(
  p_player_id uuid
)
returns table (result text, submitted_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lock_status text;
  db_now timestamptz;
  prediction_id uuid;
begin
  lock_status := public.table_prediction_lock_status(p_player_id);
  if lock_status <> 'editable' then
    return query select lock_status, null::timestamptz;
    return;
  end if;

  db_now := public.get_db_time();

  select id
    into prediction_id
    from public.table_predictions
   where player_id = p_player_id
   order by id
   limit 1
   for update;

  if not found then
    return query select 'no_prediction'::text, null::timestamptz;
    return;
  end if;

  update public.table_predictions
     set submitted_at = db_now,
         is_skipped = false,
         updated_at = db_now
   where id = prediction_id;

  return query select 'saved'::text, db_now;
end;
$$;

create function public.table_prediction_assign(
  p_player_id uuid,
  p_team_id uuid,
  p_band text
)
returns table (result text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lock_status text;
  db_now timestamptz;
  prediction_id uuid;
  rank_id uuid;
  next_rank integer;
begin
  lock_status := public.table_prediction_lock_status(p_player_id);
  if lock_status <> 'editable' then
    return query select lock_status;
    return;
  end if;

  db_now := public.get_db_time();

  if not exists (select 1 from public.teams where id = p_team_id) then
    return query select 'invalid_team'::text;
    return;
  end if;

  insert into public.table_predictions (player_id, is_skipped, submitted_at)
  values (p_player_id, false, null)
  on conflict (player_id) do update
    set is_skipped = false,
        submitted_at = null,
        updated_at = db_now
  returning id into prediction_id;

  select id
    into rank_id
    from public.table_prediction_ranks
   where table_prediction_id = prediction_id
     and team_id = p_team_id
   order by id
   limit 1
   for update;

  if found then
    update public.table_prediction_ranks
       set band = p_band
     where id = rank_id;
    return query select 'saved'::text;
    return;
  end if;

  select candidate
    into next_rank
    from generate_series(1, 20) candidate
   where not exists (
     select 1
       from public.table_prediction_ranks
      where table_prediction_id = prediction_id
        and predicted_rank = candidate
   )
   order by candidate
   limit 1;

  insert into public.table_prediction_ranks (
    table_prediction_id, team_id, band, predicted_rank
  ) values (prediction_id, p_team_id, p_band, next_rank);

  return query select 'saved'::text;
end;
$$;

create function public.table_prediction_unassign(
  p_player_id uuid,
  p_team_id uuid
)
returns table (result text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lock_status text;
  db_now timestamptz;
  prediction_id uuid;
begin
  lock_status := public.table_prediction_lock_status(p_player_id);
  if lock_status <> 'editable' then
    return query select lock_status;
    return;
  end if;

  db_now := public.get_db_time();

  select id
    into prediction_id
    from public.table_predictions
   where player_id = p_player_id
   order by id
   limit 1
   for update;

  if found then
    delete from public.table_prediction_ranks
     where table_prediction_id = prediction_id
       and team_id = p_team_id;

    update public.table_predictions
       set submitted_at = null,
           updated_at = db_now
     where id = prediction_id;
  end if;

  return query select 'saved'::text;
end;
$$;

revoke execute on function public.get_db_time() from public;
revoke execute on function public.table_prediction_lock_status(uuid) from public;
revoke execute on function public.table_prediction_submit(uuid) from public;
revoke execute on function public.table_prediction_assign(uuid, uuid, text) from public;
revoke execute on function public.table_prediction_unassign(uuid, uuid) from public;
grant execute on function public.get_db_time() to service_role;
grant execute on function public.table_prediction_lock_status(uuid) to service_role;
grant execute on function public.table_prediction_submit(uuid) to service_role;
grant execute on function public.table_prediction_assign(uuid, uuid, text) to service_role;
grant execute on function public.table_prediction_unassign(uuid, uuid) to service_role;

create index if not exists idx_matches_season on public.matches(season_id);
