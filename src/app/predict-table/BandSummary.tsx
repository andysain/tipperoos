import {
  CardShell,
  CardShellBody,
  CardShellHeader,
} from "@/components/ui/CardShell";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { type BandKey, TABLE_BANDS } from "@/lib/table-predictions/rules";
import {
  BAND_META,
  DropDivider,
  PLACED_TEAM_GRID_COLS,
  teamFill,
  type Team,
} from "./shared";

/** Read-only expanded board -- used once Predict the Table has locked. No
 * lifting, no drop targets, no tints: "one too many" is history, not a
 * task, at that point (docs/predict-table-capture-spec.md). */
export function BandSummary({
  assignments,
  teamsById,
}: {
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {TABLE_BANDS.map((band) => {
        const teamIds = Object.entries(assignments)
          .filter(([, b]) => b === band.key)
          .map(([teamId]) => teamId);
        const isChampion = band.key === "champion";
        const meta = BAND_META[band.key];

        return (
          <div key={band.key}>
            {band.key === "relegated" ? <DropDivider /> : null}
            <CardShell>
              <CardShellHeader>
                <div className="flex items-center gap-2">
                  <span className="inline-flex shrink-0 items-center justify-center rounded-badge bg-paper/15 px-2 py-1 text-[0.7rem] font-extrabold text-paper tabular-nums">
                    {meta.positions}
                  </span>
                  <h2 className="inline-flex items-center gap-1.5 text-[0.8rem] font-bold tracking-[0.04em] text-paper uppercase">
                    <meta.Icon className="size-4" aria-hidden />
                    {band.label}
                  </h2>
                </div>
              </CardShellHeader>
              <CardShellBody>
                <div className={`grid ${PLACED_TEAM_GRID_COLS} gap-2`}>
                  {teamIds.length === 0 ? (
                    <span className="text-sm text-ink/40">-</span>
                  ) : (
                    teamIds.map((teamId) => {
                      const team = teamsById.get(teamId);
                      if (!team) return null;
                      const fill = teamFill(team.shortCode);
                      const emphasis = isChampion && teamIds.length === 1;
                      return (
                        <div
                          key={teamId}
                          className={`flex items-stretch gap-3 overflow-hidden rounded-btn border py-3 pr-3 pl-2.5 ${
                            emphasis
                              ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                              : "border-paper-line bg-white"
                          }`}
                        >
                          <span
                            aria-hidden
                            className="w-1 shrink-0 rounded-full"
                            style={{ background: fill }}
                          />
                          <span className="flex min-w-0 flex-1 items-center gap-2.5">
                            <ClubCodeBadge
                              shortCode={team.shortCode}
                              fill={fill}
                            />
                            <span
                              title={team.name}
                              className={`min-w-0 flex-1 truncate font-bold text-ink ${emphasis ? "text-lg" : "text-[0.95rem]"}`}
                            >
                              {team.name}
                            </span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardShellBody>
            </CardShell>
          </div>
        );
      })}
    </div>
  );
}
