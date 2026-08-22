import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { getCurrentSeasonId } from "@/app/_lib/gameweek-access";
import { loadPicksRecord } from "@/app/_lib/picks-record-access";
import { resolveCompetitionId } from "@/lib/competitions/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EmojiChip } from "@/components/ui/PlayerChip";
import {
  PicksLegend,
  PicksRow,
  WeekHeading,
} from "@/components/gameweek/PicksTable";
import { CardShell } from "@/components/ui/CardShell";
import { T, TX, LABEL, INSET, FOCUS } from "@/components/ui/tokens";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";

// The player axis (docs/adr/0013-match-centre-tense-and-axes.md D7/D9): a
// picks RECORD, not a profile. Emoji, display name, picks, points -- and
// nothing else. No rank, no streaks, no charts, no head-to-head; both
// profiles and analytics pages are out of scope in CLAUDE.md, and this is
// the surface that drifts toward them if a stat is ever added "just here".
export const dynamic = "force-dynamic";

export default async function PicksRecordPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  const viewerId = await getSessionPlayerId();
  if (!viewerId) redirect("/login");

  const supabase = createServerSupabaseClient();
  const competitionId = await resolveCompetitionId(supabase, viewerId);
  if (!competitionId) redirect("/login");

  const seasonId = await getCurrentSeasonId(supabase);
  if (!seasonId) notFound();

  const cookieStore = await cookies();
  const timeZone =
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;

  const record = await loadPicksRecord(
    supabase,
    competitionId,
    seasonId,
    playerId,
    viewerId,
    new Date(),
    timeZone,
  );
  if (!record) notFound();

  const isViewer = playerId === viewerId;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <Link
        href="/leaderboard"
        className={`-ml-2 flex min-h-11 w-fit items-center gap-0.5 rounded-btn-sm px-2 ${T.caption} font-bold ${TX.muted} hover:bg-ink/5 ${FOCUS}`}
      >
        <ChevronLeft className="size-4" aria-hidden />
        Leaderboard
      </Link>

      <h1 className={`${T.h1} font-extrabold leading-tight text-text`}>
        Picks
      </h1>

      <CardShell className="bg-surface">
        <div className={`flex items-center gap-3 bg-ink ${INSET} py-3.5`}>
          <EmojiChip emoji={record.emoji} muted={record.isBot} />
          <span className={`flex-1 ${T.body} font-bold text-on-ink`}>
            {isViewer ? "Your picks" : `${record.displayName}'s picks`}
          </span>
          <span className="flex flex-col items-end leading-none">
            <span className="text-[1.75rem] font-extrabold tabular-nums text-on-ink">
              {record.total}
            </span>
            <span className={`${LABEL} text-on-ink-muted`}>points</span>
          </span>
        </div>
      </CardShell>

      {record.weeks.length === 0 ? (
        <p className={`${T.caption} ${TX.muted}`}>
          No gameweeks have been played yet.
        </p>
      ) : (
        <CardShell className="bg-surface">
          {/* Sticky: the legend is what stops `1–0  0–1` being read the wrong
              way round, and it used to scroll out of view after the first
              screenful of a season-length card -- gone for most of the thing
              it disambiguates. */}
          <div
            className={`sticky top-0 z-10 border-b border-paper-line bg-surface ${INSET} py-1.5`}
          >
            <PicksLegend />
          </div>

          <ol className="flex flex-col bg-surface">
            {record.weeks.map((week) => (
              <li key={week.gameweek}>
                {/* Heading-only tap target. A full-width button repeated
                    thirty-eight times down a long scroll means a scroll that
                    ends in a slight tap navigates away from the position the
                    reader just worked to reach. */}
                <Link
                  href={`/gameweek/${String(week.gameweek)}`}
                  className={`flex w-full flex-col border-t border-paper-line ${INSET} py-2 first:border-t-0 ${FOCUS}`}
                >
                  <WeekHeading
                    gameweek={week.gameweek}
                    dateLabel={week.dateLabel}
                    outcome={week.outcome}
                    chevron
                    owner={isViewer ? undefined : record.displayName}
                  />
                </Link>
                <ul className={`flex flex-col gap-1 ${INSET} pb-2.5`}>
                  {week.lines.map((line) => (
                    <PicksRow key={line.key} line={line} />
                  ))}
                </ul>
                {week.lines.some((l) => l.calledOff) ? (
                  <p className={`${INSET} pb-2.5 ${LABEL} ${TX.muted}`}>
                    Called off after picks closed — nobody scored on this one.
                  </p>
                ) : null}
              </li>
            ))}
          </ol>

          {record.joinedGameweek ? (
            <p
              className={`border-t border-paper-line bg-surface ${INSET} py-2.5 ${LABEL} ${TX.muted}`}
            >
              Joined at Gameweek {record.joinedGameweek}.
            </p>
          ) : null}
        </CardShell>
      )}
    </main>
  );
}
