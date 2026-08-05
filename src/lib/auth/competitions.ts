import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifySecret } from "./scrypt-secret";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Case-insensitive, whitespace-tolerant (copy/paste from a text/email),
 * applied identically before hashing (scripts/set-competition-code.mjs) and
 * before verifying (matchCompetitionByCode) so the two stay in agreement.
 */
export function normalizeCompetitionCode(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * Pure matching logic against an already-fetched row set -- golden-value
 * testable with a fixed set of {id, codeHash} rows and known plaintext
 * codes, same pattern as scrypt-secret.ts's exported deriveKeyHex.
 *
 * Sequential, short-circuits on first match: the competitions table is
 * always tiny (a handful of rows at most), so per-row timing variance from
 * an early exit isn't a meaningful risk at this scale ("this is not a
 * bank" -- CLAUDE.md).
 */
export async function matchCompetitionByCode(
  rows: { id: string; codeHash: string }[],
  submittedCode: string,
): Promise<string | null> {
  const normalized = normalizeCompetitionCode(submittedCode);
  if (!normalized) return null;
  for (const row of rows) {
    if (await verifySecret(normalized, row.codeHash)) {
      return row.id;
    }
  }
  return null;
}

/**
 * Thin Supabase-fetching wrapper -- no elaborate test needed, mirrors
 * session-cookie.ts's rationale: the logic it wraps (matchCompetitionByCode)
 * already has its own golden-value tests.
 */
export async function resolveCompetitionByCode(
  supabase: SupabaseClient,
  submittedCode: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id, code_hash");
  if (error) throw error;
  return matchCompetitionByCode(
    (data ?? []).map((row) => ({ id: row.id, codeHash: row.code_hash })),
    submittedCode,
  );
}
