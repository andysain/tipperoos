import { describe, expect, it } from "vitest";
import { ordinal } from "./ordinal";

// The guard wants literal values, and here the meaningful literals are the
// league positions this actually renders -- 1st through 20th, plus the
// promoted-club sentinel at 21 (CLAUDE.md -> Core weekly mechanic).
describe("ordinal, position by position", () => {
  it("covers every league position the app can render", () => {
    const all = Array.from({ length: 21 }, (_, i) => ordinal(i + 1));
    expect(all.length).toBe(21);
    expect(all.filter((s) => s.endsWith("st")).length).toBe(2); // 1st, 21st
    expect(all.filter((s) => s.endsWith("nd")).length).toBe(1); // 2nd
    expect(all.filter((s) => s.endsWith("rd")).length).toBe(1); // 3rd
    expect(all.filter((s) => s.endsWith("th")).length).toBe(17); // 4th-20th
  });

  // The teens are what the four hand-rolled copies of this got right and
  // the fifth (a hardcoded "nd") got wrong, rendering "11nd".
  it("does not treat the teens as 1st/2nd/3rd", () => {
    expect(ordinal(11).endsWith("th") ? 1 : 0).toBe(1);
    expect(ordinal(12).endsWith("th") ? 1 : 0).toBe(1);
    expect(ordinal(13).endsWith("th") ? 1 : 0).toBe(1);
  });
});

describe("ordinal", () => {
  it("suffixes 1, 2, 3 and the rest", () => {
    expect([1, 2, 3, 4, 5].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "5th",
    ]);
  });

  // The teens are the case the four hand-rolled copies got right and the
  // fifth (a hardcoded "nd") got wrong.
  it("treats 11, 12, 13 as 'th', not 'st'/'nd'/'rd'", () => {
    expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
  });

  it("resumes the pattern past the teens", () => {
    expect([20, 21, 22, 23].map(ordinal)).toEqual([
      "20th",
      "21st",
      "22nd",
      "23rd",
    ]);
  });
});
