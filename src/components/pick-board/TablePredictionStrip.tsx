import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { applyContrastFloor, kitColors } from "@/lib/teams/kit-colors";
import type { TablePredictionStripState } from "@/lib/table-predictions/strip-state";
import { ordinal } from "@/lib/format/ordinal";
import { MAX_PREDICT_TABLE_SCORE } from "@/lib/scoring/predict-table";
import { FOCUS, T, TX } from "@/components/ui/tokens";

// Card shadow -- see docs/DESIGN_SYSTEM.md "Card anatomy": "Neither shape
// ever gets a border; depth comes from the shadow alone." Quoted directly
// from src/components/ui/Card.tsx rather than importing it, since Card.tsx
// always adds its own p-6 padding and this strip needs its own layout.
const CARD_SHADOW = "shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)]";

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
        className={`flex items-center justify-between gap-3 rounded-card bg-accent px-4 py-3 text-accent-ink transition hover:brightness-105 ${FOCUS}`}
      >
        <span className={`${T.dense} font-bold`}>
          Your next step: predict the table!
        </span>
        <span className={`${T.dense} font-extrabold underline underline-offset-2`}>
          Go now
        </span>
      </Link>
    );
  }

  const { champion } = state;
  // Same single contrast-floored primary kit colour as the capture flow's
  // own club-identity rail (predict-table/shared.tsx's teamFill()) --
  // matching it here rather than the two-tone matchBadgeColors() stripe
  // (Tipped Match cards) keeps a Champion's colour reading identical
  // wherever the Player sees it. A two-colour gradient stripe was tried
  // first and read as a visual mismatch for a club whose kit already reads
  // as one colour here (Arsenal's white trim isn't part of its identity in
  // this feature).
  const fill = applyContrastFloor(kitColors(champion.shortCode)[0], [
    "#ffffff",
  ]);

  const championRow = (
    <div className="flex flex-1 items-center gap-3">
      <span
        aria-hidden
        className="h-10 w-1.5 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <div className="flex flex-col gap-0.5">
        <span className={`${T.label} font-bold uppercase tracking-[0.06em] ${TX.muted}`}>
          Your predicted Champion
        </span>
        <div className="flex items-center gap-2">
          <ClubCodeBadge shortCode={champion.shortCode} fill={fill} />
          <span className={`${T.dense} font-bold ${TX.base}`}>{champion.name}</span>
        </div>
      </div>
    </div>
  );

  const scoreLabel =
    state.score !== null
      ? `${state.score} / ${MAX_PREDICT_TABLE_SCORE} pts`
      : null;

  if (state.kind === "submitted_locked") {
    return (
      <Link
        href="/predict-table"
        className={`flex items-center gap-3 rounded-card bg-white p-4 transition hover:bg-paper ${CARD_SHADOW} ${FOCUS}`}
      >
        {championRow}
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {scoreLabel ? (
            <span className={`${T.dense} font-extrabold ${TX.base}`}>
              {scoreLabel}
            </span>
          ) : null}
          {state.leaguePosition !== null ? (
            <span className={`${T.caption} font-bold ${TX.muted}`}>
              {ordinal(state.leaguePosition)} in the league
            </span>
          ) : null}
        </div>
      </Link>
    );
  }

  return (
    <div className={`flex flex-col gap-2 rounded-card bg-white p-4 ${CARD_SHADOW}`}>
      <div className="flex items-center gap-3">
        {championRow}
        {scoreLabel ? (
          <span className={`shrink-0 ${T.dense} font-extrabold ${TX.base}`}>
            {scoreLabel}
          </span>
        ) : null}
        <Link
          href="/predict-table"
          className={`shrink-0 ${T.caption} font-bold ${TX.base} underline underline-offset-2 ${FOCUS}`}
        >
          Edit
        </Link>
      </div>
      {state.bandsUntidy ? (
        <div className="flex items-center gap-2 rounded-btn-sm bg-warning/10 px-3 py-2">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <p className={`${T.caption} font-semibold ${TX.muted}`}>
            Some of your Bands aren&apos;t quite right yet -- check your table.
          </p>
        </div>
      ) : null}
    </div>
  );
}
