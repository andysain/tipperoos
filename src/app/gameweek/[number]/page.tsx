import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getCurrentSeasonId,
  resolveCurrentGameweekForCompetition,
} from "@/app/_lib/gameweek-access";
import { loadGameweekReveal } from "@/app/_lib/gameweek-reveal-access";
import { loadGameweekStrip } from "@/app/_lib/gameweek-strip-access";
import { resolveCompetitionId } from "@/lib/competitions/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RevealCard } from "@/components/gameweek/RevealCard";
import { GameweekStrip } from "@/components/gameweek/GameweekStrip";
import { T, TX, FOCUS } from "@/components/ui/tokens";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";

// Match Centre is a TENSE, not a destination: this is the Pick Board's past
// tense (docs/adr/0013-match-centre-tense-and-axes.md D1). Derived per
// request for the same reason `/` and `/leaderboard` are -- two surfaces
// disagreeing about the same gameweek is a trust bug.
export const dynamic = "force-dynamic";

export default async function GameweekPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const gameweekNumber = Number(number);
  if (!Number.isInteger(gameweekNumber) || gameweekNumber < 1) notFound();

  const playerId = await getSessionPlayerId();
  if (!playerId) redirect("/login");

  const supabase = createServerSupabaseClient();
  const competitionId = await resolveCompetitionId(supabase, playerId);
  if (!competitionId) redirect("/login");

  const seasonId = await getCurrentSeasonId(supabase);
  if (!seasonId) notFound();

  const now = new Date();
  const cookieStore = await cookies();
  const timeZone =
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;

  const [reveal, currentGameweek] = await Promise.all([
    loadGameweekReveal(
      supabase,
      competitionId,
      seasonId,
      playerId,
      gameweekNumber,
      now,
    ),
    resolveCurrentGameweekForCompetition(
      supabase,
      competitionId,
      now,
      seasonId,
    ),
  ]);
  if (!reveal) notFound();

  // A gameweek page exists only once its matches have locked (ADR 0013 D6):
  // before that the Pick Board is the whole story, and there is nothing here
  // to show that wouldn't breach pre-lock secrecy.
  if (reveal.matches.every((m) => !m.locked)) notFound();

  const strip = await loadGameweekStrip(
    supabase,
    competitionId,
    seasonId,
    playerId,
    now,
  );

  const latest = currentGameweek ?? gameweekNumber;
  const prev = gameweekNumber - 1;
  const next = gameweekNumber + 1;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <Link
        href="/"
        className={`-ml-2 flex min-h-11 w-fit items-center gap-0.5 rounded-btn-sm px-2 ${T.caption} font-bold ${TX.muted} hover:bg-ink/5 ${FOCUS}`}
      >
        <ChevronLeft className="size-4" aria-hidden />
        Pick Board
      </Link>

      <h1 className={`${T.h1} font-extrabold leading-tight text-text`}>
        Gameweek {reveal.number}
      </h1>

      <GameweekStrip
        active={reveal.number}
        weeks={strip}
        hrefFor={(gw) => `/gameweek/${String(gw)}`}
      />

      {reveal.matches.map((match) => (
        <RevealCard
          key={match.id}
          match={match}
          viewerId={playerId}
          timeZone={timeZone}
        />
      ))}

      {reveal.skippedSlot ? (
        <p className={`px-1 ${T.caption} ${TX.muted}`}>
          Only one match this week — the other was called off before picks
          opened.
        </p>
      ) : null}

      {/* Navigation at the BOTTOM, where reading ends and the thumb already
          is. With it only at the top, finishing the second match meant
          scrolling back two and a half screens to move a week. Naming the
          destination beats a bare chevron and costs one line. */}
      <nav className="flex items-center justify-between gap-2">
        {prev >= 1 ? (
          <Link
            href={`/gameweek/${String(prev)}`}
            className={`flex min-h-11 items-center gap-1 rounded-btn-sm px-2 ${T.caption} font-bold ${TX.muted} ${FOCUS}`}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Gameweek {prev}
          </Link>
        ) : (
          <span />
        )}
        {next <= latest ? (
          <Link
            href={`/gameweek/${String(next)}`}
            className={`flex min-h-11 items-center gap-1 rounded-btn-sm px-2 ${T.caption} font-bold ${TX.muted} ${FOCUS}`}
          >
            Gameweek {next}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
