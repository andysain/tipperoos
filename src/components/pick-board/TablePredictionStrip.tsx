import Link from "next/link";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { kitColors, stripeStyle } from "@/lib/teams/kit-colors";
import type { TablePredictionStripState } from "@/lib/table-predictions/strip-state";

function ordinalSuffix(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return "th";
  return (["th", "st", "nd", "rd"] as const)[n % 10] ?? "th";
}

/**
 * Pick Board's permanent presence for a Player's own Table Prediction
 * (issue #156) -- replaces `TablePredictionPrompt`, which only ever showed
 * before the deadline and vanished for the rest of the season. Purely a
 * renderer: every branch is decided ahead of time by
 * `deriveTablePredictionStripState()`, tested on its own in
 * strip-state.test.ts.
 *
 * No verdict styling on the Champion in any state (no success/danger
 * colouring, no tick/cross) -- it's a pick the Player can no longer change,
 * per issue #156's "Rules this must hold".
 */
export function TablePredictionStrip({
  state,
}: {
  state: TablePredictionStripState;
}) {
  if (state.kind === "hidden") return null;

  if (state.kind === "not_submitted") {
    return (
      <Link
        href="/predict-table"
        className="flex items-center justify-between gap-3 rounded-card bg-accent px-4 py-3 text-accent-ink transition hover:brightness-105"
      >
        <span className="text-sm font-bold">
          Your next step: predict the table!
        </span>
        <span className="text-sm font-extrabold underline underline-offset-2">
          Go now
        </span>
      </Link>
    );
  }

  const { champion } = state;
  const [c1, c2] = kitColors(champion.shortCode);
  const stripe = stripeStyle(c1, c2, 90);

  const championRow = (
    <div className="flex flex-1 items-center gap-3">
      <div className="h-10 w-1.5 shrink-0 rounded-full" style={stripe} />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink/50">
          Your predicted Champion
        </span>
        <div className="flex items-center gap-2">
          <ClubCodeBadge shortCode={champion.shortCode} fill={c1} />
          <span className="text-sm font-bold text-ink">{champion.name}</span>
        </div>
      </div>
    </div>
  );

  if (state.kind === "submitted_locked") {
    return (
      <Link
        href="/predict-table"
        className="flex items-center gap-3 rounded-card border border-paper-line bg-white p-4 transition hover:bg-paper"
      >
        {championRow}
        {state.leaguePosition !== null ? (
          <span className="shrink-0 text-sm font-bold text-ink/70">
            {state.leaguePosition}
            {ordinalSuffix(state.leaguePosition)} in the league
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-paper-line bg-white p-4">
      <div className="flex items-center gap-3">
        {championRow}
        <Link
          href="/predict-table"
          className="shrink-0 text-sm font-extrabold text-accent underline underline-offset-2"
        >
          Edit
        </Link>
      </div>
      {state.bandsUntidy ? (
        <p className="text-xs font-semibold text-warning">
          Some of your Bands aren&apos;t quite right yet -- check your table.
        </p>
      ) : null}
    </div>
  );
}
