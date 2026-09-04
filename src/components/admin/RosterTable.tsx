"use client";

import { useEffect, useMemo, useState } from "react";
import type { RosterPlayer } from "@/app/_lib/admin-roster-access";
import { formatCountdown } from "@/lib/dates/kickoff-format";
import {
  matchesRosterFilter,
  playerIsNotTipped,
  playerNeedsAttention,
  sortRoster,
  type RosterFilter,
  type RosterSort,
} from "@/components/admin/roster-filter";
import { EmojiChip } from "@/components/ui/PlayerChip";
import { CARD_SHADOW, FOCUS, MICRO_LABEL, T, TX } from "@/components/ui/tokens";

// The /admin/players roster (docs/admin-ui-spec.md §6.1). Read-only in this
// issue -- a row is a plain non-interactive card; the detail panel and its
// actions are Phase 3.
//
// A card list, not a reflowing <table>: the realistic use is a parent on a
// phone mid-Saturday (spec §11). Scannability comes from ink WEIGHT, not
// colour (docs/DESIGN_SYSTEM.md -> "Those use ink weight, not colour"): the
// join date is faint, the two things an admin acts on -- an unfiled pick
// and a missing email -- are the darkest, boldest text on the row, so a
// player who needs chasing stands out of a wall of settled rows.
//
// The `Disabled` badge and its filter chip are intentionally absent:
// `players.disabled_at` does not exist until the Phase 3 migration.

export type { RosterFilter };

const FILTERS: { key: RosterFilter; label: string; counted?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "humans", label: "Humans" },
  { key: "bots", label: "Bots" },
  { key: "not-tipped", label: "Not tipped", counted: true },
  { key: "attention", label: "Needs attention", counted: true },
];

const SORTS: { key: RosterSort; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "newest", label: "Newest" },
];

function picksLabel(
  count: number | null,
  tippedMatchCount: number | null,
): string {
  if (count === null || tippedMatchCount === null) return "—";
  if (count === 0) return "no picks";
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

/** Structural identity (Admin, Bot) -- filled. */
function IdBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-badge bg-info px-1.5 py-0.5 ${MICRO_LABEL} text-on-ink`}
    >
      {children}
    </span>
  );
}

/** Informational only (Late joiner) -- outline, quieter than an IdBadge. */
function NoteBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-badge border border-text-decorative px-1.5 py-0.5 ${MICRO_LABEL} ${TX.muted}`}
    >
      {children}
    </span>
  );
}

/** A caution state (lockout, PIN reset) -- warning fill (DESIGN_SYSTEM.md). */
function Marker({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-badge bg-warning px-1.5 py-0.5 ${MICRO_LABEL} text-ink`}
    >
      {children}
    </span>
  );
}

function MetaBit({
  children,
  actionable,
}: {
  children: React.ReactNode;
  actionable?: boolean;
}) {
  return (
    <span className={actionable ? `font-semibold ${TX.base}` : TX.decorative}>
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
  const notTipped = playerIsNotTipped(player);
  const picks = picksLabel(player.currentGameweekPickCount, tippedMatchCount);

  return (
    <li
      className={`flex flex-col gap-1.5 rounded-card border border-paper-line bg-white p-3 ${CARD_SHADOW}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <EmojiChip emoji={player.emoji} size="sm" muted={player.isBot} />
        <span className={`${T.dense} font-extrabold ${TX.base}`}>
          {player.displayName}
        </span>
        {player.isAdmin ? <IdBadge>Admin</IdBadge> : null}
        {player.isBot ? <IdBadge>Bot</IdBadge> : null}
        {player.isLateJoiner ? <NoteBadge>Late joiner</NoteBadge> : null}
      </div>

      <div className={`flex flex-wrap gap-x-2.5 gap-y-0.5 ${T.caption}`}>
        <MetaBit>Joined {joinedLabel(player.joinedAt, timeZone)}</MetaBit>
        {player.isBot ? null : (
          <MetaBit actionable={notTipped}>{picks}</MetaBit>
        )}
        <MetaBit actionable={!player.hasEmail}>
          {player.hasEmail ? "email on file" : "no email"}
        </MetaBit>
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
  const [sort, setSort] = useState<RosterSort>("name");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(
    () => ({
      "not-tipped": players.filter(playerIsNotTipped).length,
      attention: players.filter(playerNeedsAttention).length,
    }),
    [players],
  );

  const visible = useMemo(
    () =>
      sortRoster(
        players.filter((p) => matchesRosterFilter(p, filter)),
        sort,
      ),
    [players, filter, sort],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 self-start rounded-btn bg-paper-line/40 p-1">
        {FILTERS.map((option) => {
          const active = option.key === filter;
          const count = option.counted
            ? counts[option.key as "not-tipped" | "attention"]
            : null;
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
              {count !== null && count > 0 ? (
                <span className="ml-1 tabular-nums">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className={`flex items-center gap-2 self-start ${T.caption} ${TX.muted}`}
      >
        <span className={MICRO_LABEL}>Sort</span>
        {SORTS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={option.key === sort}
            onClick={() => setSort(option.key)}
            className={`rounded-btn-sm px-1.5 py-0.5 font-bold transition ${FOCUS} ${
              option.key === sort ? TX.base : "text-text-decorative"
            }`}
          >
            {option.label}
          </button>
        ))}
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
