import { describe, expect, it } from "vitest";
import { ordinal } from "./ordinal";

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
