import { describe, expect, it, vi } from "vitest";

// Issue #174 item 2. `seasons.is_current` could be true on more than one row
// -- historically because the column defaults to `true`, so any season
// insert became current, and legitimately during a season rollover. The
// resolver's own comment always claimed `start_date desc` was the tiebreak
// for that case, but without .limit(1) a single-object request over two rows
// fails with PGRST116 instead of taking the first, which 500s every
// authenticated route.
//
// These tests assert the documented intent, so the resolver can't silently
// stop honouring it again.

interface Recorded {
  method: string;
  args: unknown[];
}

/**
 * Mock that mimics PostgREST's single-object behaviour: `.maybeSingle()`
 * errors when more than one row survives, and `.limit(n)` is what trims the
 * set. Without that fidelity the test would pass against the unfixed code.
 */
function createSeasonsMock(rows: { id: string; start_date: string }[]) {
  const calls: Recorded[] = [];
  let data = [...rows];

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      calls.push({ method: "order", args: [col, opts] });
      const dir = opts?.ascending === false ? -1 : 1;
      data = [...data].sort((a, b) =>
        a.start_date < b.start_date
          ? -dir
          : a.start_date > b.start_date
            ? dir
            : 0,
      );
      return builder;
    },
    limit: (n: number) => {
      calls.push({ method: "limit", args: [n] });
      data = data.slice(0, n);
      return builder;
    },
    maybeSingle: async () => {
      if (data.length > 1) {
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: `Results contain ${data.length} rows, application/vnd.pgrst.object+json requires 1 row`,
            hint: null,
          },
        };
      }
      return { data: data[0] ?? null, error: null };
    },
  };

  return { client: { from: vi.fn(() => builder) } as never, calls };
}

const { getCurrentSeasonId } = await import("./gameweek-access");

describe("getCurrentSeasonId", () => {
  it("returns the only current season", async () => {
    const { client } = createSeasonsMock([
      { id: "season-2026", start_date: "2026-08-01" },
    ]);
    expect(await getCurrentSeasonId(client)).toBe("season-2026");
  });

  it("returns the most recently started season when two are flagged current, instead of throwing", async () => {
    // The staging failure: a synthetic season inserted alongside the real
    // one, both current. Before .limit(1) this threw PGRST116.
    const { client } = createSeasonsMock([
      { id: "season-2026", start_date: "2026-08-01" },
      { id: "season-sim", start_date: "2026-08-17" },
    ]);
    expect(await getCurrentSeasonId(client)).toBe("season-sim");
  });

  it("still applies start_date desc rather than trusting arbitrary row order", async () => {
    // Same two rows handed back in the opposite order: the answer must not
    // change, which is what proves the ordering does the choosing.
    const { client } = createSeasonsMock([
      { id: "season-sim", start_date: "2026-08-17" },
      { id: "season-2026", start_date: "2026-08-01" },
    ]);
    expect(await getCurrentSeasonId(client)).toBe("season-sim");
  });

  it("returns null when no season is current, rather than erroring", async () => {
    const { client } = createSeasonsMock([]);
    expect(await getCurrentSeasonId(client)).toBeNull();
  });

  it("asks the database for one row, ordered, so the tiebreak is enforced server-side", async () => {
    const { client, calls } = createSeasonsMock([
      { id: "season-2026", start_date: "2026-08-01" },
    ]);
    await getCurrentSeasonId(client);
    expect(calls.some((c) => c.method === "order")).toBe(true);
    expect(calls.some((c) => c.method === "limit" && c.args[0] === 1)).toBe(
      true,
    );
  });
});
