import { describe, expect, it } from "vitest";
import { displayName, shortName } from "./team-names.mjs";

describe("team name fields", () => {
  it.each([
    ["Manchester City FC", "Manchester City", "Man City"],
    ["AFC Bournemouth", "Bournemouth", "Bournemouth"],
    ["Brighton & Hove Albion FC", "Brighton & Hove Albion", "Brighton"],
    ["Coventry City", "Coventry City", "Coventry"],
    ["Leeds United FC", "Leeds United", "Leeds"],
    ["Ipswich Town", "Ipswich Town", "Ipswich"],
    ["Tottenham Hotspur FC", "Tottenham Hotspur", "Tottenham"],
    ["Newcastle United FC", "Newcastle United", "Newcastle"],
  ])("shortens %s", (full, name, common) => {
    expect(shortName(full)).toBe(name);
    expect(displayName(name)).toBe(common);
  });
});
