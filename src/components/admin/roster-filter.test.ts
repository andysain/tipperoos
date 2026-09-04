import { describe, expect, it } from "vitest";
import type { RosterPlayer } from "@/app/_lib/admin-roster-access";
import { matchesRosterFilter, playerNeedsAttention } from "./roster-filter";

const base: RosterPlayer = {
  id: "p1",
  emoji: "🦊",
  displayName: "Alex",
  isAdmin: false,
  isBot: false,
  isLateJoiner: false,
  hasEmail: true,
  lockedUntil: null,
  pinResetRequired: false,
  joinedAt: "2026-08-01T00:00:00.000Z",
  currentGameweekPickCount: 2,
};

const player = (patch: Partial<RosterPlayer>): RosterPlayer => ({
  ...base,
  ...patch,
});

describe("playerNeedsAttention", () => {
  it("is false for a settled player who has filed picks", () => {
    expect(playerNeedsAttention(base)).toBe(false);
  });

  it("is true when locked out", () => {
    expect(
      playerNeedsAttention(player({ lockedUntil: "2026-09-05T13:00:00.000Z" })),
    ).toBe(true);
  });

  it("is true when flagged for a PIN reset", () => {
    expect(playerNeedsAttention(player({ pinResetRequired: true }))).toBe(true);
  });

  it("is true when zero picks are filed for the current gameweek", () => {
    expect(playerNeedsAttention(player({ currentGameweekPickCount: 0 }))).toBe(
      true,
    );
  });

  it("is false when there is no current gameweek (null count, not zero)", () => {
    // Decision 7: a null count means "no current gameweek", which must not
    // read as "filed no picks".
    expect(
      playerNeedsAttention(player({ currentGameweekPickCount: null })),
    ).toBe(false);
  });

  it("is true on a partial pick count of one of two", () => {
    expect(playerNeedsAttention(player({ currentGameweekPickCount: 1 }))).toBe(
      false,
    );
  });
});

describe("matchesRosterFilter", () => {
  const human = player({ isBot: false });
  const bot = player({ isBot: true, currentGameweekPickCount: 0 });
  const lockedHuman = player({
    isBot: false,
    lockedUntil: "2026-09-05T13:00:00.000Z",
  });

  it("all matches everyone", () => {
    expect(matchesRosterFilter(human, "all")).toBe(true);
    expect(matchesRosterFilter(bot, "all")).toBe(true);
  });

  it("humans excludes bots and bots excludes humans", () => {
    expect(matchesRosterFilter(human, "humans")).toBe(true);
    expect(matchesRosterFilter(bot, "humans")).toBe(false);
    expect(matchesRosterFilter(bot, "bots")).toBe(true);
    expect(matchesRosterFilter(human, "bots")).toBe(false);
  });

  it("attention matches only players needing attention, bots included", () => {
    expect(matchesRosterFilter(human, "attention")).toBe(false);
    expect(matchesRosterFilter(lockedHuman, "attention")).toBe(true);
    expect(matchesRosterFilter(bot, "attention")).toBe(true);
  });
});
