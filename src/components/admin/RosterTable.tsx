"use client";

import { useEffect, useMemo, useState } from "react";
import type { RosterPlayer } from "@/app/_lib/admin-roster-access";
import { formatCountdown } from "@/lib/dates/kickoff-format";
import {
  matchesRosterFilter,
  type RosterFilter,
} from "@/components/admin/roster-filter";
import { EmojiChip } from "@/components/ui/PlayerChip";
import { CARD_SHADOW, FOCUS, MICRO_LABEL, T, TX } from "@/components/ui/tokens";

// The /admin/players roster (docs/admin-ui-spec.md §6.1). Read-only in this
// issue -- tapping a row opens nothing yet; the detail panel and its
// actions are Phase 3, so a row is a plain non-interactive card.
//
// A card list, not a reflowing <table>: the realistic use is a parent on a
// phone mid-Saturday (spec §11), and every other list in this app
// (leaderboard, reveal) is built the same way. The one client-side concern
// is the filter chips and the minute-ticking lockout countdown.
//
// The `Disabled` badge and its filter chip are intentionally absent:
// `players.disabled_at` does not exist until the Phase 3 migration (issue
// decision 1). The chip set is All / Humans / Bots / Needs attention.

export type { RosterFilter };

const FILTERS: { key: RosterFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "humans", label: "Humans" },
  { key: "bots", label: "Bots" },
  { key: "attention", label: "Needs attention" },
];

function picksLabel(
  count: number | null,
  tippedMatchCount: number | null,
): string {
  if (count === null || tippedMatchCount === null) return "—";
  if (count === 0) return "none";
  return `${count} of ${tippedMatchCount}`;
}

/** e.g. "3 Sep 2026", in the viewer's resolved timezone. */
function joinedLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** e.g. "14:32", in the viewer's resolved timezone. */
function lockClockLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-badge bg-info px-1.5 py-0.5 ${MICRO_LABEL} text-on-ink`}
    >
      {children}
    </span>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-badge bg-warning px-1.5 py-0.5 ${MICRO_LABEL} text-ink`}
    >
      {children}
    </span>
  );
}

function PlayerCard({
  player,
  tippedMatchCount,
  timeZone,
  nowMs,
}: {
  player: RosterPlayer;
  tippedMatchCount: number | null;
  timeZone: string;
  nowMs: number;
}) {
  return (
    <li
      className={`flex flex-col gap-2 rounded-card border border-paper-line bg-white p-3.5 ${CARD_SHADOW}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <EmojiChip emoji={player.emoji} size="sm" muted={player.isBot} />
        <span className={`${T.dense} font-extrabold ${TX.base}`}>
          {player.displayName}
        </span>
        {player.isAdmin ? <Badge>Admin</Badge> : null}
        {player.isBot ? <Badge>Bot</Badge> : null}
        {player.isLateJoiner ? <Badge>Late joiner</Badge> : null}
      </div>

      <div
        className={`flex flex-wrap gap-x-3 gap-y-0.5 ${T.caption} ${TX.muted}`}
      >
        <span>Joined {joinedLabel(player.joinedAt, timeZone)}</span>
        <span>
          Picks:{" "}
          <span className={TX.base}>
            {picksLabel(player.currentGameweekPickCount, tippedMatchCount)}
          </span>
        </span>
        <span>{player.hasEmail ? "Email on file" : "No email"}</span>
      </div>

      {player.lockedUntil !== null || player.pinResetRequired ? (
        <div className="flex flex-wrap gap-1.5">
          {player.lockedUntil !== null ? (
            <Marker>
              Locked until {lockClockLabel(player.lockedUntil, timeZone)} ·{" "}
              {formatCountdown(player.lockedUntil, nowMs)} left
            </Marker>
          ) : null}
          {player.pinResetRequired ? <Marker>PIN reset pending</Marker> : null}
        </div>
      ) : null}
    </li>
  );
}

export function RosterTable({
  players,
  tippedMatchCount,
  timeZone,
  initialFilter = "all",
}: {
  players: readonly RosterPlayer[];
  tippedMatchCount: number | null;
  timeZone: string;
  initialFilter?: RosterFilter;
}) {
  const [filter, setFilter] = useState<RosterFilter>(initialFilter);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(
    () => players.filter((p) => matchesRosterFilter(p, filter)),
    [players, filter],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 self-start rounded-btn bg-paper-line/40 p-1">
        {FILTERS.map((option) => {
          const active = option.key === filter;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.key)}
              className={`rounded-btn-sm px-3 py-1.5 ${T.caption} font-bold transition ${FOCUS} ${
                active ? "bg-ink text-on-ink" : "text-text-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className={`${T.caption} ${TX.muted} px-1`}>
          No players match this filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              tippedMatchCount={tippedMatchCount}
              timeZone={timeZone}
              nowMs={nowMs}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
