// PROTOTYPE VARIANT T -- "Tightened". Throwaway. The refinement pass on B3.
//
// Changes from B3:
//  - Movement moves into the RANK column, stacked directly under the numeral.
//    Rank and "how that rank changed" are one fact, so they now read as one
//    unit; it also frees the name line entirely, which was the only place
//    long display names could collide with a badge.
//  - The stacked rank column costs no height: it fits inside the avatar's
//    own 36px, so the card is still one line tall.
//  - Points and per-week share a baseline instead of stacking.
//  - A Bot's reserved (rank-less) column carries BOT, retiring the separate
//    "Bot" chip from the name line -- one mark instead of two.
//  - Own-row findability is a solid accent stripe on the card's left edge.
//    An earlier pass tinted the emoji chip instead and was rejected: the
//    emoji is the player's chosen identity, and recolouring it puts the
//    app's palette on top of the one element that's meant to be theirs.
//
// Everything else is B3: tap opens the stat panel, one card open at a time.
//
// Now also carries the SEGMENTED CONTROL (ADR 0012 D1) with the Predict the
// Table board as the second segment -- see TableBoard.tsx. In the real
// build that segment is absent until #157 lands; it's shown here to check
// the shared row grammar actually holds across both.

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DAY_ONE_TABLE_ROWS,
  TABLE_ROWS,
  movement,
  perWeek,
  type ProtoRow,
} from "./fixture";
import { TableBoard } from "./TableBoard";

/** Rank numeral with its own movement underneath -- one unit, not two. */
export function RankUnit({ row, dayOne }: { row: ProtoRow; dayOne: boolean }) {
  const delta = movement(row);
  if (dayOne) return <span className="w-7 shrink-0" />;

  // A Bot has no rank (ADR 0012 D12), so the reserved column carries the
  // BOT label instead of sitting empty -- which also retires the separate
  // "Bot" chip from the name line. One mark, in the column whose whole job
  // is "where does this player stand", saying "this one doesn't".
  if (row.rank === null) {
    return (
      <span className="flex w-7 shrink-0 items-center justify-center">
        <span className="text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-info">
          Bot
        </span>
      </span>
    );
  }

  return (
    <span className="flex w-7 shrink-0 flex-col items-center leading-none">
      <span className="text-lg font-extrabold tabular-nums text-ink/75">
        {row.rank}
      </span>
      {delta === null ? (
        <span className="mt-0.5 text-[0.55rem] font-bold uppercase text-info">
          new
        </span>
      ) : delta === 0 ? (
        <span
          className="mt-0.5 text-[0.6rem] font-bold text-ink/25"
          aria-hidden
        >
          –
        </span>
      ) : (
        <span
          className={`mt-0.5 text-[0.6rem] font-bold tabular-nums ${
            delta > 0 ? "text-success" : "text-danger"
          }`}
          aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} places`}
        >
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-1 flex-col items-center rounded-btn bg-paper px-2 py-1.5">
      <span className="text-base font-extrabold tabular-nums text-ink">
        {value}
      </span>
      <span className="text-[0.6rem] font-bold uppercase tracking-[0.06em] text-ink/50">
        {label}
      </span>
    </span>
  );
}

export function CompactRow({
  row,
  dayOne,
  open,
  onToggle,
}: {
  row: ProtoRow;
  dayOne: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const first = !dayOne && row.rank === 1;
  const muted = row.ineligible !== null;

  return (
    <li
      className={`relative overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
        first ? "bg-accent/20" : "bg-white"
      } ${muted ? "opacity-70" : ""}`}
    >
      {/* Own-row findability: a solid accent edge on the card itself, so a
          player scans one column of card edges rather than reading names.
          Still reads on the 1st-place row, where the row tint is only 20%
          accent and this is 100%. Delete this one element to drop it. */}
      {row.isYou ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      ) : null}
      <button
        type="button"
        disabled={dayOne}
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <RankUnit row={row} dayOne={dayOne} />

        {/* The chip stays neutral -- the player's own emoji is their
            identity, and tinting it made the app's colour language the
            loudest thing about it. Own-row findability moved to the card's
            left edge instead (see the stripe on the <li>). */}
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${
            muted ? "bg-info/10" : "bg-paper"
          }`}
          aria-hidden
        >
          {row.emoji}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate font-bold text-ink">{row.displayName}</span>
          {row.isYou ? (
            <span className="shrink-0 rounded-badge bg-accent px-1.5 py-0.5 text-[0.6rem] font-extrabold text-accent-ink">
              You
            </span>
          ) : null}
        </span>

        {!dayOne ? (
          <>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-xl font-extrabold leading-none tabular-nums text-ink">
                {row.points}
              </span>
              <span className="text-[0.7rem] leading-none tabular-nums text-ink/45">
                {perWeek(row)}/wk
              </span>
            </span>
            <ChevronDown
              className={`size-4 shrink-0 stroke-ink/35 transition-transform ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </>
        ) : null}
      </button>

      {open && !dayOne ? (
        <div className="flex gap-1.5 border-t border-paper-line px-3 py-2.5">
          <Stat value={String(row.exactTips)} label="Spot on" />
          <Stat
            value={`${row.correctResults}/${row.matchesScored}`}
            label="Right result"
          />
          <Stat value={perWeek(row) ?? "–"} label="Per week" />
        </div>
      ) : null}
    </li>
  );
}

/** Two-segment control. In the real build this renders nothing at all
 * while there's only one segment to show (ADR 0012 D1). */
function Segments({
  value,
  onChange,
}: {
  value: "season" | "table";
  onChange: (next: "season" | "table") => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Leaderboard"
      className="flex gap-1 rounded-badge bg-ink/5 p-1"
    >
      {(
        [
          ["season", "Season"],
          ["table", "Predict the Table"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          role="tab"
          type="button"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`flex-1 rounded-badge px-3 py-1.5 text-sm font-bold transition-colors ${
            value === key
              ? "bg-white text-ink shadow-[0_2px_6px_-2px_rgba(18,60,67,0.25)]"
              : "text-ink/55"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function VariantT({
  rows,
  dayOne,
}: {
  rows: ProtoRow[];
  dayOne: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [segment, setSegment] = useState<"season" | "table">("season");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>

      <Segments value={segment} onChange={setSegment} />

      {segment === "table" ? (
        <TableBoard
          rows={dayOne ? DAY_ONE_TABLE_ROWS : TABLE_ROWS}
          dayOne={dayOne}
        />
      ) : (
        <>
          {dayOne ? (
            <p className="text-sm text-ink/70">
              No points yet — the season starts here. Everyone below is in.
            </p>
          ) : null}

          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <CompactRow
                key={row.playerId}
                row={row}
                dayOne={dayOne}
                open={openId === row.playerId}
                onToggle={() =>
                  setOpenId(openId === row.playerId ? null : row.playerId)
                }
              />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
