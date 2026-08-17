// PROTOTYPE VARIANT A -- "League table". Throwaway.
//
// Bet: the leaderboard's job is scanning, and a real football league table
// is the most practised scanning pattern this audience owns. One container,
// hairline rows, columns that line up, nothing per-row that isn't data.
// Emoji renders INLINE beside the name (one side of the open question in
// docs/DESIGN_SYSTEM.md -> Icons).

import { INELIGIBLE_LABEL, movement, perWeek, type ProtoRow } from "./fixture";

function Movement({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="text-[0.7rem] font-bold text-info" title="New this week">
        NEW
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="text-xs font-bold text-ink/30" aria-label="No change">
        –
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`text-xs font-bold tabular-nums ${up ? "text-success" : "text-danger"}`}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(delta)} places`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

export function VariantA({
  rows,
  dayOne,
}: {
  rows: ProtoRow[];
  dayOne: boolean;
}) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>

      {dayOne ? (
        <p className="text-sm text-ink/70">
          Nobody&apos;s on the board yet — points land after Gameweek 1&apos;s
          results. Here&apos;s who&apos;s playing.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-card bg-white shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)]">
        {!dayOne ? (
          <div className="flex items-center gap-3 border-b border-paper-line px-3 py-2 text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ink/45">
            <span className="w-6 text-center">#</span>
            <span className="w-8" aria-hidden />
            <span className="flex-1">Player</span>
            <span className="w-12 text-right">Pts</span>
            <span className="w-12 text-right">/ week</span>
          </div>
        ) : null}

        <ul>
          {rows.map((row) => {
            const first = !dayOne && row.rank === 1;
            const muted = row.ineligible !== null;
            return (
              <li
                key={row.playerId}
                className={`flex items-center gap-3 border-b border-paper-line px-3 py-2.5 last:border-b-0 ${
                  first ? "bg-accent/15" : ""
                }`}
              >
                <span
                  className={`w-6 text-center text-sm font-extrabold tabular-nums ${
                    muted ? "text-ink/40" : "text-ink"
                  }`}
                >
                  {dayOne ? "" : (row.rank ?? "")}
                </span>
                <span className="w-8 text-center">
                  {dayOne ? null : <Movement delta={movement(row)} />}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span aria-hidden>{row.emoji}</span>
                  <span
                    className={`truncate font-bold ${muted ? "text-ink/50" : "text-ink"}`}
                  >
                    {row.displayName}
                  </span>
                  {row.isYou ? (
                    <span className="shrink-0 rounded-badge bg-accent px-1.5 py-0.5 text-[0.6rem] font-extrabold text-accent-ink">
                      You
                    </span>
                  ) : null}
                  {row.ineligible ? (
                    <span className="shrink-0 rounded-badge border border-info/40 px-1.5 py-0.5 text-[0.6rem] font-bold text-info">
                      {INELIGIBLE_LABEL[row.ineligible]}
                    </span>
                  ) : null}
                </span>
                {!dayOne ? (
                  <>
                    <span
                      className={`w-12 text-right text-base font-extrabold tabular-nums ${
                        muted ? "text-ink/50" : "text-ink"
                      }`}
                    >
                      {row.points}
                    </span>
                    <span className="w-12 text-right text-sm tabular-nums text-ink/45">
                      {perWeek(row)}
                    </span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {!dayOne ? (
        <p className="text-xs text-ink/50">
          Bots can&apos;t win the season — they still play, they just can&apos;t
          take the title. &ldquo;/ week&rdquo; is points per gameweek since you
          joined.
        </p>
      ) : null}
    </main>
  );
}
