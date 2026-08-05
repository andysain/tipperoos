import { describe, expect, it } from "vitest";
import { hashSecret } from "./scrypt-secret";
import { matchCompetitionByCode } from "./competitions";

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
