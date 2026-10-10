import { describe, expect, it } from "vitest";
import { decidePredictTableView } from "./predict-table-view";

// What /predict-table shows each viewer (issue #226, "Who sees what" and
// S1-S4). Branch test for the pure decision -- the page only renders it.

const base = {
  locked: false,
  isLateJoiner: false,
  hasSubmittedTable: false,
  standingsComplete: true,
  editRequested: false,
};

describe("decidePredictTableView -- on-time players", () => {
  it("keeps the capture board before the deadline, submitted or not", () => {
    expect(decidePredictTableView(base)).toBe("flow");
    expect(decidePredictTableView({ ...base, hasSubmittedTable: true })).toBe(
      "flow",
    );
  });

  it("shows single mode after the deadline for a submitted table (S1)", () => {
    expect(
      decidePredictTableView({
        ...base,
        locked: true,
        hasSubmittedTable: true,
      }),
    ).toBe("single");
  });

  it("shows only a message after the deadline for an un-submitted table (S2)", () => {
    expect(decidePredictTableView({ ...base, locked: true })).toBe(
      "not-submitted",
    );
  });

  it("waits for standings: a submitted table with nothing to score against yet (S4)", () => {
    expect(
      decidePredictTableView({
        ...base,
        locked: true,
        hasSubmittedTable: true,
        standingsComplete: false,
      }),
    ).toBe("awaiting-standings");
  });

  it("ignores ?edit=1 after the deadline -- an on-time table stays locked (S3)", () => {
    expect(
      decidePredictTableView({
        ...base,
        locked: true,
        hasSubmittedTable: true,
        editRequested: true,
      }),
    ).toBe("single");
  });
});

describe("decidePredictTableView -- Late Joiners (never locked)", () => {
  const late = { ...base, isLateJoiner: true };

  it("shows single mode for a submitted table, with standings (S3)", () => {
    expect(decidePredictTableView({ ...late, hasSubmittedTable: true })).toBe(
      "single",
    );
  });

  it("opens the capture board when they ask to edit (S3)", () => {
    expect(
      decidePredictTableView({
        ...late,
        hasSubmittedTable: true,
        editRequested: true,
      }),
    ).toBe("flow");
  });

  it("keeps the capture board while their table is un-submitted (mid-edit or never)", () => {
    expect(decidePredictTableView(late)).toBe("flow");
  });

  it("keeps the skipped screen for a Late Joiner who skipped -- a skipped table is never submitted", () => {
    expect(decidePredictTableView({ ...late, hasSubmittedTable: false })).toBe(
      "flow",
    );
  });

  it("waits for standings with a submitted table, like everyone else (S4)", () => {
    expect(
      decidePredictTableView({
        ...late,
        hasSubmittedTable: true,
        standingsComplete: false,
      }),
    ).toBe("awaiting-standings");
  });
});
