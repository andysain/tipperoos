import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin-access";
import { loadAdminIndexCounts } from "@/app/_lib/admin-index-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CARD_SHADOW, LABEL, T, TX } from "@/components/ui/tokens";

// Gated behind requireAdmin(): a non-admin session and a logged-out visitor
// both get notFound() -- 404, not 403, not a login redirect (spec §4 rule 1,
// "the surface should not announce itself"). This is a deliberate divergence
// from every other authed page, which redirects to /login.
export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-card border border-paper-line bg-white p-4 ${CARD_SHADOW}`}
    >
      <p className={`${LABEL} ${TX.muted}`}>{label}</p>
      <p className={`${T.score} font-extrabold ${TX.base}`}>{value}</p>
      {detail ? <p className={`${T.caption} ${TX.muted}`}>{detail}</p> : null}
    </div>
  );
}

export default async function AdminIndexPage() {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const counts = await loadAdminIndexCounts(supabase, admin.competitionId);

  const { submitted, skipped, outstanding } = counts.tablePredictions;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-paper p-4 pb-10 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <p className={`${LABEL} ${TX.muted}`}>Competition admin</p>
        <h1 className={`${T.h1} font-extrabold ${TX.base}`}>Overview</h1>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Players"
          value={String(counts.playersTotal)}
          detail={`${counts.botsTotal} ${counts.botsTotal === 1 ? "bot" : "bots"}`}
        />
        <StatCard
          label="Current gameweek"
          value={
            counts.currentGameweek === null
              ? "None yet"
              : String(counts.currentGameweek)
          }
        />
        <div
          className={`flex flex-col gap-3 rounded-card border border-paper-line bg-white p-4 sm:col-span-2 ${CARD_SHADOW}`}
        >
          <p className={`${LABEL} ${TX.muted}`}>Predict the Table</p>
          <dl className="grid grid-cols-3 gap-3">
            {[
              { term: "Submitted", value: submitted },
              { term: "Skipped", value: skipped },
              { term: "Outstanding", value: outstanding },
            ].map(({ term, value }) => (
              <div key={term} className="flex flex-col gap-1">
                <dt className={`${T.caption} ${TX.muted}`}>{term}</dt>
                <dd className={`${T.score} font-extrabold ${TX.base}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
