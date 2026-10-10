import { describe, expect, it } from "vitest";
import { tabForPath } from "./tabs";

describe("tabForPath", () => {
  it("highlights each tab on its own page", () => {
    expect(tabForPath("/")).toBe("/");
    expect(tabForPath("/leaderboard")).toBe("/leaderboard");
    expect(tabForPath("/predict-table")).toBe("/predict-table");
  });

  it("highlights the tab a detail page is reached from", () => {
    expect(tabForPath("/gameweek/7")).toBe("/");
    expect(tabForPath("/picks/p-123")).toBe("/leaderboard");
    // The Predict the Table comparison is reached from a leaderboard row,
    // not the Predict the Table tab (issue #214).
    expect(tabForPath("/predict-table/p-123")).toBe("/leaderboard");
  });

  it("highlights nothing outside the three tabs", () => {
    expect(tabForPath("/how-it-works")).toBe(null);
    expect(tabForPath("/admin")).toBe(null);
    expect(tabForPath("/admin/players")).toBe(null);
    expect(tabForPath("/login")).toBe(null);
  });

  it("doesn't match a route that merely shares a prefix", () => {
    expect(tabForPath("/leaderboards")).toBe(null);
    expect(tabForPath("/predict-tables")).toBe(null);
  });
});
