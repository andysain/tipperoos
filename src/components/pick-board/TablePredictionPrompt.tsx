import Link from "next/link";

/**
 * Prompt banner on `/` until the player has submitted or skipped Predict
 * the Table, or Gameweek 1 has kicked off -- ADR-0007's first-run decision.
 * This issue (#90) owns only the prompt; #26 owns the capture flow itself.
 */
export function TablePredictionPrompt() {
  return (
    <Link
      href="/predict-table"
      className="flex items-center justify-between gap-3 rounded-card bg-accent px-4 py-3 text-accent-ink transition hover:brightness-105"
    >
      <span className="text-sm font-bold">
        Don&apos;t forget to predict the table!
      </span>
      <span className="text-sm font-extrabold underline underline-offset-2">
        Go now
      </span>
    </Link>
  );
}
