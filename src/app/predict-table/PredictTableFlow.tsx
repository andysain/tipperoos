"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CircleCheck } from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  type BandKey,
  TABLE_BANDS,
  validateBandCounts,
} from "@/lib/table-predictions/rules";

interface Team {
  id: string;
  name: string;
  shortCode: string | null;
  previousSeasonPosition: number | null;
}

function teamsInBand(
  assignments: Record<string, BandKey>,
  band: BandKey,
): string[] {
  return Object.entries(assignments)
    .filter(([, b]) => b === band)
    .map(([teamId]) => teamId);
}

function ordinal(n: number): string {
  const hundredRemainder = n % 100;
  if (hundredRemainder >= 11 && hundredRemainder <= 13) return `${n}th`;
  const suffix = (["th", "st", "nd", "rd"] as const)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

type BandTone = "success" | "info" | "warning" | "danger" | "neutral";

// Decorative emoji per Band -- purely a personalization/delight layer
// (DESIGN_SYSTEM.md's "emoji stay the personalization layer" split,
// distinct from lucide-react's functional icon chrome). `tone` reuses the
// *existing* semantic palette (success/info/warning/danger) rather than
// inventing new colors -- DESIGN_SYSTEM.md reserves `accent` for exactly
// two spots elsewhere.
const BAND_META: Record<
  BandKey,
  { emoji: string; blurb: string; tone: BandTone; positions: string }
> = {
  champion: {
    emoji: "🏆",
    blurb: "Wins the whole league!",
    tone: "success",
    positions: "1",
  },
  champions_league: {
    emoji: "⭐",
    blurb: "Top 4 -- plays Champions League next season",
    tone: "success",
    positions: "2-5",
  },
  europe: {
    emoji: "✈️",
    blurb: "5th-8th -- Europa League or Conference League",
    tone: "info",
    positions: "6-8",
  },
  mid_table: {
    emoji: "😌",
    blurb: "Comfortably mid-table, nothing to worry about",
    tone: "neutral",
    positions: "9-11",
  },
  lower_table: {
    emoji: "😬",
    blurb: "Lower half -- could do with a good run of form",
    tone: "neutral",
    positions: "12-14",
  },
  relegation_battle: {
    emoji: "⚠️",
    blurb: "Fighting hard to stay in the league",
    tone: "warning",
    positions: "15-17",
  },
  relegated: {
    emoji: "⬇️",
    blurb: "Bottom 3 -- drops down a division",
    tone: "danger",
    positions: "18-20",
  },
};

// Real club colors, used as a two-tone "kit stripe" on each team card --
// a deliberate, requested exception to DESIGN_SYSTEM.md's "no other colors"
// rule (see docs/adr/0003-predict-the-table-shape.md's build-log addendum),
// scoped to exactly this one identity cue. No crests/logos anywhere (still
// a hard trademark constraint) -- colors only.
// Club-sourced values -- where only one color was sourced, both stops are
// the same (a solid stripe) rather than inventing a second tone.
const CLUB_COLORS: Record<string, readonly [string, string]> = {
  ARS: ["#DB0007", "#FFFFFF"],
  AVL: ["#670E36", "#95BFE5"],
  BOU: ["#DA291C", "#000000"],
  BRE: ["#E03A3E", "#FFFFFF"],
  BHA: ["#0057B8", "#FFFFFF"],
  CHE: ["#034694", "#034694"],
  COV: ["#78C4F5", "#78C4F5"],
  CRY: ["#C4122E", "#1B458F"],
  EVE: ["#003399", "#003399"],
  FUL: ["#FFFFFF", "#000000"],
  HUL: ["#F18A00", "#000000"],
  IPS: ["#0044A9", "#0044A9"],
  LEE: ["#FFFFFF", "#FFCD00"],
  LIV: ["#C8102E", "#C8102E"],
  MCI: ["#6CABDD", "#6CABDD"],
  MUN: ["#DA291C", "#000000"],
  NEW: ["#000000", "#FFFFFF"],
  NOT: ["#DD0000", "#FFFFFF"],
  SUN: ["#EB172B", "#FFFFFF"],
  TOT: ["#FFFFFF", "#132257"],
};
const FALLBACK_KIT: readonly [string, string] = ["#9CA3AF", "#6B7280"];

function kitColors(shortCode: string | null): readonly [string, string] {
  if (!shortCode) return FALLBACK_KIT;
  return CLUB_COLORS[shortCode] ?? FALLBACK_KIT;
}

// A flat single-color stripe (c1 === c2, e.g. Chelsea's all-blue) is left
// alone -- a fake midline seam would look like a rendering glitch on those.
// A genuine two-tone stripe gets a hairline divider between the halves and a
// faint outer ring, so a white half (Leeds, Spurs, Fulham) stays visible
// against the card's own white background instead of disappearing into it.
function stripeStyle(
  c1: string,
  c2: string,
  angle: 90 | 180 = 180,
): CSSProperties {
  if (c1.toLowerCase() === c2.toLowerCase()) {
    return { background: c1, boxShadow: "inset 0 0 0 1px rgba(18,60,67,0.12)" };
  }
  return {
    background: `linear-gradient(${angle}deg, ${c1} calc(50% - 0.5px), rgba(18,60,67,0.22) calc(50% - 0.5px) calc(50% + 0.5px), ${c2} calc(50% + 0.5px))`,
    boxShadow: "inset 0 0 0 1px rgba(18,60,67,0.12)",
  };
}

// Cards per row matches the Band's target size, so a full/correct Band
// reads as one tidy row -- with a floor of 3 so an overfull Champion (target
// 1) doesn't wrap one-per-line. Tailwind needs literal class names (no
// dynamic "grid-cols-${n}" string), so this only ever returns one of the
// two grid widths our targets (1, 3, 4) actually produce.
function bandGridCols(band: (typeof TABLE_BANDS)[number]): string {
  return Math.max(band.target, 3) >= 4 ? "grid-cols-4" : "grid-cols-3";
}

function formatCountdown(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const positionBadge = tv({
  base: "inline-flex shrink-0 items-center justify-center rounded-badge px-2 py-1 text-[0.7rem] font-extrabold text-ink tabular-nums",
  variants: {
    tone: {
      success: "bg-success/20",
      info: "bg-info/20",
      warning: "bg-warning/30",
      danger: "bg-danger/20",
      neutral: "bg-ink/10",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const bandHeaderChip = tv({
  base: "inline-flex items-center gap-1.5 text-[0.8rem] font-bold tracking-[0.04em] text-ink uppercase",
});

const bandPickerRow = tv({
  base: "flex items-center gap-2.5 rounded-btn border border-paper-line bg-white px-3 py-2 text-left transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
  variants: {
    tone: {
      success: "border-l-4 border-l-success",
      info: "border-l-4 border-l-info",
      warning: "border-l-4 border-l-warning",
      danger: "border-l-4 border-l-danger",
      neutral: "",
    },
  },
  defaultVariants: { tone: "neutral" },
});

// A team's row card: a two-tone kit-stripe rail + code/name, in a denser
// format than a plain pill so a full Band's membership reads as a group at
// a glance rather than a wrapped cloud of small pills.
const teamCard = tv({
  base: "group relative flex items-center gap-0 overflow-hidden rounded-btn border py-2 pr-1 pl-3.5 text-left transition",
  variants: {
    tone: {
      readonly: "border-paper-line bg-white",
      ok: "border-paper-line bg-white",
      mismatch: "border-warning/60 bg-warning/5",
      // The specific team(s) pushing a Band over its target -- a tilt +
      // ring, not just a uniform tint across the whole Band, so it's
      // obvious which one to tap.
      excess: "-rotate-1 border-danger bg-danger/5 ring-2 ring-danger/40",
    },
  },
  defaultVariants: { tone: "ok" },
});

const ghostSocket = tv({
  base: "flex items-center rounded-btn border border-dashed border-paper-line px-3.5 py-2 text-sm text-ink/30",
});

// The dot-row "how filled is this Band" readout (the thing you liked in the
// Verdicts prototype) -- always visible, not just when something's wrong,
// so the whole table's progress reads at a glance.
function FillDots({
  filled,
  target,
  tone,
}: {
  filled: number;
  target: number;
  tone: BandTone;
}) {
  // Filled dots are always the same neutral-ink color -- "how full" must read
  // identically across every Band, since a tone-colored fill (e.g. red for
  // Relegation Battle) could misread as a correctness signal rather than
  // progress. The Band's own tone still shows, just on the *empty* slots, as
  // a preview accent rather than a status.
  const emptyOutline: Record<BandTone, string> = {
    success: "border-success/40",
    info: "border-info/40",
    warning: "border-warning/50",
    danger: "border-danger/40",
    neutral: "border-paper-line",
  };
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          className={`size-2 rounded-full ${
            i < filled ? "bg-ink/70" : `border ${emptyOutline[tone]}`
          }`}
        />
      ))}
    </span>
  );
}

function TeamCard({
  team,
  tone,
  bandLabel,
  onOpen,
  onRemove,
  busy,
  removing,
  emphasis,
}: {
  team: Team;
  tone: "readonly" | "ok" | "mismatch" | "excess";
  bandLabel: string;
  onOpen?: () => void;
  onRemove?: () => void;
  busy?: boolean;
  removing?: boolean;
  emphasis?: boolean;
}) {
  const [c1, c2] = kitColors(team.shortCode);
  const cls = `${teamCard({ tone })} ${emphasis ? "col-span-full" : ""} ${
    removing ? "motion-safe:animate-chip-out" : ""
  }`;

  const stripe = (
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-2"
      style={stripeStyle(c1, c2)}
    />
  );
  const codeAndName = (
    <span className="flex min-w-0 flex-col">
      <span
        className={`truncate font-extrabold tracking-wide text-ink ${emphasis ? "text-base" : "text-sm"}`}
      >
        {team.shortCode ?? "?"}
      </span>
      <span
        title={team.name}
        className="truncate text-[0.7rem] font-medium text-ink/55"
      >
        {team.name}
      </span>
    </span>
  );
  const label = (
    <span className="relative flex min-w-0 flex-1 items-center gap-2">
      {emphasis ? (
        <span className="text-xl" aria-hidden>
          🏆
        </span>
      ) : null}
      {codeAndName}
    </span>
  );

  if (!onOpen && !onRemove) {
    return (
      <div className={cls}>
        {stripe}
        {label}
      </div>
    );
  }

  return (
    <div className={cls}>
      {stripe}
      {onOpen ? (
        <button
          type="button"
          disabled={busy}
          onClick={onOpen}
          title="Move to a different Band"
          aria-label={`Move ${team.name} out of ${bandLabel}`}
          className="relative flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {emphasis ? (
            <span className="text-xl" aria-hidden>
              🏆
            </span>
          ) : null}
          {codeAndName}
        </button>
      ) : (
        label
      )}
      {onRemove ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          title="Remove and call again"
          aria-label={`Remove ${team.name} from ${bandLabel} and call them again`}
          className="relative ml-1 shrink-0 rounded-btn-sm px-2 py-1 text-ink/30 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

// A visual divider for the one boundary in this table that isn't just
// another band change -- the real cliff-edge of a Premier League season.
function DropDivider() {
  return (
    <div className="my-1 flex items-center gap-2" aria-hidden>
      <span
        className="h-1 flex-1 rounded-full opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, var(--color-danger) 0 6px, transparent 6px 12px)",
        }}
      />
      <span className="shrink-0 text-[0.65rem] font-extrabold tracking-[0.2em] text-danger uppercase">
        The Drop
      </span>
      <span
        className="h-1 flex-1 rounded-full opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, var(--color-danger) 0 6px, transparent 6px 12px)",
        }}
      />
    </div>
  );
}

interface PredictTableFlowProps {
  teams: Team[];
  initialAssignments: Record<string, BandKey>;
  isLateJoiner: boolean;
  locked: boolean;
  initialIsSkipped: boolean;
  initialSubmittedAt: string | null;
  gameweekOneKickoff: string | null;
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <span className="flex items-center gap-2">
      <span className="rounded-badge bg-ink/10 px-2 py-0.5 text-xs font-bold tracking-wide text-ink">
        {team.shortCode ?? "?"}
      </span>
      {team.name}
    </span>
  );
}

function BandHeader({
  band,
  filled,
  mismatch,
  onClear,
  clearing,
}: {
  band: (typeof TABLE_BANDS)[number];
  filled: number;
  mismatch?: { actual: number; expected: number };
  onClear?: () => void;
  clearing?: boolean;
}) {
  const meta = BAND_META[band.key];
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={positionBadge({ tone: meta.tone })}>
          {meta.positions}
        </span>
        <h2 className={bandHeaderChip()}>
          <span aria-hidden>{meta.emoji}</span>
          {band.label}
        </h2>
        {onClear && filled > 0 ? (
          <button
            type="button"
            onClick={onClear}
            disabled={clearing}
            className="text-xs font-bold text-ink/40 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <FillDots filled={filled} target={band.target} tone={meta.tone} />
        {mismatch ? (
          <span className="text-xs font-bold text-warning">
            <span className="sr-only">Currently has </span>
            {mismatch.actual} / {mismatch.expected}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// A live "locks in" readout -- DESIGN_SYSTEM.md's palette table already
// reserves `warning` for exactly this ("Locks-soon countdown"), just not
// wired up anywhere yet. Only ever shown to on-time players before lock --
// Late Joiners are never locked (CLAUDE.md).
function LockCountdown({
  kickoffIso,
  now,
}: {
  kickoffIso: string;
  now: number;
}) {
  const remainingMs = new Date(kickoffIso).getTime() - now;
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

export function PredictTableFlow({
  teams,
  initialAssignments,
  isLateJoiner,
  locked,
  initialIsSkipped,
  initialSubmittedAt,
  gameweekOneKickoff,
}: PredictTableFlowProps) {
  const [assignments, setAssignments] =
    useState<Record<string, BandKey>>(initialAssignments);
  const [queueOrder, setQueueOrder] = useState<string[]>(() =>
    teams.map((team) => team.id),
  );
  const [isSkipped, setIsSkipped] = useState(initialIsSkipped);
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSealed, setJustSealed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The team currently in the Picker because a player explicitly tapped an
  // already-placed team to reconsider it -- takes priority over the
  // next-to-call team from the queue below. Drives whether the Picker opens
  // for "reconsider an existing pick" vs. "call the next uncalled team".
  const [reconsiderTeamId, setReconsiderTeamId] = useState<string | null>(null);
  // When the chosen Band is already at its target, this names that Band and
  // switches the Picker's body from the Band list to <SwapChooser> --
  // "which of this Band's current occupants do you want to swap with?".
  const [swapChooserBand, setSwapChooserBand] = useState<BandKey | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sealedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (sealedTimeout.current) clearTimeout(sealedTimeout.current);
    },
    [],
  );

  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  const unsortedQueue = useMemo(
    () => queueOrder.filter((id) => !(id in assignments)),
    [queueOrder, assignments],
  );

  const counts = useMemo(() => {
    const result: Partial<Record<BandKey, number>> = {};
    for (const band of Object.values(assignments)) {
      result[band] = (result[band] ?? 0) + 1;
    }
    return result;
  }, [assignments]);

  const validation = useMemo(() => validateBandCounts(counts), [counts]);

  // Guards against a double-tap firing two concurrent requests for the same
  // team (e.g. a fast double-click before the button visually disables) --
  // without this, the second request can race the first's insert and hit a
  // unique-constraint error on the server.
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);

  // Shared shape for every board mutation below (assign/unassign/clear):
  // apply the optimistic local change, fire the request(s), and roll the
  // change back if any request failed. Each call site decides exactly what
  // `apply`/`rollback` touch, since assign/unassign/clear each mutate a
  // different combination of `assignments`/`queueOrder`.
  async function saveOptimistically(
    apply: () => void,
    rollback: () => void,
    requests: Promise<{ ok: boolean; data: { error?: string } }>[],
    fallbackError: string,
  ) {
    setSaveError(null);
    apply();
    const results = await Promise.all(requests);
    const failed = results.find((result) => !result.ok);
    if (failed) {
      rollback();
      setSaveError(failed.data.error ?? fallbackError);
    }
    return results;
  }

  async function assignTeam(teamId: string, band: BandKey) {
    if (busyTeamId === teamId) return;
    setBusyTeamId(teamId);
    const previous = assignments;
    await saveOptimistically(
      () => {
        setAssignments((prev) => ({ ...prev, [teamId]: band }));
        setIsSkipped(false);
      },
      () => setAssignments(previous),
      [postJson("/api/table-predictions/assign", { teamId, band })],
      "Couldn't save that move -- try again.",
    );
    setBusyTeamId(null);
  }

  async function unassignTeam(teamId: string, requeue: boolean) {
    if (busyTeamId === teamId) return;
    setBusyTeamId(teamId);
    const previous = assignments;
    await saveOptimistically(
      () => {
        setAssignments((prev) => {
          const next = { ...prev };
          delete next[teamId];
          return next;
        });
        if (requeue) {
          // Removed teams go straight back to the front of the queue -- an
          // immediate "call it again" rather than losing their place entirely.
          setQueueOrder((prev) => [
            teamId,
            ...prev.filter((id) => id !== teamId),
          ]);
        }
      },
      () => setAssignments(previous),
      [postJson("/api/table-predictions/unassign", { teamId })],
      "Couldn't remove that team -- try again.",
    );
    setBusyTeamId(null);
  }

  // Bulk clear -- for when a player wants to reshuffle a whole Band (or the
  // whole board) freely rather than doing careful one-for-one swaps. Sends
  // every cleared team back to the front of the queue, in their prior order,
  // so re-calling them is just working through the queue again.
  const [bulkClearing, setBulkClearing] = useState(false);
  async function clearTeams(teamIds: string[]) {
    if (teamIds.length === 0 || bulkClearing) return;
    setBulkClearing(true);
    const previousAssignments = assignments;
    const previousQueue = queueOrder;
    const clearSet = new Set(teamIds);
    await saveOptimistically(
      () => {
        setAssignments((prev) => {
          const next = { ...prev };
          for (const id of teamIds) delete next[id];
          return next;
        });
        setQueueOrder((prev) => [
          ...teamIds,
          ...prev.filter((id) => !clearSet.has(id)),
        ]);
      },
      () => {
        setAssignments(previousAssignments);
        setQueueOrder(previousQueue);
      },
      teamIds.map((teamId) =>
        postJson("/api/table-predictions/unassign", { teamId }),
      ),
      "Couldn't clear those teams -- try again.",
    );
    setBulkClearing(false);
  }

  function clearBand(bandKey: BandKey) {
    clearTeams(teamsInBand(assignments, bandKey));
  }

  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  function clearAllTeams() {
    setConfirmingClearAll(false);
    clearTeams(Object.keys(assignments));
  }

  function handleLater() {
    const currentId = unsortedQueue[0];
    if (!currentId) return;
    setQueueOrder((prev) => {
      const index = prev.indexOf(currentId);
      if (index === -1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      next.push(currentId);
      return next;
    });
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
    const { ok, data } = await postJson("/api/table-predictions/submit");
    if (ok) {
      setSubmittedAt(data.submittedAt);
      if (sealedTimeout.current) clearTimeout(sealedTimeout.current);
      setJustSealed(true);
      sealedTimeout.current = setTimeout(() => setJustSealed(false), 2400);
    } else {
      setActionError(data.error ?? "Couldn't submit -- try again.");
    }
    setBusy(false);
  }

  // How long the chip-out shrink plays before the team actually leaves the
  // Band (see globals.css --animate-chip-out).
  const removeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  function handleRemove(teamId: string) {
    setRemovingIds((prev) => new Set(prev).add(teamId));
    removeTimeout.current = setTimeout(() => {
      unassignTeam(teamId, true);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
    }, 160);
  }

  const activePickTeamId = reconsiderTeamId ?? unsortedQueue[0] ?? null;
  const activePickTeam = activePickTeamId
    ? teamsById.get(activePickTeamId)
    : undefined;
  const activePickFromBand = activePickTeamId
    ? (assignments[activePickTeamId] ?? null)
    : null;

  function openPickerFor(teamId: string) {
    setSwapChooserBand(null);
    setReconsiderTeamId(teamId);
  }

  function closePicker() {
    setReconsiderTeamId(null);
    setSwapChooserBand(null);
  }

  function chooseBand(band: BandKey) {
    if (!activePickTeamId) return;
    if (band === activePickFromBand) {
      closePicker();
      return;
    }
    const target = TABLE_BANDS.find((b) => b.key === band);
    const currentCount = teamsInBand(assignments, band).length;
    if (target && currentCount >= target.target) {
      setSwapChooserBand(band);
      return;
    }
    assignTeam(activePickTeamId, band);
    closePicker();
  }

  function chooseSwapOccupant(occupantId: string) {
    if (!activePickTeamId || !swapChooserBand) return;
    if (activePickFromBand) {
      // A genuine swap: both teams already had a Band, so they trade places.
      assignTeam(activePickTeamId, swapChooserBand);
      assignTeam(occupantId, activePickFromBand);
    } else {
      // The active pick is a fresh, never-placed team -- the bumped
      // occupant has nowhere reciprocal to go, so it heads back to the
      // queue to be called again, same as a manual remove.
      unassignTeam(occupantId, true);
      assignTeam(activePickTeamId, swapChooserBand);
    }
    closePicker();
  }

  if (locked) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <Card className="w-full max-w-md">
          <h1 className="text-[1.9rem] font-extrabold text-ink">
            Predict the Table
          </h1>
          <p className="mt-1 mb-6 text-ink/70">
            {Object.keys(assignments).length === 20
              ? "Locked in -- Gameweek 1 has kicked off."
              : "Gameweek 1 has kicked off, so this is locked. Here's what you had:"}
          </p>
          <BandSummary assignments={assignments} teamsById={teamsById} />
        </Card>
      </main>
    );
  }

  if (isSkipped) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="text-[1.9rem] font-extrabold text-ink">
            You skipped Predict the Table
          </h1>
          <p className="mt-1 mb-6 text-ink/70">
            No worries -- you can still call your table whenever you like.
          </p>
          <Button onClick={() => setIsSkipped(false)} fullWidth>
            Call my table
          </Button>
        </Card>
      </main>
    );
  }

  const doneCalling = unsortedQueue.length === 0;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
      <Card className="relative w-full max-w-md overflow-hidden md:max-w-4xl md:overflow-visible">
        <h1 className="text-[1.9rem] font-extrabold text-ink">
          Predict the Table
        </h1>
        <p className="mt-1 text-ink/70">
          Where will each Premier League club finish? Tap a team to place or
          swap it.
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-ink/50">
            <span>
              {teams.length - unsortedQueue.length} of {teams.length} called
            </span>
            {!locked && !isLateJoiner && gameweekOneKickoff ? (
              <>
                <span aria-hidden>&middot;</span>
                <LockCountdown kickoffIso={gameweekOneKickoff} now={now} />
              </>
            ) : null}
          </p>

          {Object.keys(assignments).length > 0 ? (
            confirmingClearAll ? (
              <span className="flex shrink-0 items-center gap-2 text-xs font-bold">
                <span className="text-ink/60">Clear all?</span>
                <button
                  type="button"
                  onClick={clearAllTeams}
                  disabled={bulkClearing}
                  className="text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClearAll(false)}
                  className="text-ink/50 hover:text-ink"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClearAll(true)}
                disabled={bulkClearing}
                className="shrink-0 text-xs font-bold text-ink/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear all
              </button>
            )
          ) : null}
        </div>

        {isLateJoiner ? (
          <p className="mt-2 text-sm text-info">
            You joined after Gameweek 1 kicked off, so this one&apos;s totally
            optional -- submit whenever you like, or skip it.
          </p>
        ) : null}

        {submittedAt && doneCalling && validation.ok ? (
          <p
            role="status"
            className="mt-2 flex items-center gap-1.5 text-sm text-success"
          >
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            Submitted, and every Band looks right -- keep editing anytime until
            Gameweek 1 kicks off.
          </p>
        ) : (
          <>
            {submittedAt ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-success">
                <CircleCheck className="size-4 shrink-0" aria-hidden />
                Submitted -- you can keep editing until Gameweek 1 kicks off.
              </p>
            ) : null}

            {doneCalling ? (
              validation.ok ? (
                <p
                  role="status"
                  className="mt-2 flex items-center gap-1.5 text-sm text-success"
                >
                  <CircleCheck className="size-4 shrink-0" aria-hidden />
                  Every Band looks right!
                </p>
              ) : (
                <p role="status" className="mt-2 text-sm text-warning">
                  Some Bands don&apos;t match yet -- tap a team to move it.
                </p>
              )
            ) : null}
          </>
        )}

        {saveError ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {saveError}
          </p>
        ) : null}

        <div className="mt-6 md:flex md:items-start md:gap-5">
          <div className="md:min-w-0 md:flex-1">
            <BandsBoard
              assignments={assignments}
              teamsById={teamsById}
              busyTeamId={busyTeamId}
              removingIds={removingIds}
              validation={validation}
              onOpenPicker={openPickerFor}
              onRemove={handleRemove}
              onClearBand={clearBand}
              clearing={bulkClearing}
            />
          </div>

          {activePickTeam ? (
            <>
              <button
                type="button"
                onClick={closePicker}
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 bg-ink/20 md:hidden"
              />
              <div className="fixed inset-x-0 bottom-0 z-20 md:sticky md:top-4 md:z-auto md:w-80 md:shrink-0 md:self-start">
                <Picker
                  team={activePickTeam}
                  fromBand={activePickFromBand}
                  disabled={busyTeamId === activePickTeam.id}
                  swapChooserBand={swapChooserBand}
                  assignments={assignments}
                  teamsById={teamsById}
                  onChooseBand={chooseBand}
                  onChooseSwapOccupant={chooseSwapOccupant}
                  onCancelSwap={() => setSwapChooserBand(null)}
                  onLater={
                    !activePickFromBand && unsortedQueue.length > 1
                      ? handleLater
                      : undefined
                  }
                  onClose={closePicker}
                />
              </div>
            </>
          ) : null}
        </div>

        {actionError ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {actionError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          {doneCalling ? (
            <Button
              onClick={handleSubmit}
              disabled={!validation.ok || busy}
              fullWidth
            >
              {submittedAt ? "Re-submit" : "Submit my table"}
            </Button>
          ) : null}

          {isLateJoiner ? (
            <Button
              intent="ghost"
              onClick={handleSkip}
              disabled={busy}
              fullWidth
            >
              Skip for now
            </Button>
          ) : null}
        </div>

        {justSealed ? (
          <SealedMoment
            assignments={assignments}
            teamsById={teamsById}
            onDismiss={() => setJustSealed(false)}
          />
        ) : null}
      </Card>
    </main>
  );
}

function BandsBoard({
  assignments,
  teamsById,
  busyTeamId,
  removingIds,
  validation,
  onOpenPicker,
  onRemove,
  onClearBand,
  clearing,
}: {
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
  busyTeamId: string | null;
  removingIds: Set<string>;
  validation: ReturnType<typeof validateBandCounts>;
  onOpenPicker: (teamId: string) => void;
  onRemove: (teamId: string) => void;
  onClearBand: (band: BandKey) => void;
  clearing: boolean;
}) {
  const mismatchByBand = new Map(validation.mismatches.map((m) => [m.band, m]));

  return (
    <div className="flex flex-col gap-4">
      {TABLE_BANDS.map((band) => {
        const teamIds = teamsInBand(assignments, band.key);
        const mismatch = mismatchByBand.get(band.key);
        const isOverfull = teamIds.length > band.target;
        const isChampionSingle =
          band.key === "champion" && teamIds.length === 1;
        const filled = Math.min(teamIds.length, band.target);

        return (
          <div key={band.key}>
            {band.key === "relegated" ? <DropDivider /> : null}
            <BandHeader
              band={band}
              filled={filled}
              mismatch={mismatch}
              onClear={() => onClearBand(band.key)}
              clearing={clearing}
            />
            <div className={`mt-2 grid ${bandGridCols(band)} gap-1.5`}>
              {teamIds.length === 0 ? (
                <p className="col-span-full text-sm text-ink/40">
                  {band.key === "champion"
                    ? "Call a champion to fill this slot."
                    : "-"}
                </p>
              ) : (
                teamIds.map((teamId, index) => {
                  const team = teamsById.get(teamId);
                  if (!team) return null;
                  const isExcess = isOverfull && index >= band.target;
                  return (
                    <TeamCard
                      key={teamId}
                      team={team}
                      bandLabel={band.label}
                      tone={isExcess ? "excess" : mismatch ? "mismatch" : "ok"}
                      busy={busyTeamId === team.id}
                      removing={removingIds.has(teamId)}
                      emphasis={isChampionSingle}
                      onOpen={() => onOpenPicker(teamId)}
                      onRemove={() => onRemove(teamId)}
                    />
                  );
                })
              )}
              {Array.from(
                { length: Math.max(0, band.target - teamIds.length) },
                (_, i) => (
                  <span
                    key={`ghost-${i}`}
                    aria-hidden
                    className={ghostSocket()}
                  >
                    empty
                  </span>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SwapChooser({
  band,
  assignments,
  teamsById,
  onChoose,
  onBack,
}: {
  band: BandKey;
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
  onChoose: (teamId: string) => void;
  onBack: () => void;
}) {
  const meta = BAND_META[band];
  const bandInfo = TABLE_BANDS.find((b) => b.key === band);
  const occupantIds = teamsInBand(assignments, band);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-2 text-xs font-bold text-ink/50 hover:text-ink"
      >
        ← Back
      </button>
      <p className="mb-2 text-sm font-bold text-ink">
        <span aria-hidden>{meta.emoji}</span> {bandInfo?.label} is full -- swap
        with:
      </p>
      <div className="flex flex-col gap-2">
        {occupantIds.map((id) => {
          const team = teamsById.get(id);
          if (!team) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChoose(id)}
              className="flex items-center gap-2 rounded-btn border border-paper-line bg-white px-3 py-2 text-left transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <TeamBadge team={team} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Picker({
  team,
  fromBand,
  disabled,
  swapChooserBand,
  assignments,
  teamsById,
  onChooseBand,
  onChooseSwapOccupant,
  onCancelSwap,
  onLater,
  onClose,
}: {
  team: Team;
  fromBand: BandKey | null;
  disabled: boolean;
  swapChooserBand: BandKey | null;
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
  onChooseBand: (band: BandKey) => void;
  onChooseSwapOccupant: (teamId: string) => void;
  onCancelSwap: () => void;
  onLater?: () => void;
  onClose: () => void;
}) {
  const context =
    team.previousSeasonPosition != null
      ? `Finished ${ordinal(team.previousSeasonPosition)} last season`
      : "Promoted this season";
  const [c1, c2] = kitColors(team.shortCode);
  const isReconsider = fromBand !== null;

  return (
    <div className="grid max-h-[92svh] grid-rows-[auto_auto_auto_1fr_auto] overflow-hidden rounded-t-card border border-paper-line bg-white shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.35)] md:max-h-[85svh] md:rounded-card md:shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)]">
      <div className="flex justify-center pt-3 pb-1 md:hidden" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-paper-line" />
      </div>

      <div className="flex items-center justify-between px-4 pt-1 pb-1 md:px-4 md:pt-4">
        <p className="text-[0.7rem] leading-normal font-bold tracking-wide text-ink/50 uppercase">
          {isReconsider ? "Move this team" : "Where do they finish?"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-ink/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          &times;
        </button>
      </div>

      <div className="relative mx-3.5 mt-1.5 overflow-hidden rounded-card border border-paper-line bg-paper p-2 text-center md:mx-4 md:mt-2 md:p-3.5">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={stripeStyle(c1, c2, 90)}
        />
        <p className="text-[0.95rem] font-bold text-ink md:text-[1.1rem]">
          <TeamBadge team={team} />
        </p>
        <p className="mt-0.5 text-xs text-ink/60">{context}</p>
      </div>

      {/* This row is the grid's 1fr track -- it's the only one allowed to
          shrink, so it (not the whole sheet) is what scrolls. CSS Grid's 1fr
          tracks shrink correctly without flexbox's "min-height: auto" trap,
          which is what silently broke scrolling in earlier attempts here. */}
      <div className="relative min-h-0">
        <div className="h-full overflow-y-auto px-3.5 py-2 md:px-4 md:py-3">
          {swapChooserBand ? (
            <SwapChooser
              band={swapChooserBand}
              assignments={assignments}
              teamsById={teamsById}
              onChoose={onChooseSwapOccupant}
              onBack={onCancelSwap}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {TABLE_BANDS.map((band) => {
                const meta = BAND_META[band.key];
                const filled = Math.min(
                  teamsInBand(assignments, band.key).length,
                  band.target,
                );
                const isCurrent = band.key === fromBand;
                return (
                  <div key={band.key}>
                    {band.key === "relegated" ? <DropDivider /> : null}
                    <button
                      type="button"
                      disabled={disabled || isCurrent}
                      onClick={() => onChooseBand(band.key)}
                      aria-label={`Place ${team.name} in ${band.label}`}
                      className={`${bandPickerRow({ tone: meta.tone })} ${
                        isCurrent ? "ring-2 ring-accent/50" : ""
                      }`}
                    >
                      <span className="text-xl" aria-hidden>
                        {meta.emoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                        {band.label}
                      </span>
                      {isCurrent ? (
                        <span className="shrink-0 rounded-badge bg-ink/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-ink/60 uppercase">
                          Here
                        </span>
                      ) : (
                        <FillDots
                          filled={filled}
                          target={band.target}
                          tone={meta.tone}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent"
          aria-hidden
        />
      </div>

      {!swapChooserBand ? (
        <div className="px-3.5 pb-2.5 md:px-4 md:pb-3.5">
          {!isReconsider && onLater ? (
            <button
              type="button"
              onClick={onLater}
              disabled={disabled}
              className="w-full text-center text-sm font-bold text-ink/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              Not sure? Call them later
            </button>
          ) : null}
          {isReconsider ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full text-center text-sm font-bold text-ink/50 hover:text-ink"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BandSummary({
  assignments,
  teamsById,
}: {
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {TABLE_BANDS.map((band) => {
        const teamIds = teamsInBand(assignments, band.key);
        const isChampion = band.key === "champion";

        return (
          <div key={band.key}>
            {band.key === "relegated" ? <DropDivider /> : null}
            <BandHeader
              band={band}
              filled={Math.min(teamIds.length, band.target)}
            />
            <div className={`mt-2 grid ${bandGridCols(band)} gap-1.5`}>
              {teamIds.length === 0 ? (
                <span className="text-sm text-ink/40">-</span>
              ) : (
                teamIds.map((teamId) => {
                  const team = teamsById.get(teamId);
                  if (!team) return null;
                  return (
                    <TeamCard
                      key={teamId}
                      team={team}
                      tone="readonly"
                      bandLabel={band.label}
                      emphasis={isChampion && teamIds.length === 1}
                    />
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A handful of falling confetti pieces, reusing the existing semantic
// tones (never a new color -- DESIGN_SYSTEM.md's "no other colors" rule).
// Purely decorative: aria-hidden, and skipped outright under
// prefers-reduced-motion rather than just not animating.
const CONFETTI: { left: number; delay: number; tone: BandTone }[] = [
  { left: 8, delay: 0, tone: "success" },
  { left: 20, delay: 0.08, tone: "warning" },
  { left: 33, delay: 0.02, tone: "info" },
  { left: 46, delay: 0.14, tone: "danger" },
  { left: 58, delay: 0.05, tone: "success" },
  { left: 70, delay: 0.11, tone: "info" },
  { left: 82, delay: 0.03, tone: "warning" },
  { left: 92, delay: 0.09, tone: "danger" },
];

const confettiPiece = tv({
  base: "absolute top-0 h-2 w-2 rounded-sm motion-safe:animate-confetti-fall",
  variants: {
    tone: {
      success: "bg-success",
      info: "bg-info",
      warning: "bg-warning",
      danger: "bg-danger",
      neutral: "bg-ink/30",
    },
  },
});

function SealedMoment({
  assignments,
  teamsById,
  onDismiss,
}: {
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
  onDismiss: () => void;
}) {
  const [shown, setShown] = useState(false);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    // Moves focus onto the overlay so screen readers announce the
    // celebration text as soon as it appears, since it's inserted
    // dynamically rather than being part of the initial page load.
    dismissButtonRef.current?.focus();
    return () => cancelAnimationFrame(id);
  }, []);

  const championId = teamsInBand(assignments, "champion")[0];
  const champion = championId ? teamsById.get(championId) : undefined;

  return (
    <button
      ref={dismissButtonRef}
      type="button"
      onClick={onDismiss}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-card bg-paper/95 text-center backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 motion-reduce:hidden">
        {CONFETTI.map((piece, i) => (
          <span
            key={i}
            aria-hidden
            className={confettiPiece({ tone: piece.tone })}
            style={{
              left: `${piece.left}%`,
              animationDelay: `${piece.delay}s`,
            }}
          />
        ))}
      </div>

      <div
        className={`transition motion-reduce:transition-none motion-safe:duration-500 ${
          shown ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
      >
        <div className="text-5xl">🏆</div>
        <p className="mt-2 text-xl font-extrabold text-ink">
          You&apos;re locked in!
        </p>
        <p className="mt-1 max-w-[26ch] text-sm text-ink/70">
          Submitted -- you can keep editing until Gameweek 1 kicks off.
        </p>
        {champion ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-btn bg-success/10 px-3 py-2 text-sm font-bold text-ink">
            🏆 <TeamBadge team={champion} /> to win it all
          </div>
        ) : null}
      </div>
    </button>
  );
}
