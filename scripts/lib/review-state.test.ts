import { describe, expect, it } from "vitest";
import { resolveRunOutcome } from "./review-state.mjs";

const HEAD_BEFORE = "aaaaaaa1111111111111111111111111111111111";
const HEAD_NOW = "bbbbbbb2222222222222222222222222222222222";

function outcome(over: Partial<Record<string, unknown>> = {}) {
  return resolveRunOutcome({
    blocked: false,
    fixed: false,
    laneFailed: false,
    headBeforeFixes: HEAD_BEFORE,
    headNow: HEAD_NOW,
    ...over,
  });
}

describe("resolveRunOutcome", () => {
  it("records HEAD and allows the push when every lane came back clean", () => {
    expect(outcome()).toEqual({
      push: "allow",
      record: HEAD_NOW,
      reason: "clean",
    });
  });

  it("records the pre-fix SHA when a lane committed a fix", () => {
    // The point of the whole module: the next push reviews only the fix
    // commit, not the branch again.
    expect(outcome({ fixed: true })).toEqual({
      push: "abort",
      record: HEAD_BEFORE,
      reason: "fixed",
    });
  });

  it("aborts the push on a fix even though it records progress", () => {
    expect(outcome({ fixed: true }).push).toBe("abort");
  });

  it("records nothing when a lane blocked, so the next push re-reviews it all", () => {
    expect(outcome({ blocked: true })).toEqual({
      push: "abort",
      record: null,
      reason: "blocked",
    });
  });

  it("lets a block outrank a fix from another lane in the same run", () => {
    expect(outcome({ blocked: true, fixed: true }).record).toBe(null);
  });

  it("records nothing when a lane's invocation failed, but still allows the push", () => {
    expect(outcome({ laneFailed: true })).toEqual({
      push: "allow",
      record: null,
      reason: "lane-failed",
    });
  });

  it("declines to record a fix point when a lane never ran", () => {
    // Half the lanes reviewed `headBeforeFixes`; calling it reviewed would
    // skip whatever the failed lane would have caught.
    expect(outcome({ fixed: true, laneFailed: true }).record).toBe(null);
  });

  it("never records a SHA other than the two it was handed", () => {
    for (const over of [
      {},
      { fixed: true },
      { blocked: true },
      { laneFailed: true },
    ]) {
      const { record } = outcome(over);
      expect(record === null || [HEAD_BEFORE, HEAD_NOW].includes(record)).toBe(
        true,
      );
    }
  });
});
