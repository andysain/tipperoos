import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Backs the login screen's "pick your display name from a list" UX
// (CLAUDE.md -> Identity and auth). No auth required -- this list is what
// makes login possible in the first place. Bots are excluded: nobody logs
// in as one.
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: players, error } = await supabase
    .from("players")
    .select("display_name, emoji")
    .eq("is_bot", false)
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Could not load players." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    players: players.map((player) => ({
      displayName: player.display_name,
      emoji: player.emoji,
    })),
  });
}
