import { ChevronRight } from "lucide-react";
import { LABEL, T, TX } from "@/components/ui/tokens";
import { pointLabel, pointTone } from "@/components/ui/Points";
import type { WeekOutcome } from "@/lib/gameweeks/week-outcome";

/**
 * One picks table, two lengths.
 *
 * The Pick Board's recap and the season picks record are the same thing -- a
 * player's tip against what actually happened -- over one gameweek or over a
 * season. Rendering them from one module is what stops the app teaching a
 * reader two ways to read the same four numbers
 * (`docs/adr/0013-match-centre-tense-and-axes.md` D15).
 */
export interface PickLine {
  key: string;
  homeCode: string | null;
  awayCode: string | null;
  locked: boolean;
  calledOff: boolean;
  pick: { home: number; away: number } | null;
  result: { home: number; away: number } | null;
  points: number | null;
}

const COL_PICK = "w-11 text-right";
const COL_FINAL = "w-11 text-right";
const COL_PTS = "w-7 text-right";

/** Labels all four columns positionally, once per surface. Without it
 *  `1–0  0–1` can be read the wrong way round, which is the one misreading
 *  this table has to prevent -- so its cells must line up with the row's. */
export function PicksLegend() {
  return (
    <span className={`flex items-baseline gap-3 ${LABEL} ${TX.muted}`}>
      <span className="min-w-0 flex-1" />
      <span className={COL_PICK}>pick</span>
      <span className={COL_FINAL}>final</span>
      <span className={COL_PTS}>pts</span>
    </span>
  );
}

export function PicksRow({ line }: { line: PickLine }) {
  return (
    <li className={`flex items-baseline gap-3 ${T.caption}`}>
      {/* Home takes visual dominance rather than a label -- the form of the
          home/away rule that survives sharing a line with numbers
          (docs/DESIGN_SYSTEM.md -> Team display in fixtures). */}
      <span className="min-w-0 flex-1 truncate">
        <span className={`font-bold ${TX.base}`}>{line.homeCode ?? "—"}</span>
        <span className={TX.decorative}> v </span>
        <span className={`font-medium ${TX.muted}`}>
          {line.awayCode ?? "—"}
        </span>
      </span>
      <span className={`${COL_PICK} tabular-nums ${TX.muted}`}>
        {!line.locked ? (
          ""
        ) : line.pick ? (
          `${line.pick.home}–${line.pick.away}`
        ) : (
          // The words, never a dash: "No pick, no points" is a rule with
          // real weight, and the dash already carries four other meanings.
          <span className={`font-medium ${TX.muted}`}>no pick</span>
        )}
      </span>
      <span
        className={`${COL_FINAL} font-bold tabular-nums ${
          line.calledOff ? TX.muted : TX.base
        }`}
      >
        {line.calledOff
          ? "off"
          : line.result
            ? `${line.result.home}–${line.result.away}`
            : ""}
      </span>
      <span className={`${COL_PTS} tabular-nums ${pointTone(line.points)}`}>
        {pointLabel(line.points)}
      </span>
    </li>
  );
}

export function WeekHeading({
  gameweek,
  dateLabel,
  outcome,
  chevron,
  /** Whose record this is. Without it the heading said "You missed this
   *  one" on another player's season -- second-person copy on a
   *  third-person surface. */
  owner,
}: {
  gameweek: number;
  dateLabel?: string;
  outcome: WeekOutcome;
  chevron?: boolean;
  owner?: string;
}) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className={`${LABEL} ${TX.muted}`}>
        Gameweek {gameweek}
        {dateLabel ? (
          <span
            className={`ml-2 font-medium normal-case tracking-normal ${TX.decorative}`}
          >
            {dateLabel}
          </span>
        ) : null}
      </span>
      <span className="flex items-baseline gap-1">
        {outcome.kind === "scored" ? (
          <>
            <span
              className={`${T.body} font-extrabold leading-none tabular-nums ${
                outcome.total > 0 ? TX.base : TX.muted
              }`}
            >
              {outcome.total}
            </span>
            <span className={`${LABEL} ${TX.muted}`}>
              {outcome.total === 1 ? "pt" : "pts"}
              {outcome.pending ? " so far" : ""}
            </span>
          </>
        ) : (
          // Four different facts, four different words. A single nullable
          // total used to render all of them as "no picks", which told a
          // player they'd missed a week they had actually played.
          <span className={`${LABEL} ${TX.muted}`}>
            {outcome.kind === "no_picks"
              ? owner
                ? `${owner} missed this one`
                : "You missed this one"
              : outcome.kind === "called_off"
                ? "Called off"
                : "Not scored yet"}
          </span>
        )}
        {chevron ? (
          <ChevronRight
            className="ml-0.5 size-3.5 stroke-text-muted"
            aria-hidden
          />
        ) : null}
      </span>
    </span>
  );
}
