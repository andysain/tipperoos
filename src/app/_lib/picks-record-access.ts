import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { picksForPlayer } from "@/lib/competitions/scope";
import { scoreMatch } from "@/lib/scoring/match";
import { deriveWeekOutcome } from "@/lib/gameweeks/week-outcome";
import type { WeekOutcome } from "@/lib/gameweeks/week-outcome";
import type { PickLine } from "@/components/gameweek/PicksTable";

/**
 * DB glue for /picks/[playerId].
 *
 * Every pick here comes through `picksForPlayer`, which resolves locked
 * Tipped Matches first and blanks anything unlocked before the row leaves
 * that module -- so this loader has no way to leak a pre-lock pick even if
 * it wanted to (docs/adr/0013-match-centre-tense-and-axes.md D10).
 */
export interface RecordWeek {
  gameweek: number;
  dateLabel: string;
  lines: PickLine[];
  outcome: WeekOutcome;
}

export interface PicksRecord {
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  joinedGameweek: number | null;
  total: number;
  weeks: RecordWeek[];
}

export async function loadPicksRecord(
  supabase: SupabaseClient,
  viewerCompetitionId: string,
  seasonId: string,
  playerId: string,
  now: Date,
): Promise<PicksRecord | null> {
  // Scoped to the VIEWER's competition, so a player id from another
  // competition resolves to nothing rather than to someone else's season.
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("display_name, emoji, is_bot")
    .eq("id", playerId)
    .eq("competition_id", viewerCompetitionId)
    .maybeSingle();
  if (playerError) throw playerError;
  if (!player) return null;

  const rows = await picksForPlayer(
    supabase,
    playerId,
    viewerCompetitionId,
    seasonId,
    now,
  );

  const teamIds = [
    ...new Set(rows.flatMap((r) => [r.homeTeamId, r.awayTeamId])),
  ];
  const { data: teams, error: teamError } = teamIds.length
    ? await supabase.from("teams").select("id, short_code").in("id", teamIds)
    : { data: [], error: null };
  if (teamError) throw teamError;
  const codeById = new Map((teams ?? []).map((t) => [t.id, t.short_code]));

  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  const byGameweek = new Map<number, typeof rows>();
  for (const row of rows) {
    byGameweek.set(row.gameweekNumber, [
      ...(byGameweek.get(row.gameweekNumber) ?? []),
      row,
    ]);
  }

  const weeks: RecordWeek[] = [...byGameweek.entries()]
    // A gameweek with nothing locked has no place on a picks record: there
    // is nothing to show, and `picksForPlayer` correctly blanks its picks --
    // which used to make every unlocked week report `picked: false` and so
    // render as "You missed this one", accusing a player of skipping a week
    // they had already filed. That is verbatim the failure deriveWeekOutcome
    // exists to prevent, reintroduced at the call site.
    //
    // Dropping them also stops the week heading linking to a route that
    // 404s: /gameweek/[n] deliberately does not exist until a match locks
    // (ADR 0013 D6), so a listed-but-unlocked week was a guaranteed dead
    // link. A HALF-locked week is kept -- it has something real to show.
    .filter(([, groupRows]) => groupRows.some((row) => row.locked))
    .sort(([a], [b]) => b - a)
    .map(([gameweek, groupRows]) => {
      const entries = groupRows.map((row) => {
        const scorable =
          !row.calledOff &&
          row.resultHome !== null &&
          row.resultAway !== null &&
          row.predHomeScore !== null &&
          row.predAwayScore !== null;
        return {
          row,
          points: scorable
            ? scoreMatch(
                row.predHomeScore,
                row.predAwayScore,
                row.resultHome as number,
                row.resultAway as number,
              ).points
            : null,
        };
      });

      return {
        gameweek,
        dateLabel: dateFmt.format(new Date(groupRows[0].kickoffTime)),
        lines: entries.map(({ row, points }) => ({
          key: row.matchId,
          homeCode: codeById.get(row.homeTeamId) ?? null,
          awayCode: codeById.get(row.awayTeamId) ?? null,
          locked: row.locked,
          calledOff: row.calledOff,
          pick:
            row.predHomeScore !== null && row.predAwayScore !== null
              ? { home: row.predHomeScore, away: row.predAwayScore }
              : null,
          result:
            row.resultHome !== null && row.resultAway !== null
              ? { home: row.resultHome, away: row.resultAway }
              : null,
          points,
        })),
        outcome: deriveWeekOutcome(
          entries.map(({ row, points }) => ({
            points,
            // Only meaningful once locked: before that the pick is blanked
            // upstream, so "no pick" would be a statement about the lock,
            // not about the player.
            picked: row.locked && row.predHomeScore !== null,
            calledOff: row.calledOff,
          })),
        ),
      };
    });

  const total = weeks.reduce(
    (sum, w) => sum + (w.outcome.kind === "scored" ? w.outcome.total : 0),
    0,
  );

  // A Late Joiner's record starts where they do -- ADR 0012 D3 works hard to
  // stop absence reading as poor form, and a dozen rows of "no pick" for
  // weeks they couldn't have played undoes all of it. `picksForPlayer`
  // returns every gameweek in the season, so the boundary is derived from
  // the earliest week they actually have a pick in.
  const earliestPicked = weeks
    .filter((w) => w.lines.some((l) => l.pick !== null))
    .map((w) => w.gameweek)
    .sort((a, b) => a - b)[0];
  const firstGameweek = weeks[weeks.length - 1]?.gameweek ?? 1;
  const joinedGameweek =
    earliestPicked !== undefined && earliestPicked > firstGameweek
      ? earliestPicked
      : null;

  return {
    displayName: player.display_name,
    emoji: player.emoji,
    isBot: player.is_bot,
    joinedGameweek,
    total,
    weeks: joinedGameweek
      ? weeks.filter((w) => w.gameweek >= joinedGameweek)
      : weeks,
  };
}
