// PROTOTYPE -- issue #214. Pure view-model for G (the dumbbell view). Lives
// beside the route rather than in src/lib (issue P2); the production phase
// rewrites this as a tested builder under src/lib (issue D8). Every point
// value is read from src/lib/scoring, never typed (issue D9).

import {
  BOLD_CALL_BONUS,
  PLACEMENT_POINTS_BY_DISTANCE,
  bandIndexForRank,
  type PredictTableScoreResult,
} from "@/lib/scoring/predict-table";
import { TABLE_BANDS } from "@/lib/table-predictions/rules";

export interface SideCall {
  /** Predicted Band index, or null when the club was never placed. */
  band: number | null;
  /** Placement points only (issue D10). */
  points: number;
  boldCall: boolean;
}

export interface CompareRow {
  teamId: string;
  name: string;
  shortCode: string | null;
  position: number;
  actualBand: number;
  you: SideCall;
  them: SideCall;
}

export interface CompareSection {
  bandIndex: number;
  label: string;
  rows: CompareRow[];
}

export interface SideTotals {
  placement: number;
  bands: number;
  boldCalls: number;
  total: number;
  rightBandCount: number;
  exactBands: string[];
  boldCallCount: number;
}

export type SentenceRule = "biggest" | "bands" | "none";

export function buildSections(
  actualOrder: readonly string[],
  teamsById: ReadonlyMap<string, { name: string; shortCode: string | null }>,
  youBands: ReadonlyMap<string, number>,
  themBands: ReadonlyMap<string, number>,
  you: PredictTableScoreResult,
  them: PredictTableScoreResult,
): CompareSection[] {
  const sections: CompareSection[] = TABLE_BANDS.map((band, bandIndex) => ({
    bandIndex,
    label: band.label,
    rows: [],
  }));
  actualOrder.forEach((teamId, index) => {
    const position = index + 1;
    const actualBand = bandIndexForRank(position);
    const team = teamsById.get(teamId);
    sections[actualBand].rows.push({
      teamId,
      name: team?.name ?? "Unknown club",
      shortCode: team?.shortCode ?? null,
      position,
      actualBand,
      you: side(youBands, you, teamId),
      them: side(themBands, them, teamId),
    });
  });
  return sections;
}

function side(
  bands: ReadonlyMap<string, number>,
  result: PredictTableScoreResult,
  teamId: string,
): SideCall {
  return {
    band: bands.get(teamId) ?? null,
    points: result.teamScores[teamId] ?? 0,
    boldCall: result.boldCalls.includes(teamId),
  };
}

export function totals(
  result: PredictTableScoreResult,
  bands: ReadonlyMap<string, number>,
  actualOrder: readonly string[],
): SideTotals {
  let rightBandCount = 0;
  actualOrder.forEach((teamId, index) => {
    if (bands.get(teamId) === bandIndexForRank(index + 1)) rightBandCount++;
  });
  return {
    placement: result.placementScore,
    bands: result.bandBonusScore,
    boldCalls: result.boldCallScore,
    total: result.totalScore,
    rightBandCount,
    exactBands: TABLE_BANDS.map((b) => b.label).filter(
      (label) => (result.bandBonuses[label] ?? 0) > 0,
    ),
    boldCallCount: result.boldCalls.length,
  };
}

/** "Right Band", "1 Band out", ... and the points it earns -- all derived. */
export function placementReason(call: SideCall, actualBand: number): string {
  if (call.band === null) return `Not placed · 0`;
  const distance = Math.abs(call.band - actualBand);
  const points = PLACEMENT_POINTS_BY_DISTANCE[distance] ?? 0;
  const label =
    distance === 0
      ? "Right Band"
      : distance >= PLACEMENT_POINTS_BY_DISTANCE.length
        ? `${String(PLACEMENT_POINTS_BY_DISTANCE.length)}+ Bands out`
        : `${String(distance)} Band${distance === 1 ? "" : "s"} out`;
  return `${label} · ${points > 0 ? `+${String(points)}` : "0"}`;
}

/** The tap card's short Bold Call line -- the value read, never typed. */
export const BOLD_CALL_SHORT = `+${String(BOLD_CALL_BONUS)} Bold Call`;

// The row figure is Placement only (issue D10), so say where the +3 went.
export const BOLD_CALL_LINE = `Bold Call · +${String(BOLD_CALL_BONUS)} in Bold calls`;

type Component = "bands" | "placement" | "boldCalls";
// Tie order for the "biggest" rule (issue question 10's proposal).
const TIE_ORDER: Component[] = ["bands", "placement", "boldCalls"];

function plural(n: number, word: string): string {
  return `${String(n)} ${word}${n === 1 ? "" : "s"}`;
}

function mechanism(
  component: Component,
  leaderIsYou: boolean,
  lead: SideTotals,
  trail: SideTotals,
): string {
  const [subject, other] = leaderIsYou ? ["You", "their"] : ["They", "your"];
  switch (component) {
    case "bands":
      return `${subject} nailed ${plural(lead.exactBands.length, "Band")} exactly to ${other} ${String(trail.exactBands.length)}.`;
    case "placement":
      return `${subject} put ${plural(lead.rightBandCount, "club")} in the right Band to ${other} ${String(trail.rightBandCount)}.`;
    case "boldCalls":
      return `${subject} landed ${plural(lead.boldCallCount, "Bold Call")} to ${other} ${String(trail.boldCallCount)}.`;
  }
}

const COMPONENT_NAME: Record<Component, string> = {
  bands: "Bands",
  placement: "Placement",
  boldCalls: "Bold Calls",
};

function value(t: SideTotals, c: Component): number {
  return c === "bands"
    ? t.bands
    : c === "placement"
      ? t.placement
      : t.boldCalls;
}

export function headerSentence(
  rule: SentenceRule,
  themName: string,
  you: SideTotals,
  them: SideTotals,
): string {
  const gap = Math.abs(you.total - them.total);

  if (gap === 0) {
    const opening = `You and ${themName} are level on ${String(you.total)}.`;
    if (rule === "none") return opening;
    const parts = TIE_ORDER.filter((c) => value(you, c) !== value(them, c)).map(
      (c) => {
        const diff = value(you, c) - value(them, c);
        return diff > 0
          ? `you lead on ${COMPONENT_NAME[c]} by ${String(diff)}`
          : `${themName} leads on ${COMPONENT_NAME[c]} by ${String(-diff)}`;
      },
    );
    if (parts.length === 0) return opening;
    const joined = parts.join(", ");
    return `${opening} ${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
  }

  const leaderIsYou = you.total > them.total;
  const [lead, trail] = leaderIsYou ? [you, them] : [them, you];
  const opening = leaderIsYou
    ? `You're ${String(gap)} ahead of ${themName}.`
    : `${themName} is ${String(gap)} ahead.`;
  if (rule === "none") return opening;

  const leads = TIE_ORDER.map((c) => ({
    c,
    d: value(lead, c) - value(trail, c),
  }));
  const chosen =
    rule === "bands" && (leads.find((l) => l.c === "bands")?.d ?? 0) > 0
      ? leads.find((l) => l.c === "bands")!
      : leads.reduce((best, l) => (l.d > best.d ? l : best));
  if (chosen.d <= 0) return opening;

  const share =
    chosen.d === gap
      ? "That's the whole gap."
      : chosen.d > gap
        ? "That's more than the whole gap."
        : `That's ${String(chosen.d)} of the gap.`;
  return `${opening} ${mechanism(chosen.c, leaderIsYou, lead, trail)} ${share}`;
}
