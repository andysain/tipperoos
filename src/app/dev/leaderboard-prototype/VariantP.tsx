// PROTOTYPE VARIANT P -- "Podium". Throwaway. Out-there option 1.
//
// Bet: a leaderboard's emotional payload is concentrated at the very top,
// and a flat list of 16 identical cards spends none of it. The top three
// break out into a podium block -- 2nd / 1st / 3rd, 1st raised -- and
// everyone else runs as the tightened compact row beneath, under a heading
// that names what that section actually is.
//
// The tension worth judging: docs/DESIGN_SYSTEM.md says celebration is
// TIERED, with the season-winner reveal earning the big moment. A permanent
// podium may spend that budget every week and leave nothing for the end of
// the season. It also makes a rank tie awkward -- Andy and Marcus both sit
// 3rd here, so the podium has to pick one, and it picks neither (see the
// shared plinth).

"use client";

import { useState } from "react";
import { movement, perWeek, type ProtoRow } from "./fixture";
import { CompactRow } from "./VariantT";

function Delta({ row }: { row: ProtoRow }) {
  const delta = movement(row);
  if (delta === null)
    return <span className="text-[0.6rem] font-bold text-info">new</span>;
  if (delta === 0)
    return <span className="text-[0.65rem] font-bold text-ink/25">–</span>;
  return (
    <span
      className={`text-[0.65rem] font-bold tabular-nums ${
        delta > 0 ? "text-success" : "text-danger"
      }`}
    >
      {delta > 0 ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

function Plinth({
  players,
  place,
  raised,
}: {
  players: ProtoRow[];
  place: number;
  raised?: boolean;
}) {
  const gold = place === 1;
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-1 rounded-card px-2 pb-3 text-center shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
        gold ? "bg-accent/25 pt-4" : "bg-white pt-3"
      } ${raised ? "-mt-3" : ""}`}
    >
      <span className="text-[0.7rem] font-extrabold tabular-nums text-ink/50">
        {place}
      </span>
      <span className="flex items-center justify-center -space-x-2">
        {players.map((p) => (
          <span
            key={p.playerId}
            className={`grid shrink-0 place-items-center rounded-full ring-2 ring-white ${
              gold ? "size-12 text-2xl" : "size-10 text-xl"
            } ${p.ineligible ? "bg-info/10" : "bg-paper"}`}
            aria-hidden
          >
            {p.emoji}
          </span>
        ))}
      </span>
      <span className="line-clamp-1 text-sm font-bold text-ink">
        {players.map((p) => p.displayName).join(" & ")}
      </span>
      <span
        className={`font-extrabold tabular-nums text-ink ${gold ? "text-3xl" : "text-2xl"}`}
      >
        {players[0].points}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[0.65rem] tabular-nums text-ink/45">
          {perWeek(players[0])}/wk
        </span>
        {players.length === 1 ? <Delta row={players[0]} /> : null}
      </span>
    </div>
  );
}

export function VariantP({
  rows,
  dayOne,
}: {
  rows: ProtoRow[];
  dayOne: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (dayOne) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
        <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>
        <p className="text-sm text-ink/70">
          No podium yet — the season starts here. Everyone below is in.
        </p>
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <CompactRow
              key={row.playerId}
              row={row}
              dayOne
              open={false}
              onToggle={() => {}}
            />
          ))}
        </ul>
      </main>
    );
  }

  // Group by rank so a tie shares its plinth rather than the podium
  // silently picking a winner between equal totals.
  // Bots carry no rank (ADR 0012 D12) and can't win, so they never reach a
  // plinth -- they fall through to the chasing pack in points order.
  const byRank = new Map<number, ProtoRow[]>();
  for (const row of rows) {
    if (row.rank === null) continue;
    byRank.set(row.rank, [...(byRank.get(row.rank) ?? []), row]);
  }
  const podiumRanks = [...byRank.keys()].sort((a, b) => a - b).slice(0, 3);
  const podium = podiumRanks.map((r) => byRank.get(r)!);
  const rest = rows.filter(
    (row) => row.rank === null || !podiumRanks.includes(row.rank),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>

      <div className="flex items-end gap-2 pt-3">
        {podium[1] ? (
          <Plinth players={podium[1]} place={podiumRanks[1]} />
        ) : null}
        {podium[0] ? (
          <Plinth players={podium[0]} place={podiumRanks[0]} raised />
        ) : null}
        {podium[2] ? (
          <Plinth players={podium[2]} place={podiumRanks[2]} />
        ) : null}
      </div>

      {rest.length ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink/50">
            The chasing pack
          </h2>
          <ul className="flex flex-col gap-1.5">
            {rest.map((row) => (
              <CompactRow
                key={row.playerId}
                row={row}
                dayOne={false}
                open={openId === row.playerId}
                onToggle={() =>
                  setOpenId(openId === row.playerId ? null : row.playerId)
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
