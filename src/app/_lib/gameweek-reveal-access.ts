import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMatchLocked, picksForMatch } from "@/lib/competitions/scope";
import { tippedSlots } from "@/lib/gameweeks/tipped-slots";
import { scoreMatch } from "@/lib/scoring/match";
import { deriveWeekOutcome } from "@/lib/gameweeks/week-outcome";
import type { WeekOutcome } from "@/lib/gameweeks/week-outcome";

// DB glue for /gameweek/[n] (docs/adr/0013-match-centre-tense-and-axes.md).
// Lives outside src/lib/** for the same reason as the other _lib access
// modules: the golden-value discipline targets pure decision logic, which
// already has its own tests (week-outcome.test.ts, match.test.ts, and
// picks-for-player.test.ts for the sibling read). There is no meaningful
// golden value to assert on a Supabase round trip.
//
// The reveal itself goes through `picksForMatch`, which enforces the lock
// ITSELF rather than trusting this caller -- so a bug here cannot leak a
// pre-lock pick, only fail to show a post-lock one.

export interface RevealPick {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  homeScore: number | null;
  awayScore: number | null;
  points: number | null;
}

export interface RevealTeam {
  name: string;
  shortCode: string | null;
  leaguePosition: number | null;
}

export interface RevealMatch {
  id: string;
  provenance: "top_matchup" | "random_pick";
  kickoffUtcIso: string;
  home: RevealTeam;
  away: RevealTeam;
  homeScore: number | null;
  awayScore: number | null;
  /** Postponed after lock: tipped, but never scored, for anyone. */
  calledOff: boolean;
  locked: boolean;
  /** Empty until the match locks -- `picksForMatch` returns nothing before. */
  picks: RevealPick[];
  /** Players in this competition who filed nothing. Only meaningful once
   *  locked; bots always pick, so they never appear here. */
  noPick: RevealPick[];
}

export interface GameweekReveal {
  number: number;
  /** One entry, not two, when a slot was skipped (postponed before lock). */
  matches: RevealMatch[];
  /** Whether a Skipped Slot is why there is only one. */
  skippedSlot: boolean;
  viewerOutcome: WeekOutcome;
}

export async function loadGameweekReveal(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  viewerId: string,
  gameweekNumber: number,
  now: Date,
): Promise<GameweekReveal | null> {
  const { data: gw, error: gwError } = await supabase
    .from("gameweeks")
    .select(
      "number, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .eq("number", gameweekNumber)
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (gwError) throw gwError;
  if (!gw) return null;

  const slots = tippedSlots([gw]);
  if (slots.length === 0) return null;
  const matchIds = slots.map((s) => s.matchId);

  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, kickoff_time, team_a_score, team_b_score, team_a_id, team_b_id, " +
        "team_a:teams!matches_team_a_id_fkey(name, short_code), " +
        "team_b:teams!matches_team_b_id_fkey(name, short_code)",
    )
    .in("id", matchIds);
  if (matchError) throw matchError;

  type Row = {
    id: string;
    kickoff_time: string;
    team_a_score: number | null;
    team_b_score: number | null;
    team_a: { name: string; short_code: string | null } | null;
    team_b: { name: string; short_code: string | null } | null;
  };
  const byId = new Map(
    ((matchRows ?? []) as unknown as Row[]).map((m) => [m.id, m]),
  );

  // Both slots' reveals resolve in one wave rather than serially --
  // picksForMatch is itself several round trips deep, so awaiting it inside
  // the loop doubled the page's latency for no reason
  // (PERFORMANCE_TESTING_STANDARD.md §5).
  const revealable = slots.filter((slot) => byId.has(slot.matchId));
  const revealResults = await Promise.all(
    revealable.map((slot) =>
      picksForMatch(supabase, slot.matchId, competitionId),
    ),
  );

  const matches: RevealMatch[] = [];
  for (const [index, slot] of revealable.entries()) {
    const row = byId.get(slot.matchId)!;
    const locked = isMatchLocked(new Date(row.kickoff_time), now);
    const result = revealResults[index];

    const scored = (home: number | null, away: number | null) =>
      slot.calledOff ||
      row.team_a_score === null ||
      row.team_b_score === null ||
      home === null ||
      away === null
        ? null
        : scoreMatch(home, away, row.team_a_score, row.team_b_score).points;

    const all: RevealPick[] = result.locked
      ? result.picks.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
          emoji: p.emoji,
          isBot: p.isBot,
          homeScore: p.predHomeScore,
          awayScore: p.predAwayScore,
          points: scored(p.predHomeScore, p.predAwayScore),
        }))
      : [];

    matches.push({
      id: row.id,
      provenance: slot.provenance,
      kickoffUtcIso: row.kickoff_time,
      home: {
        name: row.team_a?.name ?? "—",
        shortCode: row.team_a?.short_code ?? null,
        leaguePosition: null,
      },
      away: {
        name: row.team_b?.name ?? "—",
        shortCode: row.team_b?.short_code ?? null,
        leaguePosition: null,
      },
      homeScore: slot.calledOff ? null : row.team_a_score,
      awayScore: slot.calledOff ? null : row.team_b_score,
      calledOff: slot.calledOff,
      locked,
      picks: all.filter((p) => p.homeScore !== null),
      noPick: all.filter((p) => p.homeScore === null && !p.isBot),
    });
  }

  const viewerOutcome = deriveWeekOutcome(
    matches.map((m) => {
      const own = m.picks.find((p) => p.playerId === viewerId);
      return {
        points: own?.points ?? null,
        picked: own !== undefined,
        calledOff: m.calledOff,
      };
    }),
  );

  return {
    number: gw.number as number,
    matches,
    skippedSlot: slots.length === 1,
    viewerOutcome,
  };
}
