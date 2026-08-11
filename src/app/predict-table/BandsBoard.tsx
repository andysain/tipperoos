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
  bandGridCols,
  teamFill,
  type Team,
} from "./shared";

/** A placed team's card inside an open or expanded Band. Tapping it acts on
 * the team; which action depends on the phase (see PredictTableFlow). */
function PlacedTeamCard({
  team,
  emphasis,
  onTap,
  disabled,
  liftedHere,
}: {
  team: Team;
  emphasis?: boolean;
  onTap: () => void;
  disabled?: boolean;
  liftedHere?: boolean;
}) {
  const fill = teamFill(team.shortCode);
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`group flex items-stretch gap-2 overflow-hidden rounded-btn border py-1.5 pr-2 pl-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        emphasis ? "col-span-full border-accent bg-accent/10 ring-1 ring-accent/40" : ""
      } ${liftedHere ? "border-accent bg-accent/10 ring-2 ring-accent/50" : !emphasis ? "border-paper-line bg-white hover:border-accent/50" : ""}`}
    >
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <ClubCodeBadge shortCode={team.shortCode} fill={fill} />
        <span
          title={team.name}
          className={`min-w-0 flex-1 truncate font-bold text-ink ${emphasis ? "text-base" : "text-sm"}`}
        >
          {team.name}
        </span>
      </span>
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
      className={`flex items-stretch gap-1.5 overflow-hidden rounded-btn-sm border px-1.5 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        band
          ? "border-paper-line bg-ink/[0.03] opacity-70 hover:opacity-100"
          : "border-paper-line bg-white hover:border-accent/50"
      }`}
    >
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <span className="min-w-0">
        <span className="block truncate text-[0.72rem] leading-tight font-extrabold text-ink">
          {team.shortCode ?? team.name.slice(0, 3).toUpperCase()}
        </span>
        <span className="block truncate text-[0.62rem] leading-tight text-ink/50">
          {band
            ? BAND_LABEL[band]
            : (team.previousSeasonPosition ? `#${team.previousSeasonPosition}` : "Promoted")}
        </span>
      </span>
    </button>
  );
}

function CollapsedBandRow({
  band,
  teams,
  onOpen,
  onChipTap,
  busyTeamId,
}: {
  band: (typeof TABLE_BANDS)[number];
  teams: Team[];
  onOpen: () => void;
  onChipTap: (teamId: string) => void;
  busyTeamId: string | null;
}) {
  const meta = BAND_META[band.key];
  const filled = teams.length;
  const tone = fillTone(filled, band.target);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-2 rounded-card border px-3 py-2.5 text-left transition hover:border-accent/50 ${FILL_GROUND[tone]}`}
    >
      <meta.Icon className="size-4 shrink-0 text-ink/60" aria-hidden />
      <span className="w-[8.5rem] shrink-0 truncate text-[0.8rem] font-extrabold text-ink">
        {band.label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold text-ink/50">
        {teams.length
          ? teams.map((t, i) => (
              <span
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onChipTap(t.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onChipTap(t.id);
                  }
                }}
                aria-label={`Reconsider ${t.name}`}
                className={`cursor-pointer hover:text-ink hover:underline ${busyTeamId === t.id ? "opacity-40" : ""}`}
              >
                {t.shortCode ?? t.name.slice(0, 3).toUpperCase()}
                {i < teams.length - 1 ? " · " : ""}
              </span>
            ))
          : "—"}
      </span>
      <span
        className={`shrink-0 text-[0.7rem] tabular-nums ${FILL_COUNT_TEXT[tone]}`}
      >
        {countRead(filled, band.target)}
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
  lifted,
  busyTeamId,
  onOpenBand,
  onTapTeam,
  onDropInto,
}: {
  mode: Mode;
  teams: Team[];
  teamsById: Map<string, Team>;
  assignments: Record<string, BandKey>;
  openBand: BandKey;
  lifted: string | null;
  busyTeamId: string | null;
  onOpenBand: (band: BandKey) => void;
  onTapTeam: (teamId: string) => void;
  onDropInto: (band: BandKey) => void;
}) {
  const teamsInBand = (band: BandKey) =>
    teams.filter((t) => assignments[t.id] === band);
  const liftedBand = lifted ? (assignments[lifted] ?? null) : null;

  return (
    <div className="flex flex-col gap-2">
      {TABLE_BANDS.map((band) => {
        const inBand = teamsInBand(band.key);
        const meta = BAND_META[band.key];
        const isChampionSingle = band.key === "champion" && inBand.length === 1;
        const tone = fillTone(inBand.length, band.target);

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
                onChipTap={onTapTeam}
                busyTeamId={busyTeamId}
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
                isOpen ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : ""
              }
            >
              <CardShellHeader>
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
                  <span
                    className={`shrink-0 text-xs tabular-nums ${tone === "over" ? "font-bold text-danger" : "font-bold text-paper/70"}`}
                  >
                    {countRead(inBand.length, band.target)}
                  </span>
                </div>
              </CardShellHeader>
              <CardShellBody>
                <div className={`grid ${bandGridCols(band)} gap-1.5`}>
                  {inBand.length === 0 ? (
                    <p className="col-span-full text-sm text-ink/40">
                      {band.key === "champion"
                        ? "Tap a team to name your champion."
                        : "Nobody here yet."}
                    </p>
                  ) : (
                    inBand.map((team) => (
                      <PlacedTeamCard
                        key={team.id}
                        team={team}
                        emphasis={isChampionSingle}
                        disabled={busyTeamId === team.id}
                        liftedHere={lifted === team.id}
                        onTap={() => onTapTeam(team.id)}
                      />
                    ))
                  )}
                </div>

                {showDropTarget ? (
                  <button
                    type="button"
                    onClick={() => onDropInto(band.key)}
                    className="mt-2 w-full rounded-btn border-2 border-dashed border-accent bg-accent/10 px-3 py-2.5 text-sm font-extrabold text-ink transition hover:bg-accent/20"
                  >
                    Move {teamsById.get(lifted!)?.shortCode ?? "here"} here
                  </button>
                ) : null}

                {isOpen ? (
                  <>
                    <p className="mt-3 mb-1.5 px-0.5 text-[0.68rem] font-bold tracking-[0.12em] text-ink/40 uppercase">
                      Last season&apos;s table
                    </p>
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                      {teams.map((team) => (
                        <RosterChip
                          key={team.id}
                          team={team}
                          band={assignments[team.id] ?? null}
                          busy={busyTeamId === team.id}
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
