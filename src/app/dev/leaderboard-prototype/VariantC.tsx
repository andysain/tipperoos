// PROTOTYPE VARIANT C -- "Ladder". Throwaway.
//
// Bet: order alone is the least interesting thing a leaderboard knows. In a
// 76-match season the real question is "how far back am I, and is that
// catchable?" -- so every row is a bar proportional to the leader's total
// and the GAPS become the primary information. No table, no cards: a rail.
// Also the only variant that anchors the signed-in player to the bottom of
// the screen, so "where am I" survives a 16-row scroll -- deliberately
// tested here rather than in all three.

import { INELIGIBLE_LABEL, movement, perWeek, type ProtoRow } from "./fixture";

function arrow(delta: number | null): string {
  if (delta === null) return "new";
  if (delta === 0) return "";
  return delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`;
}

function Rung({
  row,
  leader,
  dayOne,
}: {
  row: ProtoRow;
  leader: number;
  dayOne: boolean;
}) {
  const width = leader === 0 ? 0 : Math.max(6, (row.points / leader) * 100);
  const muted = row.ineligible !== null;
  const first = !dayOne && row.rank === 1;
  const delta = movement(row);

  return (
    <li className="flex items-stretch gap-2">
      <span
        className={`w-5 shrink-0 pt-1.5 text-right text-xs font-extrabold tabular-nums ${
          muted ? "text-ink/35" : "text-ink/70"
        }`}
      >
        {dayOne ? "·" : (row.rank ?? "")}
      </span>

      <span className="relative min-w-0 flex-1 py-1">
        {!dayOne ? (
          <span
            className={`absolute inset-y-1 left-0 rounded-r-md ${
              first ? "bg-accent/45" : muted ? "bg-info/12" : "bg-ink/10"
            }`}
            style={{ width: `${width}%` }}
            aria-hidden
          />
        ) : null}
        <span className="relative flex items-center gap-1.5 px-2 py-1.5">
          <span aria-hidden>{row.emoji}</span>
          <span
            className={`truncate text-sm font-bold ${muted ? "text-ink/55" : "text-ink"}`}
          >
            {row.displayName}
          </span>
          {row.isYou ? (
            <span className="shrink-0 rounded-badge bg-accent px-1.5 py-0.5 text-[0.6rem] font-extrabold text-accent-ink">
              You
            </span>
          ) : null}
          {row.ineligible ? (
            <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-wide text-info">
              {INELIGIBLE_LABEL[row.ineligible]}
            </span>
          ) : null}
          {!dayOne && delta !== 0 ? (
            <span
              className={`shrink-0 text-[0.65rem] font-bold tabular-nums ${
                delta === null
                  ? "text-info"
                  : delta > 0
                    ? "text-success"
                    : "text-danger"
              }`}
            >
              {arrow(delta)}
            </span>
          ) : null}
        </span>
      </span>

      {!dayOne ? (
        <span className="flex w-14 shrink-0 flex-col items-end pt-1">
          <span className="text-sm font-extrabold tabular-nums text-ink">
            {row.points}
          </span>
          <span className="text-[0.65rem] tabular-nums text-ink/45">
            {perWeek(row)}/wk
          </span>
        </span>
      ) : null}
    </li>
  );
}

export function VariantC({
  rows,
  dayOne,
}: {
  rows: ProtoRow[];
  dayOne: boolean;
}) {
  const leader = Math.max(...rows.map((r) => r.points), 0);
  const you = rows.find((r) => r.isYou);
  const gapToLeader = you ? leader - you.points : 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-28">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>

      {dayOne ? (
        <p className="text-sm text-ink/70">
          The ladder starts empty — first points land after Gameweek 1.
        </p>
      ) : (
        <p className="text-sm text-ink/70">
          Gameweek 8 · longer bar, more points. You&apos;re{" "}
          <strong className="text-ink">{gapToLeader}</strong> behind the top.
        </p>
      )}

      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <Rung key={row.playerId} row={row} leader={leader} dayOne={dayOne} />
        ))}
      </ul>

      {!dayOne && you ? (
        <div className="fixed inset-x-0 bottom-16 z-10 border-t border-paper-line bg-white/95 px-4 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <span className="text-sm font-extrabold tabular-nums text-ink">
              {you.rank}
            </span>
            <span aria-hidden>{you.emoji}</span>
            <span className="flex-1 truncate text-sm font-bold text-ink">
              {you.displayName}
            </span>
            <span className="text-sm font-extrabold tabular-nums text-ink">
              {you.points}
            </span>
            <span className="text-[0.7rem] tabular-nums text-ink/50">
              {perWeek(you)}/wk
            </span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
