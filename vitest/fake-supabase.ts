import type { SupabaseClient } from "@supabase/supabase-js";

// An in-memory stand-in for the PostgREST builder, for tests that drive real
// Supabase query code (shared by the Predict the Table cohort, recompute and
// leaderboard tests). It persists upserts, so a repeat call in the same test
// sees them.
//
// It understands the embedded selects this codebase uses -- a resource named
// in the select string is attached to each row the way PostgREST would:
//   players!inner(...)          -> row.players = the players row (player_id)
//   table_prediction_ranks(...) -> row.table_prediction_ranks = its ranks
//   seasons!inner(...)          -> row.seasons = the seasons row (season_id)
// and dotted filters on them (`.eq("players.competition_id", id)`), which
// drop a parent row whose embedded resource doesn't match -- `!inner`
// semantics. Column lists are otherwise ignored: rows come back whole.

export interface Row {
  [key: string]: unknown;
}

function readPath(row: Row, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object" ? (value as Row)[key] : undefined,
      row,
    );
}

interface Filterable {
  eq: (col: string, val: unknown) => Filterable;
  in: (col: string, vals: readonly unknown[]) => Filterable;
  order: (col: string, options?: { ascending?: boolean }) => Filterable;
  limit: (n: number) => Filterable;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (resolve: (result: { data: Row[]; error: null }) => void) => void;
}

function filterable(rows: Row[]): Filterable {
  return {
    eq: (col, val) => filterable(rows.filter((r) => readPath(r, col) === val)),
    in: (col, vals) =>
      filterable(rows.filter((r) => vals.includes(readPath(r, col)))),
    order: (col, options) => {
      const direction = options?.ascending === false ? -1 : 1;
      return filterable(
        [...rows].sort((a, b) => {
          const x = readPath(a, col) as string | number;
          const y = readPath(b, col) as string | number;
          return x < y ? -direction : x > y ? direction : 0;
        }),
      );
    },
    limit: (n) => filterable(rows.slice(0, n)),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve) => resolve({ data: rows, error: null }),
  };
}

export function fakeSupabase(seed: Record<string, Row[]>): {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
} {
  // Any table not seeded reads as empty -- including one a test inspects
  // for writes that never happened.
  const tables = new Proxy<Record<string, Row[]>>(
    { ...seed },
    {
      get: (target, name: string) => (target[name] ??= []),
    },
  );
  const table = (name: string) => tables[name];

  function embed(name: string, cols: string): Row[] {
    return table(name).map((row) => {
      const out: Row = { ...row };
      if (cols.includes("players!inner(")) {
        out.players =
          table("players").find((p) => p.id === row.player_id) ?? null;
      }
      if (cols.includes("table_prediction_ranks(")) {
        out.table_prediction_ranks = table("table_prediction_ranks").filter(
          (r) => r.table_prediction_id === row.id,
        );
      }
      if (cols.includes("seasons!inner(")) {
        out.seasons =
          table("seasons").find((s) => s.id === row.season_id) ?? null;
      }
      return out;
    });
  }

  const client = {
    from: (name: string) => ({
      select: (cols: string) => filterable(embed(name, cols)),
      upsert: (rows: Row[], _options: { onConflict: string }) => {
        for (const row of rows) {
          const index = table(name).findIndex(
            (r) => r.player_id === row.player_id,
          );
          if (index >= 0) table(name)[index] = { ...row };
          else table(name).push({ ...row });
        }
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;

  return { client, tables };
}
