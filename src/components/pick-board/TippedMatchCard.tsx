"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Flame, Shuffle } from "lucide-react";
import { tv } from "tailwind-variants";
import {
  decomposeCountdown,
  formatCountdown,
  formatKickoffInTimeZone,
} from "@/lib/dates/kickoff-format";
import { isLockedAt, lockInstantIso } from "@/lib/competitions/lock-window";
import { matchBadgeColors } from "@/lib/teams/kit-colors";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import {
  CardShell,
  CardShellBody,
  CardShellHeader,
  CardShellSeam,
} from "@/components/ui/CardShell";
import { ScoringBreakdown } from "@/components/scoring/ScoringBreakdown";
import { ordinal } from "@/lib/format/ordinal";
import { T, TX, MICRO_LABEL, INSET, FOCUS } from "@/components/ui/tokens";
import { isLockedWithoutPick, resolveCardStateAt } from "./card-state";
import { PickSaveError, type PickSaveFailureKind } from "./pick-save-error";
import { useNow } from "./use-now";

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
 * name, status chip) is present in every state, not only once settled;
 * once a pick or result exists it's baked directly into the header rows
 * and the card collapses to just that header (no separate plate below).
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
  /** The server's render time. The card's clock starts here and then
   *  ticks on the device (useNow), so the countdown moves and the card
   *  locks itself when the lock instant passes. */
  now: Date;
  provenance: TippedMatchProvenance;
  state: TippedMatchCardState;
  /**
   * Awaited, not optimistic (issue #15 decision 2): the card disables
   * input and shows a "Filing…" stamp while this is pending -- never shows
   * "Filed" before the write is actually confirmed. Rejects with a
   * PickSaveError so the card can say what actually went wrong.
   */
  onSave: (homeScore: number, awayScore: number) => Promise<void>;
}

const provenanceLabel: Record<TippedMatchProvenance, string> = {
  top_matchup: "Headline",
  random_pick: "Random",
};
// Shuffle, not Dices: a pair of dice is the most gambling-coded glyph in any
// icon set, on an app whose spec bans gambling language (CLAUDE.md -> Hard
// constraints). Flame, not Star: docs/in-app-help-spec.md -> Out of scope
// says of the deferred Star Match feature "do not document or hint at it",
// and a star on the marquee card is exactly that hint -- it also collides
// with the universal favourite/starred meaning.
const ProvenanceIcon: Record<TippedMatchProvenance, typeof Flame> = {
  top_matchup: Flame,
  random_pick: Shuffle,
};

type ChipTone = "open" | "filed" | "locked" | "final";

// No accent. A lifecycle status is not one of the accent budget's sanctioned
// spots (docs/DESIGN_SYSTEM.md -> Accent budget), and here it was competing
// with the card's one legitimate accent -- the player's own predicted
// scoreline, two rows below. `locked` steps up in ground and weight instead,
// so it still reads as the stronger state without spending the budget.
const chipStyles = tv({
  base: `inline-flex shrink-0 items-center gap-1 rounded-badge px-2 py-0.5 ${MICRO_LABEL}`,
  variants: {
    tone: {
      open: "bg-paper/15 text-on-ink",
      filed: "bg-paper/15 text-on-ink",
      locked: "bg-paper/25 text-on-ink font-extrabold",
      final: "bg-paper text-ink",
    },
  },
});

function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span className={chipStyles({ tone })}>
      {tone === "filed" ? (
        <Check className="size-[1.1em] stroke-[3]" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}

/** "Filed" rather than a second "Open": a card that already holds the
 *  player's pick says so in the one place every state keeps a word. */
function chipForState(kind: TippedMatchCardState["kind"]): {
  label: string;
  tone: ChipTone;
} {
  switch (kind) {
    case "entry":
      return { label: "Open", tone: "open" };
    case "filed":
      return { label: "Filed", tone: "filed" };
    case "locked":
    case "live":
      return { label: kind === "live" ? "Live" : "Locked", tone: "locked" };
    case "finished":
      return { label: "Final", tone: "final" };
  }
}

/**
 * One header row: position, club badge, full name. Dropped the "Home"/
 * "Away" text label entirely (the row order already conveys it).
 */
function TeamRow({
  team,
  fill,
  home,
}: {
  team: TippedMatchTeam;
  fill: string;
  home?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`w-6 shrink-0 ${T.label} font-bold tabular-nums ${TX.onInkMuted}`}
      >
        {team.leaguePosition !== null ? ordinal(team.leaguePosition) : ""}
      </span>
      <ClubCodeBadge shortCode={team.shortCode} fill={fill} />
      {/* Home takes visual dominance rather than a label -- the form of the
          home/away rule that survives sharing a line with a scoreline
          (DESIGN_SYSTEM.md -> Team display in fixtures, amended 2026-08-20). */}
      <span
        className={`min-w-0 flex-1 truncate ${T.body} ${
          home ? `font-bold ${TX.onInk}` : `font-medium ${TX.onInkMuted}`
        }`}
      >
        {team.name}
      </span>
    </div>
  );
}

/**
 * A score, in its own grid column rather than trailing inline in the team
 * row. Takes a number only: "no pick" is words, never a dash
 * (DESIGN_SYSTEM.md -> Numbers and units), so a card with no pick drops
 * the score column instead of rendering an empty one.
 *
 * `emphasis` exists only for the finished card's two-column comparison
 * (own pick beside the result): the result keeps the Display role, the
 * pick steps down one stop on the scale.
 */
function ScoreCell({
  value,
  tone,
  emphasis = "primary",
  settle = false,
  className = "",
}: {
  value: number;
  tone: "own-pick" | "result";
  emphasis?: "primary" | "secondary";
  /** Plays the one-off settle the moment a pick is confirmed filed. */
  settle?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 text-center font-extrabold leading-none tabular-nums ${
        emphasis === "primary" ? T.score : T.h2
      } ${tone === "result" ? "text-paper" : "text-accent"} ${
        settle ? "motion-safe:animate-score-settle" : ""
      } ${className}`}
    >
      {value}
    </span>
  );
}

/** Column captions for the finished card's two score columns -- without
 *  them the pick and the result are two adjacent numbers with nothing
 *  saying which is which, and colour alone can't carry that.
 *
 *  They take the FINAL status chip's own slot at the end of the eyebrow
 *  rather than occupying a row of their own, and land exactly over their
 *  columns because both are right-aligned to the same card inset and
 *  carry the same widths and gap. */
function ScoreColumnLabels() {
  const cap = `text-center ${MICRO_LABEL} ${TX.onInkMuted}`;
  return (
    <div className="flex shrink-0 justify-end gap-x-1.5">
      <span className={`${cap} ${SCORE_COL_PICK}`}>You</span>
      <span className={`${cap} ${SCORE_COL_RESULT}`}>Final</span>
    </div>
  );
}

/** Fixed widths so the two score columns line up row to row, and so the
 *  captions above them overhang harmlessly instead of widening them. */
const SCORE_COL_PICK = "w-7";
const SCORE_COL_RESULT = "w-10";

function MetaLine({
  provenance,
  kickoffUtcIso,
  lockUtcIso,
  timeZone,
  now,
  showCountdown,
  note,
}: {
  provenance: TippedMatchProvenance;
  kickoffUtcIso: string;
  lockUtcIso: string;
  timeZone: string;
  now: Date;
  showCountdown: boolean;
  /** "Locked in" / "No pick" -- mutually exclusive with the countdown. */
  note?: string;
}) {
  const Icon = ProvenanceIcon[provenance];
  // Counts down to the LOCK, not kickoff: the header's "Picks close" is
  // the lock instant, and the two used to disagree by five minutes at the
  // exact moment a late player is reading them.
  const countdownParts = showCountdown
    ? decomposeCountdown(new Date(lockUtcIso).getTime() - now.getTime())
    : null;
  const urgent =
    countdownParts !== null &&
    countdownParts.days === 0 &&
    countdownParts.hours === 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${T.caption} font-medium ${TX.onInkMuted}`}
    >
      {/* Provenance is metadata, not one of the three emotional accent
          moments -- weight and the icon differentiate it on an ink ground. */}
      <span className="inline-flex items-center gap-1 font-bold">
        <Icon className="size-[0.8em]" aria-hidden />
        {provenanceLabel[provenance]}
      </span>
      <span aria-hidden>·</span>
      <span>{formatKickoffInTimeZone(kickoffUtcIso, timeZone)}</span>
      {showCountdown ? (
        <>
          <span aria-hidden>·</span>
          <span className={urgent ? "font-bold text-warning" : undefined}>
            Closes in {formatCountdown(lockUtcIso, now.getTime())}
          </span>
        </>
      ) : null}
      {note ? (
        <>
          <span aria-hidden>·</span>
          <span className={`font-semibold ${TX.onInk}`}>{note}</span>
        </>
      ) : null}
    </div>
  );
}

interface RowScores {
  home: number;
  away: number;
  tone: "own-pick" | "result";
  /** Finished only: the Player's own pick, rendered in its own column
   *  beside the result -- the same side-by-side comparison the picks
   *  record makes (PICK / FINAL), so the two surfaces read the same way. */
  own?: { home: number; away: number };
}

/**
 * The card's ink header -- present in every state. Once a pick or result
 * exists, `scores` bakes it directly into the team rows; without one
 * (entry, or locked with no pick) the rows carry no score column at all.
 */
function CardHeader({
  home,
  away,
  homeFill,
  awayFill,
  chip,
  provenance,
  kickoffUtcIso,
  lockUtcIso,
  timeZone,
  now,
  showCountdown,
  scores,
  settle,
  note,
}: {
  home: TippedMatchTeam;
  away: TippedMatchTeam;
  homeFill: string;
  awayFill: string;
  chip: { label: string; tone: ChipTone };
  provenance: TippedMatchProvenance;
  kickoffUtcIso: string;
  lockUtcIso: string;
  timeZone: string;
  now: Date;
  showCountdown: boolean;
  scores?: RowScores;
  settle: boolean;
  note?: string;
}) {
  // The "eyebrow": meta ABOVE the teams, so the card ends on the scoreline
  // rather than trailing off into small print.
  return (
    <CardShellHeader className={INSET}>
      <div className="flex items-center justify-between gap-2">
        <MetaLine
          provenance={provenance}
          kickoffUtcIso={kickoffUtcIso}
          lockUtcIso={lockUtcIso}
          timeZone={timeZone}
          now={now}
          showCountdown={showCountdown}
          note={note}
        />
        {scores?.own ? (
          <ScoreColumnLabels />
        ) : (
          <StatusChip label={chip.label} tone={chip.tone} />
        )}
      </div>
      {scores?.own ? (
        <div className="grid min-w-0 grid-cols-[1fr_auto_auto] items-center gap-x-1.5">
          <TeamRow team={home} fill={homeFill} home />
          <ScoreCell
            value={scores.own.home}
            tone="own-pick"
            emphasis="secondary"
            className={SCORE_COL_PICK}
          />
          <ScoreCell
            value={scores.home}
            tone={scores.tone}
            className={SCORE_COL_RESULT}
          />
          <TeamRow team={away} fill={awayFill} />
          <ScoreCell
            value={scores.own.away}
            tone="own-pick"
            emphasis="secondary"
            className={SCORE_COL_PICK}
          />
          <ScoreCell
            value={scores.away}
            tone={scores.tone}
            className={SCORE_COL_RESULT}
          />
        </div>
      ) : scores ? (
        <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-1">
          <TeamRow team={home} fill={homeFill} home />
          <ScoreCell value={scores.home} tone={scores.tone} settle={settle} />
          <TeamRow team={away} fill={awayFill} />
          <ScoreCell value={scores.away} tone={scores.tone} settle={settle} />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1">
          <TeamRow team={home} fill={homeFill} home />
          <TeamRow team={away} fill={awayFill} />
        </div>
      )}
    </CardShellHeader>
  );
}

const digitCell = tv({
  base: `flex h-11 items-center justify-center rounded-btn-sm border border-paper-line bg-surface ${T.body} font-bold tabular-nums text-text transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  variants: {
    selected: {
      true: "border-accent bg-accent text-accent-ink",
      false: "hover:border-accent/60",
    },
  },
  defaultVariants: { selected: false },
});

const PRIMARY_DIGITS = [0, 1, 2, 3, 4] as const;
// The route accepts 0-9 per side (api/picks MAX_SCORE), so the extra row is
// exactly the valid domain. It replaces a free-text 5+ field that allowed up
// to 20 -- anything over 9 was then refused by the server and reported as a
// connection problem -- and that filed on blur, so tapping anywhere else on
// iOS (whose numeric keypad has no Return key) could file a pick by accident.
// ADR 0007 specified this row; entry is now always exactly two taps again.
const EXTRA_DIGITS = [5, 6, 7, 8, 9] as const;

function DigitRow({
  team,
  homeAwayLabel,
  fill,
  selected,
  expanded,
  disabled,
  onSelect,
  onToggleExtra,
}: {
  team: TippedMatchTeam;
  homeAwayLabel: "Home" | "Away";
  fill: string;
  selected: number | null;
  expanded: boolean;
  disabled: boolean;
  onSelect: (value: number) => void;
  onToggleExtra: () => void;
}) {
  // A chosen 5-9 keeps its row open: collapsing it would hide the
  // selection the player just made.
  const extraHoldsSelection = selected !== null && selected >= 5;
  const showExtra = expanded || extraHoldsSelection;

  const digit = (value: number) => (
    <button
      key={value}
      type="button"
      disabled={disabled}
      aria-pressed={selected === value}
      className={digitCell({ selected: selected === value })}
      onClick={() => onSelect(value)}
    >
      {value}
    </button>
  );

  return (
    // The group's name gives every bare digit its team: a screen reader
    // used to announce "2, toggle button" with nothing saying whose goals.
    <div
      role="group"
      aria-label={`${team.name}, ${homeAwayLabel.toLowerCase()} goals`}
      className="flex items-stretch gap-2"
    >
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div aria-hidden className="flex items-center gap-1.5">
          <span
            className={`truncate ${T.caption} font-extrabold tracking-wide ${TX.base}`}
          >
            {team.shortCode ?? team.name}
          </span>
          <span
            className={`${T.label} font-bold uppercase tracking-wide ${TX.muted}`}
          >
            {homeAwayLabel}
          </span>
        </div>
        {/* Six columns: 0-4 plus the 5+ toggle, then 5-9 directly beneath
            0-4 so the two rows read as one keypad. */}
        <div className="grid grid-cols-6 gap-1.5">
          {PRIMARY_DIGITS.map(digit)}
          <button
            type="button"
            disabled={disabled || extraHoldsSelection}
            aria-expanded={showExtra}
            aria-label="5 or more goals"
            className={`flex h-11 items-center justify-center rounded-btn-sm border ${
              showExtra
                ? `border-paper-line bg-paper ${TX.base}`
                : `border-dashed border-paper-line ${TX.muted} hover:border-accent/60`
            } ${T.caption} font-bold transition disabled:cursor-not-allowed ${FOCUS}`}
            onClick={onToggleExtra}
          >
            5+
          </button>
          {showExtra ? EXTRA_DIGITS.map(digit) : null}
        </div>
      </div>
    </div>
  );
}

/** The white body under a settled card: holds a status line and, for a
 *  filed pick, the Change control. */
function StatusLine({
  tone,
  children,
}: {
  tone: "muted" | "danger";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={`${T.caption} font-semibold ${
        tone === "danger" ? "text-danger" : TX.muted
      }`}
    >
      {children}
    </p>
  );
}

const quietButton = `flex h-11 w-full items-center justify-center rounded-btn-sm border border-paper-line bg-surface ${T.caption} font-bold tracking-wide ${TX.base} uppercase transition hover:border-accent/60 ${FOCUS}`;

/** Finished only: the points chip, and the one verdict the header's own
 * You/Final columns can't state for themselves -- that the two matched
 * exactly. */
function FinishedFooter({
  ownHomeScore,
  ownAwayScore,
  homeScore,
  awayScore,
  points,
}: {
  ownHomeScore: number | null;
  ownAwayScore: number | null;
  homeScore: number;
  awayScore: number;
  points: number | null;
}) {
  const filed = ownHomeScore !== null && ownAwayScore !== null;
  const exact =
    filed && ownHomeScore === homeScore && ownAwayScore === awayScore;
  const verdict = exact ? (
    /* One of the three emotional accent moments, and a fill rather than
       text -- `success` reads the same either way as a fill. The rarest
       good moment of a week, so it's sized to be read, not a micro-label. */
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-badge bg-success px-3 py-1 ${T.caption} font-extrabold text-on-ink motion-safe:animate-score-settle`}
    >
      <Check className="size-4 stroke-[3]" aria-hidden />
      You called it exactly
    </span>
  ) : !filed ? (
    <span className={`${T.caption} ${TX.muted}`}>No pick filed</span>
  ) : null;
  return (
    <CardShellBody className="gap-2 py-2">
      {verdict}
      {points !== null ? (
        <ScoringBreakdown
          pickHome={ownHomeScore}
          pickAway={ownAwayScore}
          resultHome={homeScore}
          resultAway={awayScore}
          points={points}
        />
      ) : null}
    </CardShellBody>
  );
}

export function TippedMatchCard({
  home,
  away,
  kickoffUtcIso,
  timeZone,
  now: serverNow,
  provenance,
  state,
  onSave,
}: TippedMatchCardProps) {
  const [homeSelected, setHomeSelected] = useState<number | null>(null);
  const [awaySelected, setAwaySelected] = useState<number | null>(null);
  const [homeExpanded, setHomeExpanded] = useState(false);
  const [awayExpanded, setAwayExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{
    message: string;
    kind: PickSaveFailureKind;
  } | null>(null);
  // Re-opens a filed (pre-lock) pick back to blank entry -- issue #15's own
  // done-when requires re-editing before lock.
  const [editingFiled, setEditingFiled] = useState(false);
  // The pick the server just confirmed. Shown at once, rather than leaving
  // the entry rows on screen until router.refresh() lands -- the write is
  // already confirmed, so this is not optimistic. Also drives the one-off
  // settle on the scoreline.
  const [justFiled, setJustFiled] = useState<{
    home: number;
    away: number;
  } | null>(null);
  // Screen-reader announcements: "Filing…", then "Pick filed: …". The
  // visible "Filing…" line sits inside the entry body, which unmounts on
  // success, so the announcement lives at the card root instead.
  const [announcement, setAnnouncement] = useState("");
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const focusChangeAfterFiling = useRef(false);

  const now = useNow(serverNow);
  const lockUtcIso = lockInstantIso(kickoffUtcIso);
  const lockedNow = isLockedAt(kickoffUtcIso, now.getTime());

  // A confirmed save beats the server's pre-save render until the refresh
  // arrives; after lock, the client clock beats both.
  const serverState: TippedMatchCardState =
    justFiled && (state.kind === "entry" || state.kind === "filed")
      ? {
          kind: "filed",
          ownHomeScore: justFiled.home,
          ownAwayScore: justFiled.away,
        }
      : state;
  const view = resolveCardStateAt(serverState, lockedNow);

  // Focus would otherwise drop to <body> when the digit button the player
  // just tapped unmounts. Move it to the control that now does something.
  useEffect(() => {
    if (focusChangeAfterFiling.current && changeButtonRef.current) {
      focusChangeAfterFiling.current = false;
      changeButtonRef.current.focus();
    }
  });

  // Header + seam sit on the card's ink ground, so this pair is floored
  // against both ink and white (matchBadgeColors()'s default).
  const { home: homeFill, away: awayFill } = matchBadgeColors(
    home.shortCode,
    away.shortCode,
  );
  // DigitRow's rail sits on the white CardShellBody only.
  const { home: bodyHomeFill, away: bodyAwayFill } = matchBadgeColors(
    home.shortCode,
    away.shortCode,
    ["#ffffff"],
  );

  function resetEntry() {
    setHomeSelected(null);
    setAwaySelected(null);
    setHomeExpanded(false);
    setAwayExpanded(false);
  }

  async function fileIfComplete(
    nextHome: number | null,
    nextAway: number | null,
  ) {
    if (nextHome === null || nextAway === null) return;
    setSaving(true);
    setError(null);
    setAnnouncement("Filing your pick…");
    try {
      await onSave(nextHome, nextAway);
      setJustFiled({ home: nextHome, away: nextAway });
      setEditingFiled(false);
      resetEntry();
      focusChangeAfterFiling.current = true;
      setAnnouncement(
        `Pick filed: ${home.name} ${nextHome}, ${away.name} ${nextAway}.`,
      );
    } catch (caught) {
      const failure =
        caught instanceof PickSaveError
          ? caught.failure
          : {
              kind: "retry" as const,
              message: "That didn't save. Tap a score to try again.",
            };
      // A transient failure keeps both selections, so tapping either score
      // again re-files the same pick in one tap. Anything final (locked,
      // stale, signed out) clears the half-made entry: the ADR never
      // restores a partial pick, and there's nothing left to retry.
      if (failure.kind !== "retry") {
        resetEntry();
        setEditingFiled(false);
      }
      setAnnouncement("");
      setError(failure);
    } finally {
      setSaving(false);
    }
  }

  const chip = chipForState(view.kind);
  const showEntryBody =
    view.kind === "entry" || (view.kind === "filed" && editingFiled);
  const noPick = isLockedWithoutPick(view);

  // While editing a filed pick, the header keeps showing the pick being
  // replaced, and the digit rows start blank rather than prefilled.
  // Prefilling used to auto-save the moment one side was re-tapped.
  let scores: RowScores | undefined;
  let note: string | undefined;
  switch (view.kind) {
    case "filed":
      scores = {
        home: view.ownHomeScore,
        away: view.ownAwayScore,
        tone: "own-pick",
      };
      break;
    case "locked":
    case "live":
      // Locked with no pick used to render an accent "–" over a "Locked
      // in" note: it told a player who had missed the deadline they were
      // fine. Now the score column is dropped and the note says so.
      if (view.ownHomeScore !== null && view.ownAwayScore !== null) {
        scores = {
          home: view.ownHomeScore,
          away: view.ownAwayScore,
          tone: "own-pick",
        };
      }
      // Nothing syncs live scores yet, so a locked card reads the same for
      // the whole match; "Kicked off" at least tells a player it has
      // started, rather than 90 minutes of "Locked in".
      note = noPick
        ? "No pick"
        : view.kind === "live"
          ? "Playing now"
          : now.getTime() >= new Date(kickoffUtcIso).getTime()
            ? "Kicked off"
            : "Locked in";
      break;
    case "finished":
      scores = {
        home: view.homeScore,
        away: view.awayScore,
        tone: "result",
        // Only when a pick exists: an empty You column would have to render
        // a dash, and DESIGN_SYSTEM.md -> Numbers and units reserves "no
        // pick" (the words) for that fact.
        own:
          view.ownHomeScore !== null && view.ownAwayScore !== null
            ? { home: view.ownHomeScore, away: view.ownAwayScore }
            : undefined,
      };
      break;
  }

  const errorLine = error ? (
    <StatusLine tone="danger">{error.message}</StatusLine>
  ) : null;

  return (
    <CardShell>
      <CardHeader
        home={home}
        away={away}
        homeFill={homeFill}
        awayFill={awayFill}
        chip={chip}
        provenance={provenance}
        kickoffUtcIso={kickoffUtcIso}
        lockUtcIso={lockUtcIso}
        timeZone={timeZone}
        now={now}
        showCountdown={view.kind === "entry" || view.kind === "filed"}
        scores={scores}
        settle={justFiled !== null && view.kind === "filed" && !editingFiled}
        note={note}
      />
      <CardShellSeam segments={[{ fill: homeFill }, { fill: awayFill }]} />

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {showEntryBody ? (
        <CardShellBody className="gap-3">
          <DigitRow
            team={home}
            homeAwayLabel="Home"
            fill={bodyHomeFill}
            selected={homeSelected}
            expanded={homeExpanded}
            disabled={saving}
            onSelect={(value) => {
              setHomeSelected(value);
              void fileIfComplete(value, awaySelected);
            }}
            onToggleExtra={() => setHomeExpanded((open) => !open)}
          />
          <DigitRow
            team={away}
            homeAwayLabel="Away"
            fill={bodyAwayFill}
            selected={awaySelected}
            expanded={awayExpanded}
            disabled={saving}
            onSelect={(value) => {
              setAwaySelected(value);
              void fileIfComplete(homeSelected, value);
            }}
            onToggleExtra={() => setAwayExpanded((open) => !open)}
          />
          {saving ? <StatusLine tone="muted">Filing…</StatusLine> : null}
          {errorLine}
          {view.kind === "filed" ? (
            // The way back out of Change: before this, the only exits were
            // re-entering a whole pick or reloading the page.
            <button
              type="button"
              disabled={saving}
              className={quietButton}
              onClick={() => {
                resetEntry();
                setError(null);
                setEditingFiled(false);
              }}
            >
              Keep {view.ownHomeScore}–{view.ownAwayScore}
            </button>
          ) : null}
        </CardShellBody>
      ) : view.kind === "filed" ? (
        // Filed (pre-lock) keeps a slim Change control on the shell's white
        // body. h-11 matches the scoring disclosure's own row height, so a
        // filed card and a finished card have bodies of the same depth.
        <CardShellBody className="gap-2 py-2">
          {errorLine}
          <button
            ref={changeButtonRef}
            type="button"
            className={quietButton}
            onClick={() => {
              // Blank, not seeded from the existing pick -- see `scores`.
              resetEntry();
              setError(null);
              setJustFiled(null);
              setEditingFiled(true);
            }}
          >
            Change
          </button>
        </CardShellBody>
      ) : noPick ? (
        <CardShellBody className="gap-1 py-3">
          {errorLine}
          <StatusLine tone="muted">
            No pick this time, so no points from this one.
          </StatusLine>
        </CardShellBody>
      ) : view.kind === "finished" ? (
        <FinishedFooter
          ownHomeScore={view.ownHomeScore}
          ownAwayScore={view.ownAwayScore}
          homeScore={view.homeScore}
          awayScore={view.awayScore}
          points={view.points}
        />
      ) : errorLine ? (
        <CardShellBody className="py-3">{errorLine}</CardShellBody>
      ) : null}
    </CardShell>
  );
}
