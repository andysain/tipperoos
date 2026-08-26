import Link from "next/link";
import { T, FOCUS } from "@/components/ui/tokens";

// Issue #171 / docs/adr/0012-leaderboard-view.md D1: the route always had
// two segments in the plan (Season, Predict the Table), but #24 shipped
// only the first with no control to switch to a second one -- this is
// that control. Link-based (a `?segment=` search param), not client
// state: every other server-rendered page in this app switches views this
// way, and it keeps the route shareable/bookmarkable at a given segment.
// Ink-as-surface for the active pill (sanctioned grammar,
// docs/DESIGN_SYSTEM.md "Card anatomy") rather than accent, since accent
// is budget-limited and already spent elsewhere on this page (the "You"
// pill, the CTA states).
export function LeaderboardSegmentedControl({
  active,
}: {
  active: "season" | "table";
}) {
  return (
    <div className="inline-flex gap-1 self-start rounded-btn bg-paper-line/40 p-1">
      <Link
        href="/leaderboard"
        aria-current={active === "season" ? "page" : undefined}
        className={`rounded-btn-sm px-4 py-1.5 ${T.dense} font-bold transition ${FOCUS} ${
          active === "season" ? "bg-ink text-on-ink" : "text-text-muted"
        }`}
      >
        Season
      </Link>
      <Link
        href="/leaderboard?segment=table"
        aria-current={active === "table" ? "page" : undefined}
        className={`rounded-btn-sm px-4 py-1.5 ${T.dense} font-bold transition ${FOCUS} ${
          active === "table" ? "bg-ink text-on-ink" : "text-text-muted"
        }`}
      >
        Predict the Table
      </Link>
    </div>
  );
}
