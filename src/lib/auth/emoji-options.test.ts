import { describe, expect, it } from "vitest";
import { EMOJI_LIBRARY, EMOJI_OPTIONS, pickRandomEmoji } from "./emoji-options";

// The grid and the random pool share one source of truth (issue #127,
// decision log entry 3): every grid pick must pass the server's allowlist,
// so EMOJI_OPTIONS must always be a subset of EMOJI_LIBRARY -- a grid pick
// missing from the library would pass client-side then 400 on the server.
describe("EMOJI_OPTIONS vs EMOJI_LIBRARY", () => {
  it("keeps the original 10 grid options", () => {
    expect(EMOJI_OPTIONS).toEqual([
      "⚽",
      "🏆",
      "🔥",
      "🌟",
      "🦁",
      "🐯",
      "🐶",
      "🐱",
      "🎉",
      "🍕",
    ]);
    expect(EMOJI_OPTIONS.length).toBe(10);
  });

  it("every grid option is a member of the library", () => {
    for (const option of EMOJI_OPTIONS) {
      expect(EMOJI_LIBRARY, `grid option ${option}`).toContain(option);
    }
  });
});

describe("EMOJI_LIBRARY", () => {
  it("holds the curated count of 475 emojis (golden value -- changing the curation deliberately updates this)", () => {
    expect(EMOJI_LIBRARY.length).toBe(475);
  });

  it("has no duplicates", () => {
    expect(new Set(EMOJI_LIBRARY).size).toBe(475);
  });

  // The curation's mechanical acceptance bar (issue #127, deliverable 4):
  // a single code point is how the list excludes flags (regional
  // indicators), skin tones, keycaps and ZWJ sequences, which render
  // inconsistently across platforms. A multi-code-point entry is a bug.
  it("every entry is a single Unicode code point", () => {
    const multiCodePoint = EMOJI_LIBRARY.filter(
      (emoji) => [...emoji].length !== 1,
    );
    expect(multiCodePoint.length).toBe(0);
    for (const emoji of EMOJI_LIBRARY) {
      expect([...emoji].length, `entry ${emoji}`).toBe(1);
    }
  });
});

describe("pickRandomEmoji", () => {
  it("returns a library member when nothing is selected", () => {
    expect(EMOJI_LIBRARY).toContain(pickRandomEmoji(null));
  });

  it("never returns the current selection", () => {
    const current = EMOJI_LIBRARY[0];
    const violations = Array.from({ length: 500 }, () =>
      pickRandomEmoji(current),
    ).filter((pick) => pick === current);
    expect(violations.length).toBe(0);
  });

  it("maps a zero random() to the first eligible member", () => {
    expect(pickRandomEmoji(null, () => 0)).toBe(EMOJI_LIBRARY[0]);
    expect(pickRandomEmoji(EMOJI_LIBRARY[0], () => 0)).toBe(EMOJI_LIBRARY[1]);
  });

  it("maps a near-one random() to the last eligible member", () => {
    expect(pickRandomEmoji(null, () => 0.999)).toBe(
      EMOJI_LIBRARY[EMOJI_LIBRARY.length - 1],
    );
    const last = EMOJI_LIBRARY[EMOJI_LIBRARY.length - 1];
    expect(pickRandomEmoji(last, () => 0.999)).toBe(
      EMOJI_LIBRARY[EMOJI_LIBRARY.length - 2],
    );
  });

  it("clamps a hostile random() of exactly 1 to the last eligible member", () => {
    expect(pickRandomEmoji(null, () => 1)).toBe(
      EMOJI_LIBRARY[EMOJI_LIBRARY.length - 1],
    );
    const last = EMOJI_LIBRARY[EMOJI_LIBRARY.length - 1];
    expect(pickRandomEmoji(last, () => 1)).toBe(
      EMOJI_LIBRARY[EMOJI_LIBRARY.length - 2],
    );
  });
});
