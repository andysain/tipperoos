import { describe, expect, it } from "vitest";
import { formatCountdown, formatKickoffInTimeZone } from "./kickoff-format";

// Golden values hand-derived per docs/adr/0007-home-surface-and-pick-entry.md
// ("Sun 12:00am (Sat night)" is the ADR's own literal example) and verified
// against Intl.DateTimeFormat's real IANA tzdata output before being pinned
// here -- see issue #87's decision log for how each instant was chosen.
describe("formatKickoffInTimeZone", () => {
  it("spells out the overnight case: UK Saturday afternoon is Sydney's small hours of Sunday", () => {
    expect(
      formatKickoffInTimeZone("2026-09-12T14:00:00Z", "Australia/Sydney"),
    ).toBe("Sun 12:00am (Sat night)");
  });

  it("renders a plain daytime kickoff without the overnight parenthetical", () => {
    expect(
      formatKickoffInTimeZone("2026-09-12T18:30:00Z", "America/New_York"),
    ).toBe("Sat 2:30pm");
  });

  it("is correct on both sides of the UK BST->GMT transition (2026-10-25)", () => {
    expect(
      formatKickoffInTimeZone("2026-10-24T15:00:00Z", "Europe/London"),
    ).toBe("Sat 4:00pm");
    expect(
      formatKickoffInTimeZone("2026-10-26T15:00:00Z", "Europe/London"),
    ).toBe("Mon 3:00pm");
  });

  it("is correct on both sides of the Sydney AEST->AEDT transition (2026-10-04), including the overnight case it produces", () => {
    expect(
      formatKickoffInTimeZone("2026-10-03T15:00:00Z", "Australia/Sydney"),
    ).toBe("Sun 1:00am (Sat night)");
    expect(
      formatKickoffInTimeZone("2026-10-04T15:00:00Z", "Australia/Sydney"),
    ).toBe("Mon 2:00am (Sun night)");
  });

  it("takes timeZone as a real parameter, not a hardcoded Sydney assumption (#93)", () => {
    const kickoff = "2026-09-12T18:30:00Z";
    expect(formatKickoffInTimeZone(kickoff, "America/New_York")).toBe(
      "Sat 2:30pm",
    );
    expect(formatKickoffInTimeZone(kickoff, "Australia/Sydney")).toBe(
      "Sun 4:30am (Sat night)",
    );
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-09-01T00:00:00Z").getTime();

  it("coarsens to days+hours when more than a day out", () => {
    expect(
      formatCountdown(
        new Date(now + 2 * 86_400_000 + 4 * 3_600_000).toISOString(),
        now,
      ),
    ).toBe("2d 4h");
  });

  it("coarsens to hours+minutes inside a day but past the last hour", () => {
    expect(
      formatCountdown(
        new Date(now + 3 * 3_600_000 + 12 * 60_000).toISOString(),
        now,
      ),
    ).toBe("3h 12m");
  });

  it("is explicit down to the minute inside the last hour", () => {
    expect(
      formatCountdown(new Date(now + 42 * 60_000).toISOString(), now),
    ).toBe("42m");
  });

  it("never goes negative for a target already in the past", () => {
    expect(formatCountdown(new Date(now - 5 * 60_000).toISOString(), now)).toBe(
      "0m",
    );
  });

  it("crosses a day boundary correctly at exactly 24h", () => {
    expect(
      formatCountdown(new Date(now + 24 * 3_600_000).toISOString(), now),
    ).toBe("1d 0h");
  });
});
