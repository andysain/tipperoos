"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScoringSummary } from "@/components/scoring/ScoringSummary";
// The capture board (docs/adr/0011-predict-the-table-capture-v2.md):
//
//  1. One grammar, one shape. There is no review mode and no review board:
//     Band headers toggle, the collapsed rows carry full membership, and so
//     "everything closed" *is* the review of the table -- reached with the
//     same gesture used to fill it. Editing a finished table is the same two
//     taps as filling an empty one: open the Band, tap the club.
//  2. Bands cannot over-fill. Tapping into a full Band swaps in for its
//     "next out" club, which returns to the roster (tapWithEviction).
//  3. An 8th Band, Runners Up, between Champion and Champions League.
//  4. The roster is one line per club, and already-placed clubs are demoted
//     to the bottom -- but only when the open Band changes, never on a tap,
//     so the list can never shift under a finger mid-flow.
import {
  bandPosition,
  championWasNamed,
  countsOf,
  demotePlaced,
  firstIncorrectlyFilledBand,
  nextOutTeam,
  nextUnfilledBand,
  planTapRequests,
  planUndoRequests,
  resolveTapOutcome,
  rosterOrder,
  startAgain as startAgainBoard,
  tapWithEviction,
  type Assignments,
  type PlacedAt,
  type PriorBandByTeam,
  type TapSnapshot,
} from "@/lib/table-predictions/board";
import {
  TABLE_BANDS,
  TABLE_PREDICTION_DEADLINE,
  type BandKey,
  validateBandCounts,
} from "@/lib/table-predictions/rules";
import { BandSummary } from "./BandSummary";
import { BandsBoard, type UndoState } from "./BandsBoard";
import { ChampionCelebration } from "./ChampionCelebration";
import { SubmittedMoment } from "./SubmittedMoment";
import { BAND_LABEL, type Team } from "./shared";

// How long the champion ceremony stays on screen: the confetti-fall
// animation (globals.css) is 1.1s, plus a 100ms buffer so the beat clears
// cleanly. Kept in one place so the timeout and the CSS duration can't
// drift apart.
const CHAMPION_CELEBRATION_MS = 1200;

function formatCountdown(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// A live "locks in" readout -- DESIGN_SYSTEM.md's palette table already
// reserves `warning` for exactly this ("Locks-soon countdown"), just not
// wired up anywhere yet. Only ever shown to on-time players before lock --
// Late Joiners are never locked (CLAUDE.md).
function LockCountdown({
  deadlineIso,
  now,
}: {
  deadlineIso: string;
  now: number;
}) {
  const remainingMs = new Date(deadlineIso).getTime() - now;
  if (remainingMs <= 0) return null;
  const soon = remainingMs < 24 * 60 * 60 * 1000;
  return (
    <span className={soon ? "text-warning" : "text-ink/50"}>
      Locks in {formatCountdown(remainingMs)}
    </span>
  );
}

async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tipperoos-client": "1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

interface PredictTableFlowProps {
  teams: Team[];
  initialAssignments: Record<string, BandKey>;
  isLateJoiner: boolean;
  locked: boolean;
  initialIsSkipped: boolean;
  initialSubmittedAt: string | null;
}

export function PredictTableFlow({
  teams,
  initialAssignments,
  isLateJoiner,
  locked,
  initialIsSkipped,
  initialSubmittedAt,
}: PredictTableFlowProps) {
  const [assignments, setAssignments] =
    useState<Assignments>(initialAssignments);
  const [previous, setPrevious] = useState<PriorBandByTeam>({});
  // Placement order, for the eviction rule's "next out". Seeded from the
  // saved assignments in roster order so a resumed board still has a
  // deterministic answer; the counter then runs on from there.
  const [placedAt, setPlacedAt] = useState<PlacedAt>(() =>
    Object.fromEntries(
      Object.keys(initialAssignments).map((teamId, index) => [teamId, index]),
    ),
  );
  const placementSeq = useRef(Object.keys(initialAssignments).length);
  // #118's return-visit landing: which Band opens on a visit is where the
  // work actually is, not always Champion -- Champion on a first (empty)
  // visit, the first incorrectly filled Band on a return (ADR 0008).
  // Nullable, and null is a first-class state rather than a separate mode --
  // Band headers toggle, so closing the open one leaves every Band
  // collapsed, which is the whole table on one screen. A visit lands on
  // wherever the work is; a finished board lands all-collapsed, showing the
  // answer rather than dropping the player into an edit.
  const [openBand, setOpenBand] = useState<BandKey | null>(() =>
    firstIncorrectlyFilledBand(countsOf(initialAssignments)),
  );
  const [undo, setUndo] = useState<UndoState | null>(null);
  // Undo restores a snapshot rather than replaying an inverse move. An
  // eviction changes two clubs at once, and the Band the evicted club came
  // from is full again by the time you'd want to put it back -- so "drop it
  // back where it was" is not a legal move, while "put the board back how
  // it was" always is.
  const [undoSnapshot, setUndoSnapshot] = useState<TapSnapshot | null>(null);

  const [isSkipped, setIsSkipped] = useState(initialIsSkipped);
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busyTeamIds, setBusyTeamIds] = useState<string[]>([]);
  const [warnedIncomplete, setWarnedIncomplete] = useState(false);
  const [confirmingStartAgain, setConfirmingStartAgain] = useState(false);
  const [startingAgain, setStartingAgain] = useState(false);
  // The champion ceremony (#118): fires once per page-load session on the
  // first time the champion is named, re-armed by a Start again. A ref so
  // the beat can't double-fire inside one session; a state flag so the
  // celebration unmounts itself after CHAMPION_CELEBRATION_MS.
  const championCelebrated = useRef(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (!celebrating) return;
    const id = setTimeout(() => setCelebrating(false), CHAMPION_CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [celebrating]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  // Fixed roster order, per docs/predict-table-capture-spec.md "The
  // roster": last season's finishing position, promoted clubs last. Never
  // re-sorted by placement, so a club stays where the player learned it was.
  const roster = useMemo(() => rosterOrder(teams), [teams]);

  // The roster as currently displayed -- unplaced clubs first, already-placed
  // ones demoted below a caption. Held in state and refreshed
  // only by handleOpenBand, never by a tap: while you are filling one Band
  // the list is frozen, so nothing moves under your finger between taps. It
  // re-settles at the moment you change Band, which is a moment you are
  // already changing context.
  const [demoted, setDemoted] = useState(() =>
    demotePlaced(rosterOrder(teams), initialAssignments),
  );

  // The single entry point for changing which Band is open -- re-groups the
  // roster on the way through, so the "only on a Band change" rule can't be
  // bypassed by a call site that forgets it.
  function handleOpenBand(band: BandKey | null) {
    setDemoted(demotePlaced(roster, assignments));
    setOpenBand(band);
  }

  const placedCount = Object.keys(assignments).length;

  const counts = useMemo(() => countsOf(assignments), [assignments]);
  const validation = useMemo(() => validateBandCounts(counts), [counts]);
  const boardComplete = validation.ok;

  const nextBand = openBand ? nextUnfilledBand(openBand, counts) : null;

  // The club eviction would displace, or null while the open Band still has
  // room. Drives the "next out" marker and the roster hint.
  const openBandTarget = openBand
    ? (TABLE_BANDS.find((b) => b.key === openBand)?.target ?? 0)
    : 0;
  const nextOutTeamId =
    openBand && (counts[openBand] ?? 0) >= openBandTarget
      ? nextOutTeam(assignments, placedAt, openBand)
      : null;

  // Applies a tap's computed board change optimistically, fires the one
  // request it implies (assign if the team landed in a Band, unassign if
  // it landed back in the roster), and rolls the change back on failure.
  // `celebrateChampion` is the ceremony request from the filling tap that
  // named the champion -- spent only if the server actually accepts the
  // move, so a failed save never consumes the once-per-session beat.
  async function persistTap(
    teamId: string,
    result: {
      assignments: Assignments;
      previous: PriorBandByTeam;
      movedFrom: BandKey | null;
      placedAt?: PlacedAt;
      /** The club displaced to make room, if any. Persisted as a second
       * request (an unassign) alongside the tapped club's assign. */
      evicted?: { teamId: string; from: BandKey } | null;
    },
    celebrateChampion = false,
  ) {
    const evicted = result.evicted ?? null;
    const touched = evicted ? [teamId, evicted.teamId] : [teamId];
    if (touched.some((id) => busyTeamIds.includes(id))) return;
    setBusyTeamIds((prev) => [...prev, ...touched]);
    setSaveError(null);
    const prevAssignments = assignments;
    const prevPrevious = previous;
    const prevPlacedAt = placedAt;
    setAssignments(result.assignments);
    setPrevious(result.previous);
    if (result.placedAt) setPlacedAt(result.placedAt);

    // An eviction's undo names the club that *left*, not the one that
    // arrived -- the departure is the surprising half, and it is the half
    // that costs points (unplaced scores 0, a mis-Banded club doesn't).
    if (evicted) {
      const out = teamsById.get(evicted.teamId);
      setUndo({
        kind: "move",
        teamId: evicted.teamId,
        band: evicted.from,
        label: `${out?.name ?? "That team"} came out of ${BAND_LABEL[evicted.from]}`,
      });
    } else if (result.movedFrom) {
      const team = teamsById.get(teamId);
      setUndo({
        kind: "move",
        teamId,
        band: result.movedFrom,
        label: `${team?.name ?? "That team"} moved from ${BAND_LABEL[result.movedFrom]}`,
      });
    } else {
      setUndo(null);
    }

    const plan = planTapRequests(teamId, result);
    const results = await Promise.all(
      plan.map((request) =>
        request.band
          ? postJson("/api/table-predictions/assign", {
              teamId: request.teamId,
              band: request.band,
            })
          : postJson("/api/table-predictions/unassign", {
              teamId: request.teamId,
            }),
      ),
    );
    const failed = results.find((r) => !r.ok);
    const outcome = resolveTapOutcome(
      {
        assignments: prevAssignments,
        previous: prevPrevious,
        placedAt: prevPlacedAt,
      },
      {
        assignments: result.assignments,
        previous: result.previous,
        placedAt: result.placedAt ?? prevPlacedAt,
      },
      !failed,
    );
    setAssignments(outcome.assignments);
    setPrevious(outcome.previous);
    setPlacedAt(outcome.placedAt);

    if (failed) {
      setUndo(null);
      setSaveError(
        failed.data.error ?? "Couldn't save that move -- try again.",
      );
      setUndoSnapshot(null);
    } else {
      setIsSkipped(false);
      setUndoSnapshot({
        assignments: prevAssignments,
        previous: prevPrevious,
        placedAt: prevPlacedAt,
        teamIds: touched,
      });
      if (celebrateChampion && !championCelebrated.current) {
        championCelebrated.current = true;
        setCelebrating(true);
      }
    }
    setBusyTeamIds((prev) => prev.filter((id) => !touched.includes(id)));
  }

  // The only tap rule. A club tap always means "put this club in the open
  // Band" -- from the roster, from another Band, or from this one (which
  // toggle-reverts it). No club is tappable at rest, so the gesture never
  // quietly changes meaning under the player.
  function handleTeamTap(teamId: string) {
    if (!openBand) return;
    const result = tapWithEviction(
      { assignments, previous, placedAt },
      teamId,
      openBand,
      openBandTarget,
      placementSeq.current++,
    );
    // The champion ceremony: request the beat when this tap names the
    // champion (count 0 -> 1); persistTap spends it only on a saved move.
    void persistTap(
      teamId,
      result,
      championWasNamed(counts, countsOf(result.assignments)) &&
        !championCelebrated.current,
    );
  }

  // Restore the snapshot taken before the last saved tap, and re-persist
  // only the clubs that tap touched (one for a plain move, two for an
  // eviction). Rolls the whole thing back if any request fails, so a
  // half-applied undo can't leave the board disagreeing with the server.
  async function handleUndo() {
    const snapshot = undoSnapshot;
    if (!snapshot) return;
    setUndo(null);
    setUndoSnapshot(null);
    setBusyTeamIds((prev) => [...prev, ...snapshot.teamIds]);
    setSaveError(null);

    const current = { assignments, previous, placedAt };
    setAssignments(snapshot.assignments);
    setPrevious(snapshot.previous);
    setPlacedAt(snapshot.placedAt);

    const results = await Promise.all(
      planUndoRequests(snapshot).map((request) =>
        request.band
          ? postJson("/api/table-predictions/assign", {
              teamId: request.teamId,
              band: request.band,
            })
          : postJson("/api/table-predictions/unassign", {
              teamId: request.teamId,
            }),
      ),
    );
    const failed = results.find((r) => !r.ok);
    if (failed) {
      setAssignments(current.assignments);
      setPrevious(current.previous);
      setPlacedAt(current.placedAt);
      setSaveError(failed.data.error ?? "Couldn't undo that -- try again.");
    }
    setBusyTeamIds((prev) =>
      prev.filter((id) => !snapshot.teamIds.includes(id)),
    );
  }

  async function handleStartAgain() {
    setConfirmingStartAgain(false);
    setStartingAgain(true);
    setSaveError(null);
    const teamIds = Object.keys(assignments);
    const prevAssignments = assignments;
    const prevPrevious = previous;
    const cleared = startAgainBoard();
    setAssignments(cleared.assignments);
    setPrevious(cleared.previous);
    setPlacedAt({});
    placementSeq.current = 0;
    setUndo(null);
    setUndoSnapshot(null);
    setDemoted(demotePlaced(roster, {}));
    setOpenBand("champion");

    const results = await Promise.all(
      teamIds.map((teamId) =>
        postJson("/api/table-predictions/unassign", { teamId }),
      ),
    );
    const failed = results.find((result) => !result.ok);
    if (failed) {
      setAssignments(prevAssignments);
      setPrevious(prevPrevious);
      setSaveError(
        "Couldn't start again -- check your connection and try again.",
      );
    } else {
      // The rebuilt board's first champion deserves the ceremony too -- a
      // Start again is a deliberate reset, not the same session's churn.
      // Reset only on success: a rolled-back board still has its champion
      // named, and spending the once-per-session beat there loses it.
      championCelebrated.current = false;
    }
    setStartingAgain(false);
  }

  async function handleSkip() {
    setBusy(true);
    setActionError(null);
    const { ok, data } = await postJson("/api/table-predictions/skip");
    if (ok) {
      setIsSkipped(true);
    } else {
      setActionError(data.error ?? "Couldn't skip -- try again.");
    }
    setBusy(false);
  }

  async function handleSubmit() {
    setBusy(true);
    setActionError(null);
    setWarnedIncomplete(false);
    const { ok, data } = await postJson("/api/table-predictions/submit");
    if (ok) {
      setSubmittedAt(data.submittedAt);
      setJustSubmitted(true);
    } else {
      setActionError(data.error ?? "Couldn't submit -- try again.");
    }
    setBusy(false);
  }

  function handleSubmitClick() {
    if (boardComplete) {
      void handleSubmit();
      return;
    }
    setWarnedIncomplete(true);
  }

  if (locked) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        <h1 className="text-[1.9rem] font-extrabold text-ink">
          Predict the Table
        </h1>
        <p className="text-ink/70">
          {placedCount === teams.length
            ? "Locked in -- Predict the Table is locked after 31 August."
            : "Predict the Table is locked after 31 August. Here's what you had:"}
        </p>
        <ScoringSummary kind="table" />
        <BandSummary assignments={assignments} teamsById={teamsById} />
      </main>
    );
  }

  if (isSkipped) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        <h1 className="text-[1.9rem] font-extrabold text-ink">
          You skipped Predict the Table
        </h1>
        <p className="text-ink/70">
          No worries -- you can still call your table whenever you like.
        </p>
        <ScoringSummary kind="table" />
        <Button
          onClick={() => setIsSkipped(false)}
          fullWidth
          className="max-w-md"
        >
          Call my table
        </Button>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">
        Predict the Table
      </h1>
      {/* The instruction line is for someone who hasn't done this before.
          Once a table has been submitted it is five lines of nothing,
          pushing the player's actual table below the fold on a phone -- so
          it goes, and the persistent `?` link covers anyone who wants it
          back. */}
      {submittedAt ? null : (
        <p className="-mt-2 text-ink/70">
          {openBand
            ? "Tap clubs to add them to the open Band. Tap a Band's name to open or close it."
            : "Where will each Premier League club finish? Tap a Band to open it, then tap clubs to add them."}
        </p>
      )}
      <ScoringSummary kind="table" />

      <div className="-mt-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ink/50">
          <span>
            {placedCount} of {teams.length} placed
          </span>
          {openBand ? (
            <>
              <span aria-hidden>&middot;</span>
              <span>
                Band {bandPosition(openBand)} of {TABLE_BANDS.length}
              </span>
            </>
          ) : null}
          {!locked && !isLateJoiner ? (
            <>
              <span aria-hidden>&middot;</span>
              <LockCountdown
                deadlineIso={TABLE_PREDICTION_DEADLINE.toISOString()}
                now={now}
              />
            </>
          ) : null}
        </p>

        {placedCount > 0 ? (
          confirmingStartAgain ? (
            <span className="flex shrink-0 items-center gap-2 text-xs font-bold">
              <span className="text-ink/60">Start again?</span>
              <button
                type="button"
                onClick={handleStartAgain}
                disabled={startingAgain}
                className="-my-3 flex h-11 min-w-11 items-center justify-center px-2 text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingStartAgain(false)}
                className="-my-3 flex h-11 min-w-11 items-center justify-center px-2 text-ink/50 hover:text-ink"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingStartAgain(true)}
              disabled={startingAgain}
              className="-my-3 flex h-11 min-w-11 shrink-0 items-center justify-center px-2 text-xs font-bold text-ink/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start again
            </button>
          )
        ) : null}
      </div>

      {isLateJoiner ? (
        <p className="-mt-2 text-sm text-info">
          You joined after Gameweek 1 kicked off, so this one&apos;s totally
          optional -- submit whenever you like, or skip it.
        </p>
      ) : null}

      {submittedAt ? (
        <p className="-mt-2 flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Submitted &mdash; you can keep editing until 31 August.
        </p>
      ) : null}

      {saveError ? (
        <p role="alert" className="-mt-2 text-sm text-danger">
          {saveError}
        </p>
      ) : null}

      <BandsBoard
        teams={demoted.ordered}
        assignments={assignments}
        openBand={openBand}
        nextBand={nextBand}
        nextOutTeamId={nextOutTeamId}
        busyTeamIds={busyTeamIds}
        undo={undo}
        celebratingChampion={celebrating}
        demotedFrom={demoted.demotedFrom}
        boardComplete={boardComplete}
        onOpenBand={handleOpenBand}
        onCloseBand={() => handleOpenBand(null)}
        onTapTeam={handleTeamTap}
        onUndo={() => void handleUndo()}
      />

      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {warnedIncomplete && !validation.ok ? (
          <div
            role="alert"
            className="rounded-card border border-warning/50 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <TriangleAlert
                className="mt-0.5 size-5 shrink-0 text-warning"
                aria-hidden
              />
              <div>
                <h2 className="font-extrabold text-ink">
                  Your table needs a quick tidy-up
                </h2>
                <p className="mt-1 text-sm text-ink/70">
                  These groups do not have the right number of teams. You can
                  submit now, but they will miss their Band Bonus.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {validation.mismatches.map((mismatch) => {
                const difference = mismatch.actual - mismatch.expected;
                return (
                  <div
                    key={mismatch.band}
                    className="flex items-center justify-between gap-3 rounded-btn-sm bg-warning/10 px-3 py-2 text-sm"
                  >
                    <span className="font-extrabold text-ink">
                      {BAND_LABEL[mismatch.band]}
                    </span>
                    <span className="text-right font-bold text-ink/70 tabular-nums">
                      {mismatch.actual} of {mismatch.expected} teams
                      <span className="block text-xs font-semibold text-warning">
                        {difference > 0
                          ? `${difference} too many`
                          : `${Math.abs(difference)} more needed`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-col gap-2 md:flex-row">
              <Button
                onClick={handleSubmit}
                disabled={busy}
                fullWidth
                intent="secondary"
              >
                Submit anyway
              </Button>
              <Button
                onClick={() => setWarnedIncomplete(false)}
                disabled={busy}
                fullWidth
                intent="ghost"
              >
                Keep editing
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleSubmitClick}
            disabled={busy}
            fullWidth
            className="max-w-md"
          >
            {submittedAt ? "Submit table again" : "Submit my table"}
          </Button>
        )}

        {isLateJoiner ? (
          <Button
            intent="ghost"
            onClick={handleSkip}
            disabled={busy}
            fullWidth
            className="max-w-md"
          >
            Skip for now
          </Button>
        ) : null}
      </div>

      {justSubmitted ? (
        <SubmittedMoment
          assignments={assignments}
          teamsById={teamsById}
          onDismiss={() => setJustSubmitted(false)}
        />
      ) : null}

      {celebrating ? <ChampionCelebration /> : null}
    </main>
  );
}
