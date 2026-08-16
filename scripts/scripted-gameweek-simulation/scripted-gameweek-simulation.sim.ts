// Issue #22 — Scripted gameweek-simulation test (TESTING_STANDARD.md §1b).
//
// pick -> lock -> result -> score -> corrected result -> rescore, asserting
// totals never drift. Drives the real src/lib scoring engine against real DB
// rows on the shared staging project (never CI, local dev only — D1a), through
// the injectable GameweekSimulationDriver seam (#34 swaps the lib driver for
// real API routes without touching this scenario — D2).
//
// Assertions (see issue #22 D4–D8):
//   1. scores match the engine's recompute for the first result
//   2. a corrected result + rescore replaces (never accumulates), and a
//      repeat rescore is idempotent
//   3. a voided match rescore zeroes every picker, via BOTH the authoritative
//      gameweek-slot signal and the defensive matches.status = 'postponed'
//   4. a void of the shared match zeroes every picker of that match regardless
//      of competition (the engine's match-level void contract, #21 D4), and
//      `scoresForCompetition` never leaks one competition's data into another
//   5. disposeSimulationWorld leaves every synthetic table at its pre-run count
//
// Absolute points are derived by running the engine against the known picks
// below; a few literals are pinned against CLAUDE.md's scoring section as
// independent anchors (D8). The reachable totals are the six-level set
// {0,1,3,4,5,7} — there is no exact-scoreline bonus (max is 7).
//
// Run (repo root, local dev, from .env.local creds):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx vitest run --config scripts/scripted-gameweek-simulation/vitest.config.ts
//
// Every run prints a readable per-stage scoring report. Add SIM_KEEP_WORLD=1 to
// keep the synthetic competition on staging afterwards (it prints the ids and
// the cleanup SQL) instead of disposing it in the finally block:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SIM_KEEP_WORLD=1 \
//     npx vitest run --config scripts/scripted-gameweek-simulation/vitest.config.ts

import { describe, expect, it } from "vitest";
import { recomputeMatchScores, type ScoreRow } from "@/lib/scoring/match";
import { scoresForCompetition } from "@/lib/competitions/scope";
import {
  createSimulationWorld,
  createStagingClient,
  disposeSimulationWorld,
  printKeptWorldWarning,
  setMatchStatus,
  setSlotVoided,
  snapshotRowCounts,
  type SimulationWorld,
} from "./fixtures";
import {
  LibGameweekSimulationDriver,
  type GameweekSimulationDriver,
} from "./driver";
import {
  reportLeaderboard,
  reportMatch,
  type Names,
} from "./report";

type PickTuple = { playerId: string; home: number; away: number };

function expectedPoints(
  matchId: string,
  result: { home: number; away: number } | null,
  voided: boolean,
  picks: PickTuple[],
): ScoreRow[] {
  return recomputeMatchScores({
    matchId,
    result,
    voided,
    picks: picks.map((p) => ({
      playerId: p.playerId,
      pickHome: p.home,
      pickAway: p.away,
    })),
  });
}

function pointsMap(
  rows: { playerId: string; points: number }[],
): Map<string, number> {
  return new Map(rows.map((r) => [r.playerId, r.points]));
}

async function expectSamePoints(
  driver: GameweekSimulationDriver,
  label: string,
  expected: ScoreRow[],
  matchId: string,
): Promise<void> {
  const actual = await driver.readScores(matchId);
  const expectedMap = pointsMap(expected);
  const actualMap = pointsMap(actual);
  expect(actualMap.size, `${label}: row count (no accumulation)`).toBe(
    expectedMap.size,
  );
  for (const [playerId, points] of expectedMap) {
    expect(
      actualMap.get(playerId) ?? null,
      `${label}: points for ${playerId}`,
    ).toBe(points);
  }
}

async function expectLeaderboard(
  supabase: ReturnType<typeof createStagingClient>,
  label: string,
  competitionId: string,
  seasonId: string,
  expected: { playerId: string; points: number }[],
): Promise<Awaited<ReturnType<typeof scoresForCompetition>>> {
  const rows = await scoresForCompetition(supabase, competitionId, seasonId);
  const byPlayer = new Map(rows.map((r) => [r.playerId, r.points]));
  expect(rows.length, `${label}: only this competition's players`).toBe(
    expected.length,
  );
  for (const row of rows) {
    expect(
      expected.some((e) => e.playerId === row.playerId),
      `${label}: leaked player ${row.playerId}`,
    ).toBe(true);
  }
  for (const e of expected) {
    expect(
      byPlayer.get(e.playerId) ?? null,
      `${label}: points for ${e.playerId}`,
    ).toBe(e.points);
  }
  return rows;
}

describe("scripted gameweek-simulation test (#22)", () => {
  it("runs pick -> lock -> result -> score -> corrected result -> rescore and finds no drift", async () => {
    const supabase = createStagingClient();

    // D7: the synthetic tables must return to exactly these counts.
    const baseline = await snapshotRowCounts(supabase);

    const world: SimulationWorld = await createSimulationWorld(supabase);
    const driver: GameweekSimulationDriver = new LibGameweekSimulationDriver(
      supabase,
    );

    const names: Names = new Map([
      [world.playerA1, "A1"],
      [world.playerA2, "A2"],
      [world.playerA3, "A3"],
      [world.playerB1, "B1"],
      [world.playerB2, "B2"],
    ]);

    const matchOnePicks: PickTuple[] = [
      { playerId: world.playerA1, home: 2, away: 1 }, // exact 2-1 -> 7
      { playerId: world.playerA2, home: 1, away: 0 },
      { playerId: world.playerA3, home: 0, away: 2 }, // wrong result -> 0
      { playerId: world.playerB1, home: 2, away: 1 },
      { playerId: world.playerB2, home: 0, away: 3 }, // wrong result -> 0
    ];
    const matchTwoPicks: PickTuple[] = [
      { playerId: world.playerA1, home: 3, away: 1 }, // exact 3-1 -> 7
      { playerId: world.playerA2, home: 2, away: 1 },
      { playerId: world.playerA3, home: 1, away: 3 }, // wrong-way-round -> 1
    ];

    try {
      // --- pick ---
      for (const p of matchOnePicks) {
        await driver.pick({
          playerId: p.playerId,
          matchId: world.matchOneId,
          predHomeScore: p.home,
          predAwayScore: p.away,
        });
      }
      for (const p of matchTwoPicks) {
        await driver.pick({
          playerId: p.playerId,
          matchId: world.matchTwoId,
          predHomeScore: p.home,
          predAwayScore: p.away,
        });
      }

      // --- lock (narrative boundary; lib driver enforces nothing, D3) ---
      await driver.lock(world.matchOneId);
      await driver.lock(world.matchTwoId);

      // --- result + score, match one at 2-1 ---
      await driver.setResult(world.matchOneId, 2, 1);
      await driver.score(world.matchOneId);
      await expectSamePoints(
        driver,
        "match one @ 2-1",
        expectedPoints(
          world.matchOneId,
          { home: 2, away: 1 },
          false,
          matchOnePicks,
        ),
        world.matchOneId,
      );

      // D8 literal anchors, pinned to CLAUDE.md's scoring section.
      const m1 = pointsMap(await driver.readScores(world.matchOneId));
      expect(
        m1.get(world.playerA1),
        "exact scoreline 2-1 pays 7 (3+2+1+1)",
      ).toBe(7);
      expect(m1.get(world.playerB2), "wrong result pays 0").toBe(0);
      reportMatch(
        "match one scored",
        matchOnePicks,
        { home: 2, away: 1 },
        false,
        await driver.readScores(world.matchOneId),
        names,
      );

      // --- result + score, match two at 3-1 ---
      await driver.setResult(world.matchTwoId, 3, 1);
      await driver.score(world.matchTwoId);
      await expectSamePoints(
        driver,
        "match two @ 3-1",
        expectedPoints(
          world.matchTwoId,
          { home: 3, away: 1 },
          false,
          matchTwoPicks,
        ),
        world.matchTwoId,
      );
      const m2 = pointsMap(await driver.readScores(world.matchTwoId));
      expect(
        m2.get(world.playerA3),
        "wrong-way-round (1-3 vs 3-1) pays exactly 1",
      ).toBe(1);
      reportMatch(
        "match two scored",
        matchTwoPicks,
        { home: 3, away: 1 },
        false,
        await driver.readScores(world.matchTwoId),
        names,
      );

      // --- leaderboard cross-competition leak check (shared match one) ---
      const compAMid = await expectLeaderboard(
        supabase,
        "comp A mid-cycle",
        world.competitionAId,
        world.seasonId,
        [
          { playerId: world.playerA1, points: 14 },
          { playerId: world.playerA2, points: 9 },
          { playerId: world.playerA3, points: 1 },
        ],
      );
      reportLeaderboard(
        "competition A — running totals (after both matches scored)",
        world.competitionAId,
        compAMid,
        names,
      );
      const compBMid = await expectLeaderboard(
        supabase,
        "comp B mid-cycle",
        world.competitionBId,
        world.seasonId,
        [
          { playerId: world.playerB1, points: 7 },
          { playerId: world.playerB2, points: 0 },
        ],
      );
      reportLeaderboard(
        "competition B — running totals (after both matches scored)",
        world.competitionBId,
        compBMid,
        names,
      );

      // --- corrected result -> rescore: totals NEVER drift ---
      await driver.setResult(world.matchOneId, 1, 0);
      await driver.score(world.matchOneId);
      await expectSamePoints(
        driver,
        "match one corrected to 1-0",
        expectedPoints(
          world.matchOneId,
          { home: 1, away: 0 },
          false,
          matchOnePicks,
        ),
        world.matchOneId,
      );
      const corrected = pointsMap(await driver.readScores(world.matchOneId));
      // Replacement, not accumulation: A1 was 7 at 2-1, is now 5 at 1-0 (CLAUDE.md).
      expect(
        corrected.get(world.playerA1),
        "corrected row replaced, not added to",
      ).toBe(5);
      reportMatch(
        "match one corrected to 1-0 (replacement, not accumulation)",
        matchOnePicks,
        { home: 1, away: 0 },
        false,
        await driver.readScores(world.matchOneId),
        names,
      );

      // Idempotent re-run: identical rows out of an unchanged state.
      const beforeRerun = await driver.readScores(world.matchOneId);
      await driver.score(world.matchOneId);
      expect(await driver.readScores(world.matchOneId)).toEqual(beforeRerun);

      // --- shared-match void contract (#21 D4: score 0 for every picker of a
      // voided match, regardless of competition), pinned explicitly ---
      await setSlotVoided(supabase, world.gameweekAId, "match_1", true);
      await driver.score(world.matchOneId);
      const sharedVoid = pointsMap(await driver.readScores(world.matchOneId));
      for (const p of matchOnePicks) {
        expect(
          sharedVoid.get(p.playerId) ?? null,
          `shared-match void zeroed picker ${p.playerId}`,
        ).toBe(0);
      }
      reportMatch(
        "match one voided (shared-match contract)",
        matchOnePicks,
        { home: 1, away: 0 },
        true,
        await driver.readScores(world.matchOneId),
        names,
      );
      await setSlotVoided(supabase, world.gameweekAId, "match_1", false);
      await driver.score(world.matchOneId);
      await expectSamePoints(
        driver,
        "match one restored after un-void",
        expectedPoints(
          world.matchOneId,
          { home: 1, away: 0 },
          false,
          matchOnePicks,
        ),
        world.matchOneId,
      );

      // --- voided match -> rescore zeroes every picker (D4), slot signal ---
      await setSlotVoided(supabase, world.gameweekAId, "match_2", true);
      await driver.score(world.matchTwoId);
      await expectSamePoints(
        driver,
        "match two voided (slot)",
        expectedPoints(
          world.matchTwoId,
          { home: 3, away: 1 },
          true,
          matchTwoPicks,
        ),
        world.matchTwoId,
      );
      const voided = pointsMap(await driver.readScores(world.matchTwoId));
      expect(
        voided.get(world.playerA2) ?? null,
        "voided 3-1 pick replaced by 0",
      ).toBe(0);

      // --- voided via the defensive signal: status postponed, no slot ---
      await setSlotVoided(supabase, world.gameweekAId, "match_2", false);
      await setMatchStatus(supabase, world.matchTwoId, "postponed");
      await driver.score(world.matchTwoId);
      await expectSamePoints(
        driver,
        "match two voided (postponed status)",
        expectedPoints(
          world.matchTwoId,
          { home: 3, away: 1 },
          true,
          matchTwoPicks,
        ),
        world.matchTwoId,
      );

      // --- restore the authoritative slot signal for the final state ---
      await setMatchStatus(supabase, world.matchTwoId, "completed");
      await setSlotVoided(supabase, world.gameweekAId, "match_2", true);
      await driver.score(world.matchTwoId);
      await expectSamePoints(
        driver,
        "match two voided (slot, restored)",
        expectedPoints(
          world.matchTwoId,
          { home: 3, away: 1 },
          true,
          matchTwoPicks,
        ),
        world.matchTwoId,
      );
      reportMatch(
        "match two voided",
        matchTwoPicks,
        { home: 3, away: 1 },
        true,
        await driver.readScores(world.matchTwoId),
        names,
      );

      // --- leaderboard after correction + void: still scoped, still right ---
      const compAPostVoid = await expectLeaderboard(
        supabase,
        "comp A post-void",
        world.competitionAId,
        world.seasonId,
        [
          { playerId: world.playerA1, points: 5 },
          { playerId: world.playerA2, points: 7 },
          { playerId: world.playerA3, points: 0 },
        ],
      );
      reportLeaderboard(
        "competition A — totals (post-void)",
        world.competitionAId,
        compAPostVoid,
        names,
      );
      const compBPostVoid = await expectLeaderboard(
        supabase,
        "comp B post-void",
        world.competitionBId,
        world.seasonId,
        [
          { playerId: world.playerB1, points: 5 },
          { playerId: world.playerB2, points: 0 },
        ],
      );
      reportLeaderboard(
        "competition B — totals (post-void)",
        world.competitionBId,
        compBPostVoid,
        names,
      );
    } finally {
      let disposeError: unknown;
      if (process.env.SIM_KEEP_WORLD === "1") {
        // Inspection mode: leave the synthetic world (and its scores rows) on
        // staging so Andy can query/see the data; prints ids + cleanup SQL.
        // Disposal is deliberately skipped here, so the row-count baseline
        // assertion below (which only holds once the world is gone) does not
        // apply in this branch.
        printKeptWorldWarning(world);
      } else {
        try {
          await disposeSimulationWorld(supabase, world);
        } catch (error) {
          disposeError = error;
        }
        expect(await snapshotRowCounts(supabase)).toEqual(baseline);
      }
      if (disposeError) throw disposeError;
    }
  }, 120_000);
});
