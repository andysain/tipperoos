import { ChevronRight, X } from "lucide-react";
import {
  CardShell,
  CardShellBody,
  CardShellHeader,
} from "@/components/ui/CardShell";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { type BandKey, TABLE_BANDS } from "@/lib/table-predictions/rules";
import { countRead, fillTone, type Mode } from "@/lib/table-predictions/board";
import {
  BAND_LABEL,
  BAND_META,
  DropDivider,
  FILL_COUNT_TEXT,
  FILL_GROUND,
  HEADER_BACKGROUND,
  PLACED_TEAM_GRID_COLS,
  teamFill,
  type Team,
} from "./shared";

interface MoveUndo {
  kind: "move";
  teamId: string;
  band: BandKey;
  label: string;
}

interface SwapUndo {
  kind: "swap";
  teamA: { teamId: string; band: BandKey };
  teamB: { teamId: string; band: BandKey };
  label: string;
}

/** What the undo affordance replays: a single move (dropInto back to
 * `band`), or a swap pair (dropInto both teams back to their prior Bands).
 * See PredictTableFlow's handleUndo for the replay logic. */
export type UndoState = MoveUndo | SwapUndo;

/** The undo affordance for the move that just happened, shown inside the
 * Band the team landed in -- not as a page-level banner, so it reads next
 * to the thing it's talking about. */
function UndoRow({ undo, onUndo }: { undo: UndoState; onUndo: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-btn-sm bg-ink/[0.06] px-3 py-2 text-xs text-ink/70">
      <span className="truncate">{undo.label}</span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 font-extrabold text-ink underline"
      >
        Undo
      </button>
    </div>
  );
}

/** A placed team's card inside an open or expanded Band. Tapping it acts on
 * the team; which action depends on the phase (see PredictTableFlow). */
function PlacedTeamCard({
  team,
  emphasis,
  overfilled,
  onTap,
  disabled,
  liftedHere,
  justSwapped,
  celebrate,
}: {
  team: Team;
  emphasis?: boolean;
  overfilled?: boolean;
  onTap: () => void;
  disabled?: boolean;
  liftedHere?: boolean;
  /** True for the two rows of a swap that just landed -- a brief pulse in
   * place of a confirm dialog (issue #131, ADR 0008). */
  justSwapped?: boolean;
  /** True for the champion card the moment the ceremony fires -- the card
   * landing with weight (issue #118), same pulse as a swap. */
  celebrate?: boolean;
}) {
  const fill = teamFill(team.shortCode);
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`group flex min-h-12 items-stretch gap-3 overflow-hidden rounded-btn border py-3 pr-3 pl-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        emphasis ? "border-accent bg-accent/10 ring-1 ring-accent/40" : ""
      } ${liftedHere ? "border-accent bg-accent/10 ring-2 ring-accent/50" : overfilled ? "border-danger/50 bg-danger/10 hover:border-danger" : !emphasis ? "border-paper-line bg-white hover:border-accent/50" : ""} ${justSwapped || celebrate ? "motion-safe:animate-swap-pulse" : ""}`}
    >
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <ClubCodeBadge shortCode={team.shortCode} fill={fill} />
        <span
          title={team.name}
          className={`min-w-0 flex-1 truncate font-bold text-ink ${emphasis ? "text-lg" : "text-[0.95rem]"}`}
        >
          {team.name}
        </span>
      </span>
      <X aria-hidden className="size-4 shrink-0 self-center text-ink/30" />
    </button>
  );
}

/** The always-visible roster: every club, fixed position, ordered by last
 * season's table. Tapping acts on the club per the current phase. */
function RosterChip({
  team,
  band,
  disabled,
  busy,
  onTap,
}: {
  team: Team;
  band: BandKey | null;
  disabled?: boolean;
  busy?: boolean;
  onTap: () => void;
}) {
  const fill = teamFill(team.shortCode);
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled || busy}
      aria-label={
        band
          ? `Move ${team.name} out of ${BAND_LABEL[band]}`
          : `Place ${team.name}`
      }
      className={`flex items-stretch gap-2 overflow-hidden rounded-btn-sm border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        band
          ? "border-paper-line bg-ink/[0.06] opacity-50 hover:opacity-90"
          : "border-paper-line bg-white hover:border-accent/50"
      }`}
    >
      <span
        aria-hidden
        className={`w-1 shrink-0 rounded-full ${band ? "bg-ink/20" : ""}`}
        style={band ? undefined : { background: fill }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span
            className={`block truncate text-[0.76rem] leading-tight font-extrabold ${band ? "text-ink/60" : "text-ink"}`}
          >
            {team.displayName}
          </span>
          {band ? (
            <X aria-hidden className="size-3 shrink-0 text-ink/40" />
          ) : null}
        </span>
        <span className="block truncate text-[0.66rem] leading-tight text-ink/50">
          {band
            ? BAND_LABEL[band]
            : team.previousSeasonPosition
              ? `#${team.previousSeasonPosition}`
              : "Promoted"}
        </span>
      </span>
    </button>
  );
}

// A collapsed Band is one tap target -- open it. An earlier version also
// let you tap an individual team's code inline here to reconsider it
// without opening the Band, but once a Band held several teams their
// codes covered most of the row's width, crowding out the "open" tap and
// making a filled Band feel impossible to get into. That shortcut was
// redundant anyway -- the always-visible roster already reconsiders any
// placed team, labelled with its current Band -- so it's gone; this row
// only ever opens.
function CollapsedBandRow({
  band,
  teams,
  onOpen,
}: {
  band: (typeof TABLE_BANDS)[number];
  teams: Team[];
  onOpen: () => void;
}) {
  const meta = BAND_META[band.key];
  const filled = teams.length;
  const tone = fillTone(filled, band.target);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full flex-col gap-1 rounded-card border px-3 py-2.5 text-left transition hover:border-accent/50 ${FILL_GROUND[tone]}`}
    >
      <span className="flex w-full items-center gap-2">
        <meta.Icon className="size-4 shrink-0 text-ink/60" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[0.8rem] font-extrabold text-ink">
          {band.label}
        </span>
        <span
          className={`shrink-0 text-[0.7rem] tabular-nums ${FILL_COUNT_TEXT[tone]}`}
        >
          {countRead(filled, band.target)}
        </span>
      </span>
      <span className="w-full pl-6 text-[0.72rem] leading-snug font-semibold whitespace-normal text-ink/50">
        {teams.length ? teams.map((t) => t.displayName).join(" · ") : "—"}
      </span>
    </button>
  );
}

export function BandsBoard({
  mode,
  teams,
  teamsById,
  assignments,
  openBand,
  nextBand,
  lifted,
  busyTeamIds,
  undo,
  justSwapped,
  celebratingChampion,
  onOpenBand,
  onTapTeam,
  onDropInto,
  onUndo,
}: {
  mode: Mode;
  teams: Team[];
  teamsById: Map<string, Team>;
  assignments: Record<string, BandKey>;
  openBand: BandKey;
  /** The Band the "Next: [Band] →" prompt advances to, once the open Band
   * is exactly filled -- null while there's nothing under-filled ahead
   * (issue #130). Always null outside filling mode. */
  nextBand: BandKey | null;
  lifted: string | null;
  busyTeamIds: string[];
  undo: UndoState | null;
  /** The two teams a swap just landed, for the swap-pulse animation --
   * null once it's played (issue #131). */
  justSwapped: [string, string] | null;
  /** True while the champion ceremony is playing -- the champion card
   * lands with weight (issue #118). */
  celebratingChampion: boolean;
  onOpenBand: (band: BandKey) => void;
  onTapTeam: (teamId: string) => void;
  onDropInto: (band: BandKey) => void;
  onUndo: () => void;
}) {
  const teamsInBand = (band: BandKey) =>
    teams.filter((t) => assignments[t.id] === band);
  const liftedBand = lifted ? (assignments[lifted] ?? null) : null;
  // The undo affordance shows inside whichever Band(s) the move landed in --
  // one Band for a plain move, two for a swap (each team's new Band).
  // That's always a currently-expanded Band (it's either `openBand` while
  // filling, or every Band is expanded in review).
  const undoBands: BandKey[] = undo
    ? undo.kind === "move"
      ? [assignments[undo.teamId] ?? undo.band]
      : [
          assignments[undo.teamA.teamId] ?? undo.teamA.band,
          assignments[undo.teamB.teamId] ?? undo.teamB.band,
        ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      {TABLE_BANDS.map((band) => {
        const inBand = teamsInBand(band.key);
        const meta = BAND_META[band.key];
        const isChampionSingle = band.key === "champion" && inBand.length === 1;
        const tone = fillTone(inBand.length, band.target);
        const headerBackground = HEADER_BACKGROUND[tone];

        const isOpen = mode === "filling" && band.key === openBand;
        const expanded = mode === "review" || isOpen;

        if (!expanded) {
          return (
            <div key={band.key}>
              {band.key === "relegated" ? <DropDivider /> : null}
              <CollapsedBandRow
                band={band}
                teams={inBand}
                onOpen={() => onOpenBand(band.key)}
              />
            </div>
          );
        }

        const showDropTarget =
          mode === "review" && lifted && liftedBand !== band.key;

        return (
          <div key={band.key}>
            {band.key === "relegated" ? <DropDivider /> : null}
            <CardShell
              className={
                isOpen
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-paper"
                  : ""
              }
            >
              <CardShellHeader
                style={
                  headerBackground
                    ? { background: headerBackground }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex shrink-0 items-center justify-center rounded-badge bg-paper/15 px-2 py-1 text-[0.7rem] font-extrabold text-paper tabular-nums">
                      {meta.positions}
                    </span>
                    <h2 className="inline-flex items-center gap-1.5 text-[0.8rem] font-bold tracking-[0.04em] text-paper uppercase">
                      <meta.Icon className="size-4" aria-hidden />
                      {band.label}
                    </h2>
                  </div>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-paper/85">
                    {countRead(inBand.length, band.target)}
                  </span>
                </div>
              </CardShellHeader>
              <CardShellBody>
                {undo && undoBands.includes(band.key) ? (
                  <UndoRow undo={undo} onUndo={onUndo} />
                ) : null}

                <div className={`grid ${PLACED_TEAM_GRID_COLS} gap-2`}>
                  {inBand.map((team) => (
                    <PlacedTeamCard
                      key={team.id}
                      team={team}
                      emphasis={isChampionSingle}
                      overfilled={inBand.length > band.target}
                      disabled={busyTeamIds.includes(team.id)}
                      liftedHere={lifted === team.id}
                      justSwapped={
                        justSwapped != null &&
                        (justSwapped[0] === team.id ||
                          justSwapped[1] === team.id)
                      }
                      celebrate={celebratingChampion && band.key === "champion"}
                      onTap={() => onTapTeam(team.id)}
                    />
                  ))}
                  {inBand.length < band.target
                    ? Array.from({ length: band.target - inBand.length }).map(
                        (_, index) => (
                          <div
                            key={`empty-${band.key}-${index}`}
                            className="flex min-h-12 items-center justify-center rounded-btn border-2 border-dashed border-paper-line bg-paper/60 px-3 text-sm font-bold text-ink/35"
                            aria-label={`${band.label} empty slot`}
                          >
                            Empty slot
                          </div>
                        ),
                      )
                    : null}
                </div>

                {showDropTarget ? (
                  <button
                    type="button"
                    onClick={() => onDropInto(band.key)}
                    className="mt-2 w-full rounded-btn border-2 border-dashed border-accent bg-accent/10 px-3 py-2.5 text-sm font-extrabold text-ink transition hover:bg-accent/20"
                  >
                    Move {teamsById.get(lifted!)?.name ?? "that team"} here
                  </button>
                ) : null}

                {isOpen && tone === "ok" && nextBand ? (
                  <button
                    type="button"
                    onClick={() => onOpenBand(nextBand)}
                    className="mt-3 flex w-full items-center justify-center gap-1 rounded-btn border-2 border-accent bg-accent/10 px-3 py-2.5 text-sm font-extrabold text-ink transition hover:bg-accent/20"
                  >
                    Next: {BAND_LABEL[nextBand]}
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                ) : null}

                {isOpen ? (
                  <>
                    <p className="mt-3 mb-2 px-0.5 text-[0.68rem] font-bold tracking-[0.12em] text-ink/40 uppercase">
                      Last season&apos;s table
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                      {teams.map((team) => (
                        <RosterChip
                          key={team.id}
                          team={team}
                          band={assignments[team.id] ?? null}
                          busy={busyTeamIds.includes(team.id)}
                          onTap={() => onTapTeam(team.id)}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </CardShellBody>
            </CardShell>
          </div>
        );
      })}
    </div>
  );
}
