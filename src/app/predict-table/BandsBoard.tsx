import { Check, ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import {
  CardShell,
  CardShellBody,
  CardShellHeader,
} from "@/components/ui/CardShell";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { type BandKey, TABLE_BANDS } from "@/lib/table-predictions/rules";
import {
  bandMemberOrder,
  countRead,
  fillTone,
} from "@/lib/table-predictions/board";
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

/** What the undo affordance replays: the moved team back to `band`. See
 * PredictTableFlow's handleUndo for the replay logic. */
export type UndoState = MoveUndo;

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

/** A placed team's card inside the open Band. Tapping it toggle-reverts the
 * club to where it came from (see PredictTableFlow's handleTeamTap). */
function PlacedTeamCard({
  team,
  emphasis,
  overfilled,
  onTap,
  disabled,
  nextOut,
  celebrate,
}: {
  team: Team;
  emphasis?: boolean;
  overfilled?: boolean;
  onTap: () => void;
  disabled?: boolean;
  /** True for the club that will be displaced if another arrives while
   * this Band is full. Renders as a warm tint and nothing else -- the
   * sentence above the roster is what explains it. */
  nextOut?: boolean;
  /** True for the champion card the moment the ceremony fires -- the card
   * landing with weight (issue #118), a brief pulse in place of a confirm
   * dialog. */
  celebrate?: boolean;
}) {
  const fill = teamFill(team.shortCode);
  const ground = nextOut
    ? "border-warning/60 bg-warning/10"
    : overfilled
      ? "border-danger/50 bg-danger/10 hover:border-danger"
      : emphasis
        ? ""
        : "border-paper-line bg-white hover:border-accent/50";
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`group flex min-h-12 items-stretch gap-3 overflow-hidden rounded-btn border py-3 pr-3 pl-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        emphasis ? "border-accent bg-accent/10 ring-1 ring-accent/40" : ""
      } ${ground} ${celebrate ? "motion-safe:animate-swap-pulse" : ""}`}
    >
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <ClubCodeBadge shortCode={team.shortCode} fill={fill} />
        {/* displayName, not name: the badge beside it already identifies
            the club exactly, and `name` truncates to "Brighton & Hove
            Albi..." on a phone -- a full name that doesn't fit is worse
            than a short one that does. */}
        <span
          title={team.name}
          className={`min-w-0 flex-1 truncate font-bold text-ink ${emphasis ? "text-lg" : "text-[0.95rem]"}`}
        >
          {team.displayName}
        </span>
      </span>
      {/* The "NEXT OUT" chip is gone: it named a mechanism rather than
          describing anything, and two words can't carry a rule this
          conditional. What it was protecting -- eviction being stated
          before it happens, which is the whole reason automatic eviction is
          defensible at all -- now lives entirely in the plain-English line
          above the roster, which names the club. This card keeps only the
          warm tint, so that sentence has something to point at. */}
      <X aria-hidden className="size-4 shrink-0 self-center text-ink/30" />
    </button>
  );
}

/**
 * The roster: every club, always present, tappable into the open Band.
 *
 * One line, not two. Last season's position sits in a leading slot beside
 * the name rather than on its own second line, which nearly
 * halves the chip and so the roster. A placed club drops its Band label
 * entirely -- the collapsed Bands directly above already state, in full,
 * who is in each one, so repeating it 20 times here was the same fact at
 * 20x the cost. It keeps the muted treatment and a tick, which is all the
 * chip actually has to say: "this one's done, tap to move it".
 */
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
  const position = team.previousSeasonPosition;
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled || busy}
      title={
        position ? `${team.name} \u2014 finished ${position}th` : team.name
      }
      aria-label={
        band
          ? `Move ${team.name} out of ${BAND_LABEL[band]}`
          : `Place ${team.name}${position ? `, finished ${position}th` : ", promoted"}`
      }
      className={`flex items-center gap-1.5 overflow-hidden rounded-btn-sm border py-1.5 pr-2 pl-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        band
          ? "border-paper-line bg-ink/[0.06] opacity-55 hover:opacity-100"
          : "border-paper-line bg-white hover:border-accent/50"
      }`}
    >
      <span
        aria-hidden
        className={`h-5 w-1 shrink-0 rounded-full ${band ? "bg-ink/20" : ""}`}
        style={band ? undefined : { background: fill }}
      />
      {band ? (
        <Check aria-hidden className="size-3 shrink-0 text-ink/45" />
      ) : (
        <span
          aria-hidden
          className="w-4 shrink-0 text-right text-[0.62rem] leading-none font-bold text-ink/40 tabular-nums"
        >
          {position ?? "\u2191"}
        </span>
      )}
      <span
        className={`min-w-0 flex-1 truncate text-[0.76rem] leading-tight font-extrabold ${band ? "text-ink/55" : "text-ink"}`}
      >
        {team.displayName}
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
//
// This row does two jobs, not one. With no separate review board, the
// collapsed rows *are* the player's table, so this has to
// read as a finished answer and not just as a waypoint: the position range
// is shown (so the stack reads as an actual league table, 1 through 20) and
// members carry their club-code badge plus name at real weight.
//
// The badge replaced a bare kit-colour rail, which looked right in the
// abstract and failed on the actual Premier League: Arsenal, Liverpool, Man
// United, Sunderland, Forest, Palace, Bournemouth and Brentford all render
// as the same red, so a wash of identical rails disambiguated nothing while
// costing a column of width. The 3-letter badge is the app's existing club
// token and is unambiguous by construction.
/** One club in a collapsed Band's members grid: a thin kit rail and the
 * short name. Only multi-club Bands render this -- a one-club Band puts its
 * club on the header line instead, with a badge and full weight, since
 * there it is the answer rather than one of three. */
function MemberName({ team }: { team: Team }) {
  return (
    <span title={team.name} className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="h-3.5 w-[3px] shrink-0 rounded-full"
        style={{ background: teamFill(team.shortCode) }}
      />
      <span className="min-w-0 truncate text-[0.8rem] leading-snug font-bold text-ink/75">
        {team.displayName}
      </span>
    </span>
  );
}

function CollapsedBandRow({
  band,
  teams,
  boardComplete,
  onOpen,
}: {
  band: (typeof TABLE_BANDS)[number];
  teams: Team[];
  /** Every Band exactly filled. The per-Band count stops being information
   * at that point -- eight identical "3/3"s restate what "20 of 20 placed"
   * already said -- so it drops to a bare tick and the row is all clubs. */
  boardComplete: boolean;
  onOpen: () => void;
}) {
  const meta = BAND_META[band.key];
  const filled = teams.length;
  const tone = fillTone(filled, band.target);
  // The one call the whole feature is about, and until now visually
  // identical to Mid Table in the stack. It gets weight, not a different
  // shape -- it is still a row of the same table.
  const isChampion = band.key === "champion";
  // A one-club Band puts its club on the header line instead of giving it a
  // row of its own. Three clubs can't fit beside the label; one can, and
  // "Champion — Arsenal" is how you'd actually say it. The alternative left
  // Champion and Runners Up as a full-width row holding one short name and
  // two-thirds empty space, which read as unfinished rather than decisive.
  // Different content earning a different shape, not an inconsistency.
  const inlineMember = band.target === 1;
  // Pomp for the two single-club Bands, and a hierarchy between them.
  // DESIGN_SYSTEM.md reserves `accent` for a short list of emotionally
  // relevant spots including the 1st-place tint, so Champion takes it and
  // Runners Up gets a quieter neutral lift -- which is the right ordering
  // anyway. Only when the Band is correctly filled: an empty Champion still
  // needs the "something to do here" wash more than it needs ceremony.
  const marquee =
    inlineMember && tone === "ok"
      ? isChampion
        ? "border-accent/50 bg-accent/[0.07]"
        : "border-ink/20 bg-white"
      : FILL_GROUND[tone];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${band.label}`}
      className={`group flex w-full flex-col gap-1.5 rounded-card border px-3 py-2.5 text-left transition hover:border-accent hover:bg-accent/[0.04] ${marquee}`}
    >
      <span className="flex w-full items-center gap-2">
        <span
          className={`inline-flex min-w-8 shrink-0 items-center justify-center rounded-badge px-1.5 py-0.5 text-[0.65rem] font-extrabold tabular-nums ${
            isChampion && tone === "ok"
              ? "bg-accent text-accent-ink"
              : "bg-ink/[0.07] text-ink/55"
          }`}
        >
          {meta.positions}
        </span>
        <meta.Icon
          className={`size-4 shrink-0 ${isChampion ? "text-accent" : "text-ink/60"}`}
          aria-hidden
        />
        <span
          className={`min-w-0 truncate font-extrabold ${
            inlineMember
              ? "shrink-0 text-[0.8rem] text-ink/55"
              : `flex-1 text-ink ${isChampion ? "text-[0.95rem]" : "text-[0.8rem]"}`
          }`}
        >
          {band.label}
        </span>
        {/* The club, not the label, is the answer -- so it is the loudest
            thing in the row. It previously rendered at the same weight as a
            group member and a step quieter than the word "Champion", which
            made the category outrank its own result and left no visible
            seam between the two. The kit badge does the separating: one
            badge is a focal point, where three a row (the reason it was
            dropped from the members grid) was noise. */}
        {inlineMember
          ? teams.map((team) => (
              <span
                key={team.id}
                title={team.name}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <ClubCodeBadge
                  shortCode={team.shortCode}
                  fill={teamFill(team.shortCode)}
                />
                <span
                  className={`min-w-0 truncate font-extrabold text-ink ${isChampion ? "text-[1.05rem]" : "text-[0.95rem]"}`}
                >
                  {team.displayName}
                </span>
              </span>
            ))
          : null}
        <span
          className={`shrink-0 text-[0.7rem] tabular-nums ${FILL_COUNT_TEXT[tone]}`}
        >
          {boardComplete ? "✓" : countRead(filled, band.target)}
        </span>
        {/* The "you can open this" affordance. A chevron on every collapsed
            row, at full strength rather than a hover-only reveal -- on a
            phone there is no hover, so an affordance that only appears on
            one is no affordance at all. */}
        <ChevronDown
          className="size-4 shrink-0 text-ink/35 transition group-hover:text-accent"
          aria-hidden
        />
      </span>
      {/* Members used to wrap inline, which meant three clubs broke 2 + 1,
          nothing lined up with anything, and every Band ended up a different
          shape -- the "messy" read. The club-code badge went at the same
          time: badge *and* name is the same club said twice, and three
          saturated badges a row was most of the visual noise. A thin kit
          rail keeps the identity cue without competing with the name, which
          is the thing actually being read here.

          A fixed three-column grid, flush to the card edge -- no gutter, no
          wrapping, one line per Band. Three equal columns mean every
          multi-club Band lands on the same two gridlines, so the stack
          aligns down the whole page instead of each Band finding its own
          shape. One-club Bands skip this block entirely and sit on the
          header line instead -- see `inlineMember`.

          It also reads better as a *set* than the vertical stack did: a
          numbered-looking column is the canonical ordered form, while an
          evenly-spaced row is not. Only "Nottingham Forest" is long enough
          to clip at phone width, and `title` carries the full name. */}
      {inlineMember ? null : teams.length ? (
        <span className="grid w-full grid-cols-3 gap-x-2 gap-y-1">
          {teams.map((team) => (
            <MemberName key={team.id} team={team} />
          ))}
        </span>
      ) : (
        <span className="w-full text-[0.8rem] leading-snug font-semibold text-ink/35">
          Nobody yet
        </span>
      )}
    </button>
  );
}

export function BandsBoard({
  teams,
  assignments,
  openBand,
  nextBand,
  nextOutTeamId,
  demotedFrom,
  boardComplete,
  busyTeamIds,
  undo,
  celebratingChampion,
  onOpenBand,
  onCloseBand,
  onTapTeam,
  onUndo,
}: {
  teams: Team[];
  assignments: Record<string, BandKey>;
  /** Zero or one Band is open. Band headers are the only navigation and
   * they toggle -- tapping the open one closes it, so everything collapsed
   * is a reachable state rather than a separate "review board". The
   * collapsed rows carry full membership, so all-closed already is the
   * review of the table. */
  openBand: BandKey | null;
  /** The Band the "Next: [Band] →" prompt advances to, once the open Band
   * is exactly filled -- null while there's nothing under-filled ahead
   * (issue #130). */
  nextBand: BandKey | null;
  /** The club in the open Band that eviction would displace, or null while
   * that Band still has room. */
  nextOutTeamId: string | null;
  /** Index in `teams` where the already-placed group begins. Re-computed
   * only when the open Band changes, so the roster never reflows mid-tap. */
  demotedFrom: number;
  /** Every Band exactly filled -- collapses the per-Band counts to ticks. */
  boardComplete: boolean;
  busyTeamIds: string[];
  undo: UndoState | null;
  /** True while the champion ceremony is playing -- the champion card
   * lands with weight (issue #118). */
  celebratingChampion: boolean;
  onOpenBand: (band: BandKey) => void;
  onCloseBand: () => void;
  onTapTeam: (teamId: string) => void;
  onUndo: () => void;
}) {
  // Alphabetical inside a Band, never insertion or last-season order --
  // see bandMemberOrder: a stack under a "3-5" badge otherwise reads as a
  // ranking that this feature deliberately doesn't record or score.
  const teamsInBand = (band: BandKey) =>
    bandMemberOrder(teams.filter((t) => assignments[t.id] === band));
  // The undo affordance shows inside the Band the move landed in. A team
  // evicted back to the roster has no Band, so its undo falls back to the
  // Band it was evicted from -- which is the open one, and therefore always
  // visible.
  const undoBands: BandKey[] = undo
    ? [assignments[undo.teamId] ?? undo.band]
    : [];

  return (
    <div className="flex flex-col gap-3">
      {TABLE_BANDS.map((band) => {
        const inBand = teamsInBand(band.key);
        const meta = BAND_META[band.key];
        const isChampionSingle = band.key === "champion" && inBand.length === 1;
        const tone = fillTone(inBand.length, band.target);
        const headerBackground = HEADER_BACKGROUND[tone];

        const isOpen = band.key === openBand;

        if (!isOpen) {
          return (
            <div key={band.key}>
              {band.key === "relegated" ? <DropDivider /> : null}
              <CollapsedBandRow
                band={band}
                teams={inBand}
                boardComplete={boardComplete}
                onOpen={() => onOpenBand(band.key)}
              />
            </div>
          );
        }

        return (
          <div key={band.key}>
            {band.key === "relegated" ? <DropDivider /> : null}
            <CardShell className="ring-2 ring-accent ring-offset-2 ring-offset-paper">
              <CardShellHeader
                style={
                  headerBackground
                    ? { background: headerBackground }
                    : undefined
                }
              >
                {/* Band headers are the only navigation and they toggle:
                    tapping the open one closes it. That makes "everything
                    collapsed" -- the whole table on one screen -- a place
                    you can get to with the same gesture you already use,
                    rather than a separate mode with its own control. */}
                <button
                  type="button"
                  onClick={onCloseBand}
                  aria-expanded
                  aria-label={`Close ${band.label}`}
                  className="-my-1 flex w-full items-center justify-between gap-2 py-1 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex shrink-0 items-center justify-center rounded-badge bg-paper/15 px-2 py-1 text-[0.7rem] font-extrabold text-paper tabular-nums">
                      {meta.positions}
                    </span>
                    <h2 className="inline-flex min-w-0 items-center gap-1.5 truncate text-[0.8rem] font-bold tracking-[0.04em] text-paper uppercase">
                      <meta.Icon className="size-4 shrink-0" aria-hidden />
                      {band.label}
                    </h2>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-bold tabular-nums text-paper/85">
                      {countRead(inBand.length, band.target)}
                    </span>
                    <ChevronUp className="size-4 text-paper/70" aria-hidden />
                  </span>
                </button>
              </CardShellHeader>
              <CardShellBody>
                {undo && undoBands.includes(band.key) ? (
                  <UndoRow undo={undo} onUndo={onUndo} />
                ) : null}

                {/* Said once, in the Band actually being filled, which is
                    when the misconception would form. Repeating it on all
                    eight collapsed rows would be noise; burying it in the
                    scoring accordion (where it also lives) is too late. */}
                {band.target > 1 ? (
                  <p className="mb-2 px-0.5 text-[0.72rem] font-semibold text-ink/45">
                    Any order &mdash; only who&apos;s in the Band counts.
                  </p>
                ) : null}

                <div className={`grid ${PLACED_TEAM_GRID_COLS} gap-2`}>
                  {inBand.map((team) => (
                    <PlacedTeamCard
                      key={team.id}
                      team={team}
                      emphasis={isChampionSingle}
                      overfilled={inBand.length > band.target}
                      disabled={busyTeamIds.includes(team.id)}
                      nextOut={nextOutTeamId === team.id}
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

                {tone === "ok" && nextBand ? (
                  <button
                    type="button"
                    onClick={() => onOpenBand(nextBand)}
                    className="mt-3 flex w-full items-center justify-center gap-1 rounded-btn border-2 border-accent bg-accent/10 px-3 py-2.5 text-sm font-extrabold text-ink transition hover:bg-accent/20"
                  >
                    Next: {BAND_LABEL[nextBand]}
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                ) : null}

                <>
                  <p className="mt-3 mb-2 px-0.5 text-[0.68rem] font-bold tracking-[0.12em] text-ink/40 uppercase">
                    Still to place
                  </p>
                  {/* The eviction rule, stated where the tap that triggers
                        it happens. Only shown while the Band is genuinely
                        full, so it reads as a live consequence rather than
                        a standing instruction. */}
                  {nextOutTeamId ? (
                    <p className="-mt-1 mb-2 px-0.5 text-[0.75rem] font-semibold text-ink/60">
                      {band.label} is full. Tapping another club swaps it in for{" "}
                      <span className="font-extrabold text-ink/80">
                        {teams.find((t) => t.id === nextOutTeamId)
                          ?.displayName ?? "the highlighted club"}
                      </span>
                      .
                    </p>
                  ) : null}
                  {/* Two columns at phone width, not three. At three, "Man
                      United" truncated to "Man Uni..." sits beside "Man
                      City" -- two different clubs a tap apart, told apart
                      only by an ellipsis. Costs height, buys not picking
                      the wrong club. */}
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                    {teams.slice(0, demotedFrom).map((team) => (
                      <RosterChip
                        key={team.id}
                        team={team}
                        band={assignments[team.id] ?? null}
                        busy={busyTeamIds.includes(team.id)}
                        onTap={() => onTapTeam(team.id)}
                      />
                    ))}
                  </div>

                  {/* The demotion is captioned, not silent. A player who
                      notices Arsenal has moved needs to read it as the list
                      tidying itself, not as the list losing their place. */}
                  {demotedFrom < teams.length ? (
                    <>
                      <p className="mt-3 mb-1.5 px-0.5 text-[0.62rem] font-bold tracking-[0.1em] text-ink/35 uppercase">
                        Already placed &middot; {teams.length - demotedFrom}
                        <span className="ml-1.5 font-semibold tracking-normal normal-case">
                          &mdash; tap one to move it here
                        </span>
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
                        {teams.slice(demotedFrom).map((team) => (
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
                </>
              </CardShellBody>
            </CardShell>
          </div>
        );
      })}
    </div>
  );
}
