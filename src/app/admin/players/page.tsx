import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin-access";
import { loadAdminRoster } from "@/app/_lib/admin-roster-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";
import { RosterTable, type RosterFilter } from "@/components/admin/RosterTable";
import { FOCUS, LABEL, T, TX } from "@/components/ui/tokens";

// Gated the same way as /admin (docs/admin-ui-spec.md §4): a non-admin or
// logged-out request gets notFound() -- 404, not 403, not a login redirect.
export const dynamic = "force-dynamic";

// The Overview links here with `?filter=not-tipped` (from the Snapshot
// card) and `?filter=needs-attention` (from the health strip's locked-out
// row). Both resolve to a starting chip.
const FILTER_PARAM: Record<string, RosterFilter> = {
  "needs-attention": "attention",
  attention: "attention",
  "not-tipped": "not-tipped",
  humans: "humans",
  bots: "bots",
  all: "all",
};

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const { filter } = await searchParams;
  const initialFilter = FILTER_PARAM[filter ?? ""] ?? "all";

  const cookieStore = await cookies();
  const timeZone =
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;

  const supabase = createServerSupabaseClient();
  const roster = await loadAdminRoster(
    supabase,
    admin.competitionId,
    new Date(),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-paper p-4 pb-10 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <Link
          href={{ pathname: "/admin" }}
          className={`self-start ${T.caption} ${TX.muted} ${FOCUS}`}
        >
          ← Overview
        </Link>
        <p className={`${LABEL} ${TX.muted}`}>Competition admin</p>
        <h1 className={`${T.h1} font-extrabold ${TX.base}`}>
          Players &amp; access
        </h1>
      </header>

      <RosterTable
        players={roster.players}
        tippedMatchCount={roster.currentGameweekTippedMatchCount}
        timeZone={timeZone}
        initialFilter={initialFilter}
      />
    </main>
  );
}
