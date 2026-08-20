import { Flame, Shuffle } from "lucide-react";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import {
  CardShell,
  CardShellHeader,
  CardShellSeam,
} from "@/components/ui/CardShell";
import { StatusChip } from "@/components/ui/StatusChip";
import { PlayerChip } from "@/components/ui/PlayerChip";
import { Points } from "@/components/ui/Points";
import { T, TX, LABEL, INSET } from "@/components/ui/tokens";
import { matchBadgeColors } from "@/lib/teams/kit-colors";
import { clusterPicks, isWrongWayRound } from "@/lib/gameweeks/cluster-picks";
import { formatKickoffInTimeZone } from "@/lib/dates/kickoff-format";
import type { RevealMatch } from "@/app/_lib/gameweek-reveal-access";

/**
 * One tipped match, with everyone's picks.
 *
 * Clusters, not a row per player (`docs/adr/0013` D13). The scoreline in each
 * cluster is a FACT and is always full-strength: the verdict is already
 * carried twice on the row (the points value, and the tint on the correct
 * one), and tinting the scoreline as well pushed a real scoreline several
 * players submitted down to decorative contrast.
 */
export function RevealCard({
  match,
  viewerId,
  timeZone,
}: {
  match: RevealMatch;
  viewerId: string;
  timeZone: string;
}) {
  const badges = matchBadgeColors(match.home.shortCode, match.away.shortCode);
  const clusters = clusterPicks(match.picks, viewerId);
  const Icon = match.provenance === "top_matchup" ? Flame : Shuffle;
  const settled = match.homeScore !== null && match.awayScore !== null;
  const chip = match.calledOff ? "called_off" : settled ? "final" : "locked";

  return (
    <CardShell className="bg-surface">
      <CardShellHeader className={INSET}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`flex items-center gap-1.5 ${T.caption} ${TX.onInkMuted}`}
          >
            <span className="inline-flex items-center gap-1 font-bold">
              <Icon className="size-[0.9em]" aria-hidden />
              {match.provenance === "top_matchup"
                ? "Top matchup"
                : "Random pick"}
            </span>
            <span aria-hidden>·</span>
            <span>
              {formatKickoffInTimeZone(match.kickoffUtcIso, timeZone)}
            </span>
          </span>
          <StatusChip state={chip} />
        </div>

        <div className="flex flex-col gap-1">
          <TeamRow
            team={match.home}
            fill={badges.home}
            score={match.homeScore}
          />
          <TeamRow
            team={match.away}
            fill={badges.away}
            score={match.awayScore}
          />
        </div>
      </CardShellHeader>
      <CardShellSeam
        segments={[{ fill: badges.home }, { fill: badges.away }]}
      />

      {match.calledOff ? (
        <p className={`bg-surface ${INSET} py-3 ${T.caption} ${TX.muted}`}>
          Called off after picks closed — nobody scored on this one.
          Everyone&apos;s picks are still below.
        </p>
      ) : !settled ? (
        <p className={`bg-surface ${INSET} py-3 ${T.caption} ${TX.muted}`}>
          Everyone&apos;s in. Picks are closed — kick-off is{" "}
          {formatKickoffInTimeZone(match.kickoffUtcIso, timeZone)}.
        </p>
      ) : null}

      {/* Direction is stated, not implied. The header states it vertically
          and the clusters state it inline, so a reader has to rotate the axis
          -- and a Wrong Way Round pick is the one case where reading it
          backwards inverts the meaning entirely. */}
      <div
        className={`flex items-baseline justify-between border-b border-paper-line bg-surface ${INSET} py-1.5 ${LABEL} ${TX.decorative}`}
      >
        <span>
          {match.home.shortCode} (home) v {match.away.shortCode}
        </span>
        <span>who picked it</span>
      </div>

      <ul className="flex flex-col divide-y divide-paper-line bg-surface">
        {clusters.map((cluster) => {
          const hit =
            settled &&
            cluster.homeScore === match.homeScore &&
            cluster.awayScore === match.awayScore;
          const mine = cluster.members.some((m) => m.playerId === viewerId);
          const wwr = isWrongWayRound(
            cluster.homeScore,
            cluster.awayScore,
            match.homeScore,
            match.awayScore,
          );
          return (
            <li
              key={`${cluster.homeScore}-${cluster.awayScore}`}
              className={`relative flex gap-3 ${INSET} py-3 ${hit ? "bg-success/10" : ""}`}
            >
              {/* Own-row findability is the accent stripe, the treatment ADR
                  0012 D7 settled for exactly this problem -- and inside the
                  budget, because this row IS the player's own predicted
                  scoreline. */}
              {mine ? (
                <span
                  className="absolute inset-y-0 left-0 w-1 bg-accent"
                  aria-hidden
                />
              ) : null}
              <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                <span
                  className={`${T.score} font-extrabold leading-none tabular-nums text-text`}
                >
                  {cluster.homeScore}–{cluster.awayScore}
                </span>
                <Points points={cluster.points} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <ul className="flex flex-wrap items-start gap-1.5">
                  {cluster.members.map((m) => (
                    <li key={m.playerId}>
                      <PlayerChip
                        emoji={m.emoji}
                        name={m.displayName}
                        tone={
                          m.playerId === viewerId
                            ? "you"
                            : m.isBot
                              ? "bot"
                              : "human"
                        }
                      />
                    </li>
                  ))}
                </ul>
                {wwr ? (
                  <span className={`${T.label} ${TX.muted}`}>
                    Wrong way round! It finished {match.homeScore}–
                    {match.awayScore}. That&apos;s worth a point.
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* One warm sentence, not a wall of avatars under a "NO PICK" heading.
          Naming non-filers is a nudge PRE-lock, where it has an action
          attached; this is the permanent, deep-linked archive. */}
      {match.noPick.length > 0 ? (
        <p className={`bg-surface ${INSET} py-2.5 ${T.label} ${TX.muted}`}>
          No pick from {formatNames(match.noPick.map((p) => p.displayName))}{" "}
          this week.
        </p>
      ) : null}
    </CardShell>
  );
}

function TeamRow({
  team,
  fill,
  score,
}: {
  team: RevealMatch["home"];
  fill: string;
  score: number | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <ClubCodeBadge shortCode={team.shortCode} fill={fill} />
      <span
        className={`min-w-0 flex-1 truncate ${T.body} font-bold text-on-ink`}
      >
        {team.name}
      </span>
      {score !== null ? (
        <span
          className={`shrink-0 ${T.score} font-extrabold leading-none tabular-nums text-on-ink`}
        >
          {score}
        </span>
      ) : null}
    </div>
  );
}

function formatNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
