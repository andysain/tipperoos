import "server-only";
import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { requireAdmin, type AdminContext } from "@/app/_lib/admin-access";

// Shared preamble + write-settling for every mutating `/api/admin/*` route
// (docs/admin-ui-spec.md §4). Kept in one place so the 404-vs-403 ordering
// and the "row absence is a bodyless 404" contract can't drift between the
// two routes here — or the Edit-details / Grant-admin / Disable routes to
// come (spec §6.2).

/**
 * A bodyless 404. `/admin` and `/api/admin/*` must not announce themselves to
 * a curious player (spec §4 rules 1-2), so a non-admin — or a target the
 * admin isn't allowed to see — gets a 404 with no body, never a 403.
 * `notFound()` is RSC-only and doesn't work in a route handler.
 */
export function adminNotFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` is a syntactically valid UUID. `players.id` is a uuid
 * column, so a request-body value that isn't one can't name a real player —
 * callers treat a failure as "no such player" (`adminNotFound`), which also
 * keeps a malformed id from reaching PostgREST and coming back as a 500
 * instead of the spec's 404.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

type Rejected = { ok: false; response: NextResponse };

/**
 * The two gates every mutating admin route shares, in this order:
 *
 *   1. `requireAdmin()` → bodyless 404 on failure. **Before** the CSRF check,
 *      so a non-admin probing the endpoint gets a 404, not a 403 that
 *      confirms it exists (spec §4 rule 2). Deliberate divergence from
 *      `/api/picks` (CSRF-first) — that route isn't a hidden surface.
 *   2. `hasCsrfHeader()` → 403 on failure, exactly as `/api/picks` (§4 rule 4).
 */
export async function guardAdminMutation(
  request: Request,
): Promise<{ ok: true; admin: AdminContext } | Rejected> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, response: adminNotFound() };

  if (!hasCsrfHeader(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { ok: true, admin };
}

/**
 * `guardAdminMutation` plus the JSON body parse (→ 400 on non-JSON). The
 * body is returned untyped-checked as `T`; the route validates its fields.
 */
export async function readAdminRequest<T>(
  request: Request,
): Promise<{ ok: true; admin: AdminContext; body: T } | Rejected> {
  const gate = await guardAdminMutation(request);
  if (!gate.ok) return gate;

  let body: T;
  try {
    body = (await request.json()) as T;
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be JSON." },
        { status: 400 },
      ),
    };
  }

  return { ok: true, admin: gate.admin, body };
}

/**
 * Maps a competition-scoped single-row `.update(...).maybeSingle()` result to
 * the shared admin-route contract:
 *   - a query error → 500 with `{ error: errorMessage }`
 *   - no row matched (wrong competition, no such player, a bot — all
 *     indistinguishable per §4 rule 3) → bodyless 404
 *   - success → `null`, and the caller returns `{ ok: true }`
 */
export function settlePlayerUpdate(
  result: { data: unknown; error: unknown },
  errorMessage: string,
): NextResponse | null {
  if (result.error) {
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
  if (!result.data) return adminNotFound();
  return null;
}
