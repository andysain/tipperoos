import { createServerSupabaseClient } from "@/lib/supabase/server";

// Proves live connectivity on every request rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createServerSupabaseClient();
  const { data: season, error } = await supabase
    .from("seasons")
    .select("label, start_date, is_current")
    .eq("is_current", true)
    .single();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-8 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Tipperoos
      </h1>
      {error ? (
        <p className="text-red-600 dark:text-red-400">
          Supabase connection failed: {error.message}
        </p>
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">
          Connected. Current season: <strong>{season.label}</strong>, starts{" "}
          {season.start_date}.
        </p>
      )}
    </div>
  );
}
