import { NextResponse } from "next/server";
import { verifyCompetitionCode } from "@/lib/auth/signup-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Backs the login screen's "pick your display name from a list" UX
// (CLAUDE.md -> Identity and auth). Gated behind the competition code
// (x-competition-code header) -- the roster is meant to be private to
// people who know the code, not a fully public endpoint. Bots are
// excluded: nobody logs in as one.
export async function GET(request: Request) {
  const submittedCode = request.headers.get("x-competition-code") ?? "";
  const expectedCode = process.env.COMPETITION_CODE;

  if (!expectedCode || !verifyCompetitionCode(submittedCode, expectedCode)) {
    return NextResponse.json(
      { error: "Invalid competition code." },
      { status: 403 },
    );
  }

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
