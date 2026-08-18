-- Issue #182 (filed from #176's review): scoresForCompetition and
-- fetchScoreRows's seasonScoreRows both selected every raw `scores` row for
-- a competition+season with no .limit()/.range()/.order(), then folded
-- points in JS. Supabase's configured max_rows = 1000 (supabase/config.toml)
-- truncates silently past that -- no error -- and with no .order() the kept
-- rows are arbitrary, corrupting per-player totals feeding the leaderboard
-- and standings_snapshots. This repo's ~76 scored matches/season crosses
-- 1,000 rows at 14 players, inside the "~10-20 players" target group size.
--
-- Fix: aggregate in SQL instead of fetching raw rows to fold in JS. Response
-- size drops from up to (scored matches x roster) rows to (roster) rows,
-- independent of season length.

-- Backs scoresForCompetition (src/lib/competitions/scope.ts). Mirrors
-- foldCompetitionScores's derivation exactly: the additive scoring formula's
-- reachable score set is exactly {0, 1, 3, 4, 5, 7}
-- (docs/adr/0009-match-scoring-formula-and-title-eligibility.md), so
-- points = 7 <=> exact scoreline and points >= 3 <=> correct result. If that
-- reachable set ever changes, this predicate must change with it.
create function public.competition_score_totals(
  p_player_ids uuid[],
  p_season_id uuid
)
returns table (
  player_id uuid,
  points integer,
  matches_scored integer,
  exact_tips integer,
  correct_results integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- integer, not bigint: a season is ~76 matches, so every count/sum here
  -- stays far under integer range, and integer round-trips through
  -- PostgREST's JSON response as a plain JS number -- bigint would come
  -- back as a string and need an extra parse step for no benefit.
  select
    s.player_id,
    coalesce(sum(s.points), 0)::integer as points,
    count(*)::integer as matches_scored,
    count(*) filter (where s.points = 7)::integer as exact_tips,
    count(*) filter (where s.points >= 3)::integer as correct_results
  from public.scores s
  join public.matches m on m.id = s.match_id
  where s.player_id = any(p_player_ids)
    and m.season_id = p_season_id
  group by s.player_id;
$$;

-- Backs fetchScoreRows's seasonScoreRows call
-- (src/lib/standings-snapshot/load-snapshot-inputs.ts). Its sibling
-- gameweekScoreRows call stays on the raw-row select -- bounded to at most
-- two matches x roster, safe at any realistic scale, not worth the extra
-- round trip an RPC call would add.
create function public.score_totals_for_matches(
  p_player_ids uuid[],
  p_match_ids uuid[]
)
returns table (
  player_id uuid,
  points integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.player_id,
    coalesce(sum(s.points), 0)::integer as points
  from public.scores s
  where s.player_id = any(p_player_ids)
    and s.match_id = any(p_match_ids)
  group by s.player_id;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST exposes any
-- callable function in `public` as an RPC endpoint.
revoke execute on function public.competition_score_totals(uuid[], uuid) from public;
revoke execute on function public.score_totals_for_matches(uuid[], uuid[]) from public;
grant execute on function public.competition_score_totals(uuid[], uuid) to service_role;
grant execute on function public.score_totals_for_matches(uuid[], uuid[]) to service_role;
