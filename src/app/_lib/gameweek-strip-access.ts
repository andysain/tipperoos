import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreMatch } from "@/lib/scoring/match";
import { deriveWeekOutcome } from "@/lib/gameweeks/week-outcome";
import { isMatchLocked } from "@/lib/competitions/scope";
import { tippedSlots } from "@/lib/gameweeks/tipped-slots";
import type { StripWeek } from "@/components/gameweek/GameweekStrip";

/**
 * The archive strip's payload: every gameweek in this season with the
 * viewer's points for it (docs/adr/0013 D14).
 *
 * A week the viewer didn't pick and a week they scored nothing must render
 * differently, so `picked` is carried separately from `points` rather than
 * being inferred from a zero.
 */
export async function loadGameweekStrip(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  playerId: string,
  now: Date,
  /** See loadPicksRecord -- the month landmark is a date label like any
   *  other, so it follows the same viewer-timezone rule. */
  timeZone: string,
): Promise<StripWeek[]> {
  const { data: gameweeks, error } = await supabase
    .from("gameweeks")
    .select(
      "number, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .order("number", { ascending: true });
  if (error) throw error;
  if (!gameweeks || gameweeks.length === 0) return [];

  const slots = tippedSlots(gameweeks);

  const [matchesResult, picksResult] = await Promise.all([
    supabase
      .from("matches")
      .select("id, kickoff_time, team_a_score, team_b_score")
      .in(
        "id",
        slots.map((s) => s.matchId),
      ),
    supabase
      .from("picks")
      .select("match_id, pred_home_score, pred_away_score")
      .eq("player_id", playerId)
      .in(
        "match_id",
        slots.map((s) => s.matchId),
      ),
  ]);
  if (matchesResult.error) throw matchesResult.error;
  if (picksResult.error) throw picksResult.error;

  const matchById = new Map((matchesResult.data ?? []).map((m) => [m.id, m]));
  const pickByMatch = new Map(
    (picksResult.data ?? []).map((p) => [p.match_id, p]),
  );

  const byGameweek = new Map<
    number,
    {
      points: number | null;
      picked: boolean;
      calledOff: boolean;
      locked: boolean;
    }[]
  >();
  for (const slot of slots) {
    const match = matchById.get(slot.matchId);
    if (!match) continue;
    // Only a locked match's pick may be counted -- this feeds a public-ish
    // control, and reading an unlocked pick here would leak the viewer's own
    // pick timing at best and set a precedent at worst.
    const locked = isMatchLocked(new Date(match.kickoff_time), now);
    const pick = locked ? pickByMatch.get(slot.matchId) : undefined;
    const scorable =
      !slot.calledOff &&
      pick !== undefined &&
      match.team_a_score !== null &&
      match.team_b_score !== null;
    const entry = {
      points: scorable
        ? scoreMatch(
            pick.pred_home_score,
            pick.pred_away_score,
            match.team_a_score as number,
            match.team_b_score as number,
          ).points
        : null,
      picked: pick !== undefined,
      calledOff: slot.calledOff,
      locked,
    };
    byGameweek.set(slot.gameweek, [
      ...(byGameweek.get(slot.gameweek) ?? []),
      entry,
    ]);
  }

  const monthFmt = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone,
  });

  return gameweeks.map((gw) => {
    const entries = byGameweek.get(gw.number as number) ?? [];
    const outcome = deriveWeekOutcome(entries);
    const firstMatchId = [gw.match_1_id, gw.match_2_id].find(
      (id): id is string => id !== null,
    );
    const kickoff = firstMatchId
      ? matchById.get(firstMatchId)?.kickoff_time
      : undefined;
    return {
      gameweek: gw.number as number,
      href: `/gameweek/${String(gw.number)}` as StripWeek["href"],
      points: outcome.kind === "scored" ? outcome.total : null,
      picked: entries.some((e) => e.picked),
      month: kickoff ? monthFmt.format(new Date(kickoff)) : "",
      // "Not played yet", not "nobody picked or scored" -- a locked-but-
      // missed gameweek was previously indistinguishable from an upcoming
      // one, which hid a real gameweek's reveal behind an unclickable
      // dashed chip on the strip.
      future: entries.length === 0 || entries.every((e) => !e.locked),
    };
  });
}
