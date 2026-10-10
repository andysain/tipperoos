import { describe, expect, it } from "vitest";
import { LIVE_STANDINGS_STALE_MS } from "@/lib/gameweeks/select-next";
import { staleStandingsNote } from "./standings-note";

const updated = new Date("2026-08-24T10:00:00Z"); // a Monday

describe("staleStandingsNote", () => {
  it("says nothing while the standings are fresh, up to the 48h line", () => {
    const atLine = new Date(updated.getTime() + LIVE_STANDINGS_STALE_MS);
    expect(staleStandingsNote(atLine, updated, "Australia/Sydney")).toBe(null);
  });

  it("names the date once they're stale, in the viewer's timezone", () => {
    const later = new Date(updated.getTime() + LIVE_STANDINGS_STALE_MS + 1);
    expect(staleStandingsNote(later, updated, "Australia/Sydney")).toBe(
      "Mon 24 Aug",
    );
    // 20:00 UTC is already Tuesday in Sydney but still Monday in LA: the
    // date must follow the viewer's zone, not the server's.
    const evening = new Date("2026-08-24T20:00:00Z");
    const after = new Date(evening.getTime() + LIVE_STANDINGS_STALE_MS + 1);
    expect(staleStandingsNote(after, evening, "Australia/Sydney")).toBe(
      "Tue 25 Aug",
    );
    expect(staleStandingsNote(after, evening, "America/Los_Angeles")).toBe(
      "Mon 24 Aug",
    );
  });

  it("says nothing without DB time or standings", () => {
    expect(staleStandingsNote(null, updated, "Australia/Sydney")).toBe(null);
    expect(staleStandingsNote(new Date(), null, "Australia/Sydney")).toBe(null);
  });
});
