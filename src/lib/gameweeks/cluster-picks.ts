/**
 * Groups a match's picks into clusters of identical scorelines.
 *
 * The reveal shows ~16 players as ~5 rows; a flat one-row-per-player list is
 * the "dense, cramped per-match comparison layout" `docs/FRONTEND_BRIEFING.md`
 * names as a thing not to repeat, and it makes the crowd's shape invisible.
 * See `docs/adr/0013-match-centre-tense-and-axes.md` D13.
 *
 * Pure, and separated from the loader, because the ORDER is a product
 * decision with a stated rule rather than an implementation detail.
 */
export interface ClusterMember {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
}

export interface PickCluster {
  homeScore: number;
  awayScore: number;
  points: number | null;
  members: ClusterMember[];
}

export interface ClusterInput extends ClusterMember {
  homeScore: number | null;
  awayScore: number | null;
  points: number | null;
}

export function clusterPicks(
  picks: readonly ClusterInput[],
  viewerId: string,
): PickCluster[] {
  const byScoreline = new Map<string, PickCluster>();

  for (const pick of picks) {
    if (pick.homeScore === null || pick.awayScore === null) continue;
    const key = `${pick.homeScore}-${pick.awayScore}`;
    const member: ClusterMember = {
      playerId: pick.playerId,
      displayName: pick.displayName,
      emoji: pick.emoji,
      isBot: pick.isBot,
    };
    const existing = byScoreline.get(key);
    if (existing) existing.members.push(member);
    else
      byScoreline.set(key, {
        homeScore: pick.homeScore,
        awayScore: pick.awayScore,
        points: pick.points,
        members: [member],
      });
  }

  const clusters = [...byScoreline.values()];

  // Correct-first, then by crowd size. Before a result exists every cluster
  // scores null, so this falls through to crowd size on its own -- meaning
  // the list reshuffles exactly ONCE, when the result lands, rather than
  // being ordered on one basis pre-lock and another after.
  clusters.sort((a, b) => {
    const ap = a.points ?? -1;
    const bp = b.points ?? -1;
    if (ap !== bp) return bp - ap;
    return b.members.length - a.members.length;
  });

  // Within a cluster: you first, then people alphabetically, then bots.
  // Insertion order is fixture order, i.e. arbitrary, which put a player's
  // own chip anywhere in a cloud that wraps to three lines.
  for (const cluster of clusters) {
    cluster.members.sort((a, b) => {
      if (a.playerId === viewerId) return -1;
      if (b.playerId === viewerId) return 1;
      if (a.isBot !== b.isBot) return a.isBot ? 1 : -1;
      return a.displayName.localeCompare(b.displayName);
    });
  }

  return clusters;
}

/**
 * Did this scoreline score its point purely by being the result reversed?
 * `CLAUDE.md` -> Scoring: Wrong Way Round is mutually exclusive with every
 * other term, so it can only ever pay exactly 1, and it can never fire on a
 * draw. `docs/in-app-help-spec.md` calls it "the least self-evident rule in
 * the game and the single friendliest thing the app can say to a player who
 * otherwise blanked" -- so the reveal names it rather than rendering a bare
 * +1 in the faintest tone available.
 */
export function isWrongWayRound(
  pickHome: number,
  pickAway: number,
  resultHome: number | null,
  resultAway: number | null,
): boolean {
  if (resultHome === null || resultAway === null) return false;
  return (
    pickHome === resultAway && pickAway === resultHome && pickHome !== pickAway
  );
}
