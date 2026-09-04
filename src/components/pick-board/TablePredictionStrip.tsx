import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { applyContrastFloor, kitColors } from "@/lib/teams/kit-colors";
import type { TablePredictionStripState } from "@/lib/table-predictions/strip-state";
import { ordinal } from "@/lib/format/ordinal";
import { MAX_PREDICT_TABLE_SCORE } from "@/lib/scoring/predict-table";
import { FOCUS, T, TX, CARD_SHADOW } from "@/components/ui/tokens";

/**
 * Pick Board's permanent presence for a Player's own Table Prediction
 * (issue #156, redesigned issue #157) -- replaces `TablePredictionPrompt`,
 * which only ever showed before the deadline and vanished for the rest of
 * the season. Purely a renderer: every branch is decided ahead of time by
 * `deriveTablePredictionStripState()`, tested on its own in
 * strip-state.test.ts.
 *
 * No verdict styling on the Champion or its stats in any state (no
 * success/danger colouring, no tick/cross) -- the Champion is a pick the
 * Player can no longer change once locked, and per issue #157's UI pass
 * this now extends to the live club-position / competition-rank / score
 * figures too, which move both up and down all season and are never a
 * "correct/incorrect" verdict.
 *
 * Card grammar (issue #157): a bare label+chevron header, matching
 * LEADERBOARD's shape, not LAST GAMEWEEK's -- both this card and the
 * Leaderboard are continuously-live personal standings, not a settled
 * recap, so they share a header shape and LAST GAMEWEEK (a genuine past
 * recap) keeps its own. Whole card is one tap target throughout: this is
 * a single dense card, not a list, so the "heading-only tappable, rows
 * inert" rule that governs SummarySection's list rows doesn't apply here
 * -- there's no "which row did I tap" ambiguity for it to guard against.
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
        <span
          className={`${T.dense} font-extrabold underline underline-offset-2`}
        >
          Go now
        </span>
      </Link>
    );
  }

  const { champion, leaguePosition, score, rank } = state;
  // Same single contrast-floored primary kit colour as the capture flow's
  // own club-identity rail (predict-table/shared.tsx's teamFill()) --
  // matching it here rather than the two-tone matchBadgeColors() stripe
  // (Tipped Match cards) keeps a Champion's colour reading identical
  // wherever the Player sees it.
  const fill = applyContrastFloor(kitColors(champion.shortCode)[0], [
    "#ffffff",
  ]);

  const scoreLabel =
    score !== null ? `${score}/${MAX_PREDICT_TABLE_SCORE} pts` : null;

  return (
    <Link
      href="/predict-table"
      className={`flex flex-col gap-2.5 rounded-card bg-white p-4 transition hover:bg-paper ${CARD_SHADOW} ${FOCUS}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`${T.label} font-bold uppercase tracking-[0.08em] ${TX.muted}`}
        >
          Predict the Table
        </span>
        <ChevronRight
          className="size-3.5 shrink-0 stroke-text-muted"
          aria-hidden
        />
      </div>

      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-10 w-1.5 shrink-0 rounded-full"
          style={{ background: fill }}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`${T.label} font-bold ${TX.decorative}`}>
            Champion
          </span>
          <div className="flex items-center gap-2">
            <ClubCodeBadge shortCode={champion.shortCode} fill={fill} />
            <span className={`${T.dense} font-bold ${TX.base}`}>
              {champion.name}
              {leaguePosition !== null ? (
                <span className={`font-semibold ${TX.muted}`}>
                  {" "}
                  ({ordinal(leaguePosition)})
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {rank !== null || scoreLabel !== null ? (
          <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
            {rank !== null ? (
              <span className={`${T.body} font-extrabold ${TX.base}`}>
                {ordinal(rank)}
              </span>
            ) : null}
            {scoreLabel ? (
              <span className={`${T.caption} font-bold ${TX.muted}`}>
                {scoreLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {state.kind === "submitted_editable" && state.bandsUntidy ? (
        <div className="flex items-center gap-2 rounded-btn-sm bg-warning/10 px-3 py-2">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <p className={`${T.caption} font-semibold ${TX.muted}`}>
            Some of your Bands aren&apos;t quite right yet -- check your table.
          </p>
        </div>
      ) : null}
    </Link>
  );
}
