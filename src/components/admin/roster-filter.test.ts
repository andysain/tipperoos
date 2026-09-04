import { describe, expect, it } from "vitest";
import type { RosterPlayer } from "@/app/_lib/admin-roster-access";
import {
  matchesRosterFilter,
  playerIsNotTipped,
  playerNeedsAttention,
  sortRoster,
} from "./roster-filter";

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

describe("playerIsNotTipped", () => {
  it("is true for a person with zero picks this gameweek", () => {
    expect(playerIsNotTipped(player({ currentGameweekPickCount: 0 }))).toBe(
      true,
    );
  });

  it("is false for a BOT with zero picks (bots aren't reminded)", () => {
    expect(
      playerIsNotTipped(player({ isBot: true, currentGameweekPickCount: 0 })),
    ).toBe(false);
  });

  it("is false with a partial pick count, and false when there's no current gameweek", () => {
    expect(playerIsNotTipped(player({ currentGameweekPickCount: 1 }))).toBe(
      false,
    );
    expect(playerIsNotTipped(player({ currentGameweekPickCount: null }))).toBe(
      false,
    );
  });
});

describe("playerNeedsAttention", () => {
  it("is false for a settled player who has filed picks", () => {
    expect(playerNeedsAttention(base)).toBe(false);
  });

  it("is true when locked out, or flagged for a PIN reset, or a person who hasn't tipped", () => {
    expect(
      playerNeedsAttention(player({ lockedUntil: "2026-09-05T13:00:00.000Z" })),
    ).toBe(true);
    expect(playerNeedsAttention(player({ pinResetRequired: true }))).toBe(true);
    expect(playerNeedsAttention(player({ currentGameweekPickCount: 0 }))).toBe(
      true,
    );
  });

  it("is false for a bot with no picks (not a reminder target)", () => {
    expect(
      playerNeedsAttention(
        player({ isBot: true, currentGameweekPickCount: 0 }),
      ),
    ).toBe(false);
  });

  it("is false when there is no current gameweek (null count, not zero)", () => {
    expect(
      playerNeedsAttention(player({ currentGameweekPickCount: null })),
    ).toBe(false);
  });
});

describe("matchesRosterFilter", () => {
  const human = player({ isBot: false });
  const bot = player({ isBot: true, currentGameweekPickCount: 0 });
  const notTippedHuman = player({ isBot: false, currentGameweekPickCount: 0 });
  const lockedHuman = player({
    isBot: false,
    lockedUntil: "2026-09-05T13:00:00.000Z",
  });

  it("all matches everyone; humans/bots split on is_bot", () => {
    expect(matchesRosterFilter(human, "all")).toBe(true);
    expect(matchesRosterFilter(bot, "all")).toBe(true);
    expect(matchesRosterFilter(bot, "humans")).toBe(false);
    expect(matchesRosterFilter(bot, "bots")).toBe(true);
  });

  it("not-tipped matches only people with no picks, never bots", () => {
    expect(matchesRosterFilter(notTippedHuman, "not-tipped")).toBe(true);
    expect(matchesRosterFilter(human, "not-tipped")).toBe(false);
    expect(matchesRosterFilter(bot, "not-tipped")).toBe(false);
  });

  it("attention matches locked / not-tipped people, never a bot", () => {
    expect(matchesRosterFilter(human, "attention")).toBe(false);
    expect(matchesRosterFilter(lockedHuman, "attention")).toBe(true);
    expect(matchesRosterFilter(notTippedHuman, "attention")).toBe(true);
    expect(matchesRosterFilter(bot, "attention")).toBe(false);
  });
});

describe("sortRoster", () => {
  const settled = player({ id: "settled", displayName: "Zoe" });
  const bot = player({ id: "bot", displayName: "Aardvark Bot", isBot: true });
  const notTippedNoEmail = player({
    id: "chase",
    displayName: "Yusuf",
    currentGameweekPickCount: 0,
    hasEmail: false,
  });
  const notTippedWithEmail = player({
    id: "email",
    displayName: "Bea",
    currentGameweekPickCount: 0,
    hasEmail: true,
  });
  const roster = [settled, bot, notTippedWithEmail, notTippedNoEmail];

  it("name sort: people before bots, attention before settled, no-email chases first", () => {
    const ids = sortRoster(roster, "name").map((p) => p.id);
    expect(ids).toEqual(["chase", "email", "settled", "bot"]);
  });

  it("newest sort: most recent joiner first, ties broken by name", () => {
    const older = player({ id: "old", joinedAt: "2026-07-01T00:00:00.000Z" });
    const newer = player({ id: "new", joinedAt: "2026-09-01T00:00:00.000Z" });
    expect(sortRoster([older, newer], "newest").map((p) => p.id)).toEqual([
      "new",
      "old",
    ]);
  });
});
