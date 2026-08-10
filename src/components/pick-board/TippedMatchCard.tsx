"use client";

import { useState } from "react";
import { Dices, Star } from "lucide-react";
import { tv } from "tailwind-variants";
import {
  decomposeCountdown,
  formatCountdown,
  formatKickoffInTimeZone,
} from "@/lib/dates/kickoff-format";
import { badgeTextColor, matchBadgeColors } from "@/lib/teams/kit-colors";

export interface TippedMatchTeam {
  name: string;
  shortCode: string | null;
  /** Rendered only when present -- CLAUDE.md: degrade to absent, not zero. */
  leaguePosition: number | null;
}

export type TippedMatchProvenance = "top_matchup" | "random_pick";

/**
 * The 5 states docs/adr/0007-home-surface-and-pick-entry.md draws for a
 * Tipped Match card. Skipped Slot and Voided Match presentation is
 * deferred by that ADR and out of this component's scope (issue #15
 * decision 7) -- the parent renders nothing in this card's place for
 * those, rather than this component growing extra kinds for them.
 *
 * Rebuilt to match issue #15's own approved design prototype ("Pick card,
 * final", v6) -- the ink header (position, club-code badge, full team
 * name, "Home" label, status chip) is present in every state, not only
 * once settled; only the status chip and the body beneath the seam bar
 * change. The previous shipped version had drifted from that prototype
 * (no header/chip/seam at all in the entry state) with nothing in issue
 * #15's decision log explaining why -- this restores it.
 */
export type TippedMatchCardState =
  | { kind: "entry" }
  | { kind: "filed"; ownHomeScore: number; ownAwayScore: number }
  | {
      kind: "locked";
      ownHomeScore: number | null;
      ownAwayScore: number | null;
    }
  | {
      kind: "live";
      homeScore: number;
      awayScore: number;
      ownHomeScore: number | null;
      ownAwayScore: number | null;
    }
  | {
      kind: "finished";
      homeScore: number;
      awayScore: number;
      ownHomeScore: number | null;
      ownAwayScore: number | null;
      points: number | null;
    };

export interface TippedMatchCardProps {
  home: TippedMatchTeam;
  away: TippedMatchTeam;
  kickoffUtcIso: string;
  /** IANA timezone to render kickoff/countdown in -- see kickoff-format.ts. */
  timeZone: string;
  now: Date;
  provenance: TippedMatchProvenance;
  state: TippedMatchCardState;
  /**
   * Awaited, not optimistic (issue #15 decision 2): the card disables
   * input and shows a "Filing…" stamp while this is pending, and on
   * rejection returns to an empty entry state with an inline error --
   * never shows "Filed" before the write is actually confirmed.
   */
  onSave: (homeScore: number, awayScore: number) => Promise<void>;
}

const provenanceLabel: Record<TippedMatchProvenance, string> = {
  top_matchup: "Top matchup",
  random_pick: "Random pick",
};
const ProvenanceIcon: Record<TippedMatchProvenance, typeof Star> = {
  top_matchup: Star,
  random_pick: Dices,
};

function ordinalSuffix(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return "th";
  return (["th", "st", "nd", "rd"] as const)[n % 10] ?? "th";
}

/**
 * Rounded-rect club-code chip -- the one badge shape used everywhere on the
 * card now (header team rows and the plate's score line alike), replacing
 * the older circular badge that only ever appeared in the settled plate.
 */
function CodeBadge({
  shortCode,
  fill,
}: {
  shortCode: string | null;
  fill: string;
}) {
  const textToken = badgeTextColor(fill);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[0.7rem] font-extrabold tracking-wide ${
        textToken === "ink" ? "text-ink" : "text-paper"
      }`}
      style={{ background: fill }}
      aria-hidden
    >
      {shortCode ?? "?"}
    </span>
  );
}

type ChipTone = "open" | "locked" | "final";

const chipStyles = tv({
  base: "shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-bold uppercase tracking-wide",
  variants: {
    tone: {
      open: "bg-paper/15 text-paper",
      locked: "bg-accent text-accent-ink",
      final: "bg-paper text-ink",
    },
  },
});

function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  return <span className={chipStyles({ tone })}>{label}</span>;
}

/** Per state.kind -- entry and filed are both pre-lock, so both read "Open"
 * (the header persists unchanged across filing; only the body swaps). */
function chipForState(kind: TippedMatchCardState["kind"]): {
  label: string;
  tone: ChipTone;
} {
  switch (kind) {
    case "entry":
    case "filed":
      return { label: "Open", tone: "open" };
    case "locked":
    case "live":
      return { label: kind === "live" ? "Live" : "Locked", tone: "locked" };
    case "finished":
      return { label: "Final", tone: "final" };
  }
}

function TeamRow({
  team,
  fill,
  homeAwayLabel,
}: {
  team: TippedMatchTeam;
  fill: string;
  homeAwayLabel?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="w-6 shrink-0 text-[0.68rem] font-bold tabular-nums text-paper/55">
        {team.leaguePosition !== null
          ? `${team.leaguePosition}${ordinalSuffix(team.leaguePosition)}`
          : ""}
      </span>
      <CodeBadge shortCode={team.shortCode} fill={fill} />
      <span className="min-w-0 flex-1 truncate text-[1.0625rem] font-bold text-paper">
        {team.name}
      </span>
      {homeAwayLabel ? (
        <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-wide text-paper/55">
          {homeAwayLabel}
        </span>
      ) : null}
    </div>
  );
}

function MetaLine({
  provenance,
  kickoffUtcIso,
  timeZone,
  now,
  showCountdown,
}: {
  provenance: TippedMatchProvenance;
  kickoffUtcIso: string;
  timeZone: string;
  now: Date;
  showCountdown: boolean;
}) {
  const Icon = ProvenanceIcon[provenance];
  const countdownParts = showCountdown
    ? decomposeCountdown(new Date(kickoffUtcIso).getTime() - now.getTime())
    : null;
  const urgent =
    countdownParts !== null &&
    countdownParts.days === 0 &&
    countdownParts.hours === 0;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.72rem] font-medium text-paper/60">
      <span className="inline-flex items-center gap-1 font-bold text-accent">
        <Icon className="size-[0.8em]" aria-hidden />
        {provenanceLabel[provenance]}
      </span>
      <span aria-hidden>·</span>
      <span>{formatKickoffInTimeZone(kickoffUtcIso, timeZone)}</span>
      {showCountdown ? (
        <>
          <span aria-hidden>·</span>
          <span className={urgent ? "font-bold text-warning" : undefined}>
            {formatCountdown(kickoffUtcIso, now.getTime())}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** The card's ink header -- present in every state (docs/adr/0007's own
 * language: club badge and per-row colour bar apply "both times", not just
 * once settled). Only the status chip and meta line's countdown vary. */
function CardHeader({
  home,
  away,
  homeFill,
  awayFill,
  chip,
  provenance,
  kickoffUtcIso,
  timeZone,
  now,
  showCountdown,
}: {
  home: TippedMatchTeam;
  away: TippedMatchTeam;
  homeFill: string;
  awayFill: string;
  chip: { label: string; tone: ChipTone };
  provenance: TippedMatchProvenance;
  kickoffUtcIso: string;
  timeZone: string;
  now: Date;
  showCountdown: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 bg-ink px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <TeamRow team={home} fill={homeFill} homeAwayLabel="Home" />
          <TeamRow team={away} fill={awayFill} />
        </div>
        <StatusChip label={chip.label} tone={chip.tone} />
      </div>
      <MetaLine
        provenance={provenance}
        kickoffUtcIso={kickoffUtcIso}
        timeZone={timeZone}
        now={now}
        showCountdown={showCountdown}
      />
    </div>
  );
}

/** Two-tone bar tying the header to the digit rows / score line below it --
 * hairlined top and bottom so it reads as a bar regardless of which way a
 * kit's luminance leans (issue #15 prototype note). */
function Seam({ homeFill, awayFill }: { homeFill: string; awayFill: string }) {
  return (
    <div className="flex h-1.5 border-y border-ink/25">
      <div className="flex-1" style={{ background: homeFill }} />
      <div
        className="flex-1 border-l border-ink/30"
        style={{ background: awayFill }}
      />
    </div>
  );
}

const digitCell = tv({
  base: "flex h-11 flex-1 items-center justify-center rounded-btn-sm border border-paper-line bg-white text-base font-bold tabular-nums text-ink transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50",
  variants: {
    selected: {
      true: "border-accent bg-accent text-accent-ink",
      false: "hover:border-accent/60",
    },
  },
  defaultVariants: { selected: false },
});

function DigitRow({
  team,
  homeAwayLabel,
  fill,
  selected,
  expanded,
  disabled,
  onSelect,
  onExpand,
}: {
  team: TippedMatchTeam;
  homeAwayLabel: string;
  fill: string;
  selected: number | null;
  expanded: boolean;
  disabled: boolean;
  onSelect: (value: number) => void;
  onExpand: () => void;
}) {
  const primaryDigits = [0, 1, 2, 3, 4];
  const extraDigits = [5, 6, 7, 8, 9];
  const showExtra = expanded || (selected !== null && selected >= 5);

  return (
    <div className="flex items-stretch gap-2">
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-extrabold tracking-wide text-ink">
            {team.shortCode ?? "?"}
          </span>
          <span className="text-[0.64rem] font-bold uppercase tracking-wide text-ink/50">
            {homeAwayLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {primaryDigits.map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={disabled}
              aria-pressed={selected === digit}
              className={digitCell({ selected: selected === digit })}
              onClick={() => onSelect(digit)}
            >
              {digit}
            </button>
          ))}
          {!showExtra ? (
            <button
              type="button"
              disabled={disabled}
              className="flex h-11 flex-1 items-center justify-center rounded-btn-sm border border-dashed border-paper-line text-xs font-bold text-ink/55 transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onExpand}
            >
              5+
            </button>
          ) : null}
        </div>
        {showExtra ? (
          <div className="flex items-center gap-1.5">
            {extraDigits.map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={disabled}
                aria-pressed={selected === digit}
                className={digitCell({ selected: selected === digit })}
                onClick={() => onSelect(digit)}
              >
                {digit}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScoreLine({
  home,
  away,
  homeFill,
  awayFill,
  homeScore,
  awayScore,
  tone,
}: {
  home: TippedMatchTeam;
  away: TippedMatchTeam;
  homeFill: string;
  awayFill: string;
  homeScore: number | null;
  awayScore: number | null;
  tone: "own-pick" | "result";
}) {
  return (
    <div
      className={`flex items-center gap-2.5 text-[3rem] font-extrabold leading-none tabular-nums ${
        tone === "own-pick" ? "text-accent" : "text-paper"
      }`}
    >
      <CodeBadge shortCode={home.shortCode} fill={homeFill} />
      <span>{homeScore ?? "–"}</span>
      <span className="text-[0.4em] font-bold text-paper/35">—</span>
      <span>{awayScore ?? "–"}</span>
      <CodeBadge shortCode={away.shortCode} fill={awayFill} />
    </div>
  );
}

/** The dark plate every non-entry state renders as the card body --
 * "Your pick" pre-result, "Full time" once finished. Same ink background
 * as the header (docs/DESIGN_SYSTEM.md has no separate header/plate ink
 * shade documented yet, unlike the prototype's ink-2/ink-3 split -- flat
 * `ink` throughout until that lands). */
function Plate({
  home,
  away,
  homeFill,
  awayFill,
  homeScore,
  awayScore,
  scoreTone,
  label,
  footer,
}: {
  home: TippedMatchTeam;
  away: TippedMatchTeam;
  homeFill: string;
  awayFill: string;
  homeScore: number | null;
  awayScore: number | null;
  scoreTone: "own-pick" | "result";
  label: string;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 bg-ink px-3.5 py-3.5">
      <span className="text-[0.64rem] font-bold uppercase tracking-wide text-paper/55">
        {label}
      </span>
      <ScoreLine
        home={home}
        away={away}
        homeFill={homeFill}
        awayFill={awayFill}
        homeScore={homeScore}
        awayScore={awayScore}
        tone={scoreTone}
      />
      {footer}
    </div>
  );
}

export function TippedMatchCard({
  home,
  away,
  kickoffUtcIso,
  timeZone,
  now,
  provenance,
  state,
  onSave,
}: TippedMatchCardProps) {
  const [homeSelected, setHomeSelected] = useState<number | null>(null);
  const [awaySelected, setAwaySelected] = useState<number | null>(null);
  const [homeExpanded, setHomeExpanded] = useState(false);
  const [awayExpanded, setAwayExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-opens a filed (pre-lock) pick back to blank entry -- issue #15's own
  // done-when requires re-editing before lock, and the upsert route already
  // supports it; only the "Change" affordance to reach it was missing.
  const [editingFiled, setEditingFiled] = useState(false);

  const { home: homeFill, away: awayFill } = matchBadgeColors(
    home.shortCode,
    away.shortCode,
  );

  async function fileIfComplete(
    nextHome: number | null,
    nextAway: number | null,
  ) {
    if (nextHome === null || nextAway === null) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(nextHome, nextAway);
      setEditingFiled(false);
      // Success: the parent owns pick data and is expected to flip `state`
      // to "filed" on its next render. Local selection stays as-is until
      // then (harmless -- it's about to be replaced by the plate).
    } catch {
      // A partial/failed pick is never restored (ADR) -- back to a clean
      // entry state, not a half-filled one, with a plain inline error line
      // (the deferred "tap to retry" stamp treatment is out of scope).
      setHomeSelected(null);
      setAwaySelected(null);
      setHomeExpanded(false);
      setAwayExpanded(false);
      setError(
        "Couldn't save your pick -- check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const chip = chipForState(state.kind);
  const showEntryBody =
    state.kind === "entry" || (state.kind === "filed" && editingFiled);

  return (
    <div className="flex flex-col overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)]">
      <CardHeader
        home={home}
        away={away}
        homeFill={homeFill}
        awayFill={awayFill}
        chip={chip}
        provenance={provenance}
        kickoffUtcIso={kickoffUtcIso}
        timeZone={timeZone}
        now={now}
        showCountdown={state.kind === "entry" || state.kind === "filed"}
      />
      <Seam homeFill={homeFill} awayFill={awayFill} />

      {showEntryBody ? (
        <div className="flex flex-col gap-3 bg-white p-4">
          <DigitRow
            team={home}
            homeAwayLabel="Home"
            fill={homeFill}
            selected={homeSelected}
            expanded={homeExpanded}
            disabled={saving}
            onSelect={(value) => {
              setHomeSelected(value);
              void fileIfComplete(value, awaySelected);
            }}
            onExpand={() => setHomeExpanded(true)}
          />
          <DigitRow
            team={away}
            homeAwayLabel="Away"
            fill={awayFill}
            selected={awaySelected}
            expanded={awayExpanded}
            disabled={saving}
            onSelect={(value) => {
              setAwaySelected(value);
              void fileIfComplete(homeSelected, value);
            }}
            onExpand={() => setAwayExpanded(true)}
          />
          {saving ? (
            <p className="text-xs font-semibold text-ink/55">Filing…</p>
          ) : null}
          {error ? (
            <p className="text-xs font-semibold text-danger">{error}</p>
          ) : null}
        </div>
      ) : (
        (() => {
          switch (state.kind) {
            case "filed":
              return (
                <Plate
                  home={home}
                  away={away}
                  homeFill={homeFill}
                  awayFill={awayFill}
                  homeScore={state.ownHomeScore}
                  awayScore={state.ownAwayScore}
                  scoreTone="own-pick"
                  label="Your pick"
                  // No "Filed HH:MM" line -- the score itself is the only
                  // thing worth stating twice; a timestamp is supporting
                  // detail nobody re-reads. Visual hierarchy: label (small,
                  // muted) sets context, the score is the sole dominant
                  // element (size + accent colour), and Change is a clearly
                  // secondary, full-width action -- distinct in weight from
                  // the score via outline styling, but full-width so the
                  // plate's whole footprint stays purposeful rather than a
                  // small button floating against empty space.
                  footer={
                    <button
                      type="button"
                      className="mt-1 flex min-h-11 w-full items-center justify-center rounded-btn-sm border border-paper/35 text-[0.92rem] font-bold text-paper transition hover:border-paper hover:bg-white/5"
                      onClick={() => {
                        setHomeSelected(null);
                        setAwaySelected(null);
                        setEditingFiled(true);
                      }}
                    >
                      Change
                    </button>
                  }
                />
              );
            case "locked":
              return (
                <Plate
                  home={home}
                  away={away}
                  homeFill={homeFill}
                  awayFill={awayFill}
                  homeScore={state.ownHomeScore}
                  awayScore={state.ownAwayScore}
                  scoreTone="own-pick"
                  label="Your pick"
                  footer={
                    <p className="pt-0.5 text-[0.86rem] text-paper/75">
                      Locked in
                    </p>
                  }
                />
              );
            case "live":
              return (
                <Plate
                  home={home}
                  away={away}
                  homeFill={homeFill}
                  awayFill={awayFill}
                  homeScore={state.ownHomeScore}
                  awayScore={state.ownAwayScore}
                  scoreTone="own-pick"
                  label="Your pick"
                  // "See everyone's picks" deliberately absent -- Match
                  // Centre (#91) doesn't exist yet, and #90's decision 2
                  // is not to link to a route that isn't real (ADR-0005).
                  footer={
                    <p className="pt-0.5 text-[0.86rem] text-paper/75">
                      Playing now
                    </p>
                  }
                />
              );
            case "finished": {
              const exact =
                state.ownHomeScore === state.homeScore &&
                state.ownAwayScore === state.awayScore;
              return (
                <Plate
                  home={home}
                  away={away}
                  homeFill={homeFill}
                  awayFill={awayFill}
                  homeScore={state.homeScore}
                  awayScore={state.awayScore}
                  scoreTone="result"
                  label="Full time"
                  footer={
                    <div className="flex items-center gap-2 pt-0.5 text-[0.9rem]">
                      {exact ? (
                        <span className="font-bold text-success">
                          You called it exactly
                        </span>
                      ) : state.ownHomeScore !== null &&
                        state.ownAwayScore !== null ? (
                        <span className="text-paper/85">
                          You tipped{" "}
                          <span className="font-extrabold text-accent">
                            {state.ownHomeScore}–{state.ownAwayScore}
                          </span>
                        </span>
                      ) : (
                        <span className="text-paper/60">No pick filed</span>
                      )}
                      {state.points !== null ? (
                        <span className="ml-auto rounded-full bg-success/25 px-2.5 py-1 text-[0.86rem] font-extrabold text-success">
                          +{state.points} pts
                        </span>
                      ) : null}
                    </div>
                  }
                />
              );
            }
            default:
              return null;
          }
        })()
      )}
    </div>
  );
}
