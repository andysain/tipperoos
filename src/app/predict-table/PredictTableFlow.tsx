"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScoringSummary } from "@/components/scoring/ScoringSummary";
import {
  bandPosition,
  championWasNamed,
  countsOf,
  dropInto,
  firstIncorrectlyFilledBand,
  modeFor,
  nextUnfilledBand,
  rosterOrder,
  startAgain as startAgainBoard,
  swapBands,
  tapWhileFilling,
  type Assignments,
  type PriorBandByTeam,
  type SwapResult,
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

// How long the swap-pulse animation (globals.css) plays before its
// justSwapped flag clears -- kept in one place so the state timeout and
// the CSS duration can't drift apart.
const SWAP_PULSE_MS = 500;

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
  // #118's return-visit landing: which Band opens on a visit is where the
  // work actually is, not always Champion -- Champion on a first (empty)
  // visit, the first incorrectly filled Band on a return (ADR 0008).
  const [openBand, setOpenBand] = useState<BandKey>(
    () =>
      firstIncorrectlyFilledBand(countsOf(initialAssignments)) ?? "champion",
  );
  const [lifted, setLifted] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [justSwapped, setJustSwapped] = useState<[string, string] | null>(null);

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

  const placedCount = Object.keys(assignments).length;
  const mode = modeFor(placedCount, teams.length);

  const counts = useMemo(() => countsOf(assignments), [assignments]);
  const validation = useMemo(() => validateBandCounts(counts), [counts]);

  // Only meaningful while filling -- review mode has no single open Band to
  // report a position for or advance from (issue #130).
  const nextBand =
    mode === "filling" ? nextUnfilledBand(openBand, counts) : null;

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
    },
    celebrateChampion = false,
  ) {
    if (busyTeamIds.includes(teamId)) return;
    setBusyTeamIds((prev) => [...prev, teamId]);
    setSaveError(null);
    const prevAssignments = assignments;
    const prevPrevious = previous;
    setAssignments(result.assignments);
    setPrevious(result.previous);
    if (result.movedFrom) {
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

    const nextBand = result.assignments[teamId];
    const { ok, data } = nextBand
      ? await postJson("/api/table-predictions/assign", {
          teamId,
          band: nextBand,
        })
      : await postJson("/api/table-predictions/unassign", { teamId });

    if (!ok) {
      setAssignments(prevAssignments);
      setPrevious(prevPrevious);
      setUndo(null);
      setSaveError(data.error ?? "Couldn't save that move -- try again.");
    } else {
      setIsSkipped(false);
      if (celebrateChampion && !championCelebrated.current) {
        championCelebrated.current = true;
        setCelebrating(true);
      }
    }
    setBusyTeamIds((prev) => prev.filter((id) => id !== teamId));
  }

  // Swap is always two assigns (both teams are already placed -- review
  // mode only exists once all 20 are), never an unassign.
  async function persistSwap(
    teamAId: string,
    teamBId: string,
    result: SwapResult,
  ) {
    if (busyTeamIds.includes(teamAId) || busyTeamIds.includes(teamBId)) {
      return;
    }
    setBusyTeamIds((prev) => [...prev, teamAId, teamBId]);
    setSaveError(null);
    const prevAssignments = assignments;
    const prevPrevious = previous;
    setAssignments(result.assignments);
    setPrevious(result.previous);

    const teamAName = teamsById.get(teamAId)?.name ?? "That team";
    const teamBName = teamsById.get(teamBId)?.name ?? "that team";
    setUndo({
      kind: "swap",
      teamA: { teamId: teamAId, band: result.swapped[0].movedFrom },
      teamB: { teamId: teamBId, band: result.swapped[1].movedFrom },
      label: `${teamAName} and ${teamBName} swapped Bands`,
    });
    setJustSwapped([teamAId, teamBId]);
    setTimeout(() => setJustSwapped(null), SWAP_PULSE_MS);

    const [aResult, bResult] = await Promise.all([
      postJson("/api/table-predictions/assign", {
        teamId: teamAId,
        band: result.assignments[teamAId],
      }),
      postJson("/api/table-predictions/assign", {
        teamId: teamBId,
        band: result.assignments[teamBId],
      }),
    ]);

    if (!aResult.ok || !bResult.ok) {
      setAssignments(prevAssignments);
      setPrevious(prevPrevious);
      setUndo(null);
      setJustSwapped(null);
      setSaveError(
        (!aResult.ok ? aResult.data.error : bResult.data.error) ??
          "Couldn't save that swap -- try again.",
      );
    } else {
      setIsSkipped(false);
    }
    setBusyTeamIds((prev) =>
      prev.filter((id) => id !== teamAId && id !== teamBId),
    );
  }

  function handleTeamTap(teamId: string) {
    if (mode === "review") {
      if (lifted === teamId) {
        setLifted(null);
        return;
      }
      if (lifted) {
        // Every team visible in review is already placed (review mode
        // only exists once all 20 are), so a second tap on a different
        // placed team is a swap, not a move (issue #131) -- unless the two
        // are already in the same Band, in which case swapping would be a
        // no-op: nothing to persist, animate, or offer an undo for. Treat
        // that tap as just re-lifting the newly tapped team instead.
        const teamAId = lifted;
        const teamBId = teamId;
        if (assignments[teamAId] === assignments[teamBId]) {
          setLifted(teamBId);
          return;
        }
        setLifted(null);
        const result = swapBands({ assignments, previous }, teamAId, teamBId);
        void persistSwap(teamAId, teamBId, result);
        return;
      }
      setLifted(teamId);
      return;
    }
    const result = tapWhileFilling({ assignments, previous }, teamId, openBand);
    // The champion ceremony: request the beat when this tap names the
    // champion (count 0 -> 1); persistTap spends it only on a saved move.
    void persistTap(
      teamId,
      result,
      championWasNamed(counts, countsOf(result.assignments)) &&
        !championCelebrated.current,
    );
  }

  function handleDropInto(band: BandKey) {
    if (!lifted) return;
    const teamId = lifted;
    const result = dropInto({ assignments, previous }, teamId, band);
    setLifted(null);
    void persistTap(teamId, result);
  }

  function handleUndo() {
    if (!undo) return;
    setUndo(null);
    if (undo.kind === "move") {
      const { teamId, band } = undo;
      const result = dropInto({ assignments, previous }, teamId, band);
      void persistTap(teamId, result);
      return;
    }
    // Swap undo: swapBands is symmetric, so swapping the same pair again
    // restores both teams to their pre-swap Bands.
    const { teamA, teamB } = undo;
    const result = swapBands(
      { assignments, previous },
      teamA.teamId,
      teamB.teamId,
    );
    void persistSwap(teamA.teamId, teamB.teamId, result);
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
    setUndo(null);
    setLifted(null);
    setOpenBand("champion");
    // The rebuilt board's first champion deserves the ceremony too -- a
    // Start again is a deliberate reset, not the same session's churn.
    championCelebrated.current = false;

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
    if (validation.ok) {
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
      <p className="-mt-2 text-ink/70">
        Where will each Premier League club finish? Tap a Band to open it, then
        tap clubs to add them.
      </p>
      <ScoringSummary kind="table" />

      <div className="-mt-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ink/50">
          <span>
            {placedCount} of {teams.length} placed
          </span>
          {mode === "filling" ? (
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
          Submitted -- you can keep editing until 31 August.
        </p>
      ) : null}

      {saveError ? (
        <p role="alert" className="-mt-2 text-sm text-danger">
          {saveError}
        </p>
      ) : null}

      <BandsBoard
        mode={mode}
        teams={roster}
        teamsById={teamsById}
        assignments={assignments}
        openBand={openBand}
        nextBand={nextBand}
        lifted={lifted}
        busyTeamIds={busyTeamIds}
        undo={undo}
        justSwapped={justSwapped}
        celebratingChampion={celebrating}
        onOpenBand={setOpenBand}
        onTapTeam={handleTeamTap}
        onDropInto={handleDropInto}
        onUndo={handleUndo}
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
