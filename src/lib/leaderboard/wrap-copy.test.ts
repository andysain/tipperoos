import { describe, expect, it } from "vitest";
import { formatWrapText, type WrapPerson } from "./wrap-copy";
import type { GameweekWrap } from "./wrap";

// Golden output for the admin panel's "Copy as text" (#219 "Text format"):
// a `Gameweek N wrap` heading, then one line per winner shaped
// `{mark} {award}: {name} · {fact}`, Tipper's next-best line straight after
// the Tipper lines, `\n` endings and no trailing newline. The facts are the
// Season card's own strings (#222, #223), written out here by hand.

const people: Record<string, WrapPerson> = {
  leo: { displayName: "Leo", emoji: "🦊" },
  mia: { displayName: "Mia", emoji: "🐼" },
  sam: { displayName: "Sam", emoji: "🐸" },
  jo: { displayName: "Jo", emoji: "🐙" },
  ava: { displayName: "Ava", emoji: "🦄" },
};

describe("formatWrapText", () => {
  it("writes a full week: every kind, a tie, and a next-best line", () => {
    const wrap: GameweekWrap = {
      gameweekNumber: 6,
      shown: [],
      fired: [
        {
          kind: "tipper",
          winners: [
            { playerId: "leo", points: 12, onlyCall: { home: 2, away: 1 } },
          ],
          nextBest: { playerIds: ["mia", "ava"], points: 10 },
        },
        {
          kind: "topOfTheHill",
          winners: [
            { playerId: "leo", jointTop: true },
            { playerId: "sam", jointTop: true },
          ],
        },
        {
          kind: "onFire",
          winners: [{ playerId: "jo", streakLength: 8, newRecord: true }],
        },
        {
          kind: "rocket",
          winners: [{ playerId: "mia", placesClimbed: 4, newRank: 3 }],
        },
        {
          kind: "streakSnapped",
          winners: [
            {
              playerId: "sam",
              endedAt: 7,
              homeTeam: "Arsenal",
              awayTeam: "Chelsea",
              stillSeasonBest: true,
            },
          ],
        },
        {
          kind: "furthestOff",
          winners: [
            {
              playerId: "ava",
              homeTeam: "Arsenal",
              awayTeam: "Chelsea",
              pick: { home: 3, away: 0 },
              result: { home: 0, away: 2 },
              goalError: 5,
            },
          ],
        },
      ],
    };

    const text = formatWrapText(wrap, people);

    expect(text).toBe(
      [
        "Gameweek 6 wrap",
        "🏆 Tipper of the Week: Leo · +12pts · the only one to call 2–1",
        "Mia and Ava next best with 10pts",
        "👑 Top of the Hill: Leo · Joint top of the table",
        "👑 Top of the Hill: Sam · Joint top of the table",
        "🔥 On Fire: Jo · 8 right results in a row, a new season record",
        "🚀 Rocket: Mia · Up 4 places to 3rd",
        "🧊 Streak Snapped: Sam · A run of 7 ended in Arsenal v Chelsea, still the season best",
        "😬 Furthest Off: Ava · Arsenal v Chelsea: said 3–0, finished 0–2",
      ].join("\n"),
    );
    const lines = text.split("\n");
    expect(lines.length).toBe(9);
    expect(text.endsWith("\n")).toBe(false);
    // A tie gives one line per winner, and next best follows Tipper directly.
    expect(lines.filter((l) => l.startsWith("👑")).length).toBe(2);
    expect(lines.indexOf("Mia and Ava next best with 10pts")).toBe(2);
  });

  it("writes a GW1 week: Tipper (tied, so no next best) and Furthest Off", () => {
    const wrap: GameweekWrap = {
      gameweekNumber: 1,
      shown: [],
      fired: [
        {
          kind: "tipper",
          winners: [
            { playerId: "leo", points: 7, onlyCall: null },
            { playerId: "mia", points: 7, onlyCall: null },
          ],
          nextBest: null,
        },
        {
          kind: "furthestOff",
          winners: [
            {
              playerId: "jo",
              homeTeam: "Leeds",
              awayTeam: "Spurs",
              pick: { home: 0, away: 4 },
              result: { home: 2, away: 0 },
              goalError: 6,
            },
          ],
        },
      ],
    };

    const lines = formatWrapText(wrap, people).split("\n");

    expect(lines.length).toBe(4);
    expect(lines[0]).toBe("Gameweek 1 wrap");
    expect(lines[1]).toBe("🏆 Tipper of the Week: Leo · +7pts");
    expect(lines[2]).toBe("🏆 Tipper of the Week: Mia · +7pts");
    expect(lines[3]).toBe(
      "😬 Furthest Off: Jo · Leeds v Spurs: said 0–4, finished 2–0",
    );
  });

  it("writes only the heading when nothing fired", () => {
    const text = formatWrapText(
      { gameweekNumber: 3, shown: [], fired: [] },
      people,
    );

    expect(text).toBe("Gameweek 3 wrap");
    expect(text.split("\n").length).toBe(1);
  });

  it("names an unknown player 'A player', as the Season card does", () => {
    const text = formatWrapText(
      {
        gameweekNumber: 2,
        shown: [],
        fired: [
          {
            kind: "rocket",
            winners: [{ playerId: "gone", placesClimbed: 3, newRank: 1 }],
          },
        ],
      },
      people,
    );

    expect(text.split("\n")[1]).toBe(
      "🚀 Rocket: A player · Up 3 places to 1st",
    );
    expect(text.split("\n").length).toBe(2);
  });
});
