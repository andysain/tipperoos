import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "./scrypt-secret";
import {
  matchCompetitionByCode,
  normalizeCompetitionCode,
  resolveCompetitionByCode,
} from "./competitions";

describe("normalizeCompetitionCode", () => {
  it("trims surrounding whitespace without altering interior length", () => {
    expect(normalizeCompetitionCode("forza").length).toBe(5);
    expect(normalizeCompetitionCode("  forza  ").length).toBe(5);
    expect(normalizeCompetitionCode("FORZA").length).toBe(5);
  });

  it("collapses empty/whitespace-only input to zero length", () => {
    expect(normalizeCompetitionCode("").length).toBe(0);
    expect(normalizeCompetitionCode("   ").length).toBe(0);
  });

  it("preserves length for a multi-word code", () => {
    expect(normalizeCompetitionCode("Test Cohort").length).toBe(11);
  });
});

describe("matchCompetitionByCode", () => {
  it("returns the id of the row whose code matches", async () => {
    const rows = [
      { id: "comp-a", codeHash: await hashSecret("forza") },
      { id: "comp-b", codeHash: await hashSecret("testcohort") },
    ];
    await expect(matchCompetitionByCode(rows, "testcohort")).resolves.toBe(
      "comp-b",
    );
  });

  it("is case-insensitive and tolerates surrounding whitespace, mirroring the hashed value's normalization", async () => {
    const rows = [{ id: "comp-a", codeHash: await hashSecret("forza") }];
    await expect(matchCompetitionByCode(rows, "  FORZA  ")).resolves.toBe(
      "comp-a",
    );
  });

  it("rejects an empty/whitespace-only submitted code without matching an empty-hashed row", async () => {
    const rows = [{ id: "comp-a", codeHash: await hashSecret("") }];
    await expect(matchCompetitionByCode(rows, "   ")).resolves.toBe(null);
  });

  it("returns null when no row matches", async () => {
    const rows = [{ id: "comp-a", codeHash: await hashSecret("forza") }];
    await expect(matchCompetitionByCode(rows, "wrong-code")).resolves.toBe(
      null,
    );
  });

  it("returns null for an empty row set", async () => {
    await expect(matchCompetitionByCode([], "anything")).resolves.toBe(null);
  });

  it("returns the first matching row's id when (hypothetically) more than one would match", async () => {
    const sharedHash = await hashSecret("dupe");
    const rows = [
      { id: "first", codeHash: sharedHash },
      { id: "second", codeHash: sharedHash },
    ];
    await expect(matchCompetitionByCode(rows, "dupe")).resolves.toBe("first");
  });

  it("safely fails closed on a malformed/placeholder code_hash instead of throwing", async () => {
    const rows = [{ id: "comp-a", codeHash: "placeholder-unset-abc123" }];
    await expect(matchCompetitionByCode(rows, "forza")).resolves.toBe(null);
  });
});

describe("resolveCompetitionByCode (warm-instance cache)", () => {
  function makeSupabaseMock(rows: { id: string; code_hash: string }[]) {
    const select = vi.fn().mockResolvedValue({ data: rows, error: null });
    const from = vi.fn().mockReturnValue({ select });
    return {
      mock: { from } as unknown as Parameters<
        typeof resolveCompetitionByCode
      >[0],
      from,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("only queries Supabase once for repeated lookups of the same code within the TTL", async () => {
    const codeHash = await hashSecret("cache-hit-code");
    const { mock, from } = makeSupabaseMock([
      { id: "comp-cache-hit", code_hash: codeHash },
    ]);

    await expect(
      resolveCompetitionByCode(mock, "cache-hit-code"),
    ).resolves.toBe("comp-cache-hit");
    await expect(
      resolveCompetitionByCode(mock, "cache-hit-code"),
    ).resolves.toBe("comp-cache-hit");

    expect(from).toHaveBeenCalledTimes(1);
  });

  it("re-queries Supabase once the cached entry's TTL has elapsed", async () => {
    const codeHash = await hashSecret("cache-expiry-code");
    const { mock, from } = makeSupabaseMock([
      { id: "comp-cache-expiry", code_hash: codeHash },
    ]);

    await expect(
      resolveCompetitionByCode(mock, "cache-expiry-code"),
    ).resolves.toBe("comp-cache-expiry");

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(
      resolveCompetitionByCode(mock, "cache-expiry-code"),
    ).resolves.toBe("comp-cache-expiry");

    expect(from).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed lookup", async () => {
    const { mock, from } = makeSupabaseMock([]);

    await expect(
      resolveCompetitionByCode(mock, "never-registered-code"),
    ).resolves.toBe(null);
    await expect(
      resolveCompetitionByCode(mock, "never-registered-code"),
    ).resolves.toBe(null);

    expect(from).toHaveBeenCalledTimes(2);
  });
});
