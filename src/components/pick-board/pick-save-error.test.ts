import { describe, expect, it } from "vitest";
import { describePickSaveFailure } from "./pick-save-error";

const base = {
  kickoffUtcIso: "2026-10-03T09:00:00.000Z",
  lockUtcIso: "2026-10-03T08:55:00.000Z",
  timeZone: "Australia/Sydney",
};

describe("describePickSaveFailure", () => {
  it("keeps the pick for a retry when the request never arrived", () => {
    const failure = describePickSaveFailure({ ...base, status: null });
    expect(failure.kind).toBe("retry");
    expect(failure.message).toMatch(/connection/);
  });

  it("names the closing time, not the connection, when the server says locked", () => {
    const failure = describePickSaveFailure({
      ...base,
      status: 403,
      code: "locked",
    });
    expect(failure.kind).toBe("locked");
    expect(failure.message).toBe(
      "Too late, picks for this one closed Sat 3 Oct, 6:55pm.",
    );
    expect(failure.message).not.toMatch(/connection/);
  });

  it("treats a 403 without the locked code as a transient failure", () => {
    expect(describePickSaveFailure({ ...base, status: 403 }).kind).toBe(
      "retry",
    );
  });

  it("tells a signed-out player how to get back in", () => {
    expect(describePickSaveFailure({ ...base, status: 401 }).kind).toBe(
      "signed-out",
    );
  });

  it("marks a 400 as stale so the board refreshes", () => {
    expect(describePickSaveFailure({ ...base, status: 400 }).kind).toBe(
      "stale",
    );
  });

  it("falls back to a retry for server errors", () => {
    expect(describePickSaveFailure({ ...base, status: 500 }).kind).toBe(
      "retry",
    );
  });

  it("never uses gambling language", () => {
    for (const status of [null, 400, 401, 403, 500]) {
      const { message } = describePickSaveFailure({
        ...base,
        status,
        code: "locked",
      });
      expect(message).not.toMatch(/\b(bet|odds|wager|stake|payout|bookie)\b/i);
    }
  });
});
