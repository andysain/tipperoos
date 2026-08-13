export interface Player {
  displayName: string;
  emoji: string | null;
}

export type FetchPlayersResult =
  | { status: "ok"; players: Player[] }
  | { status: "invalid-code" }
  | { status: "error" };

// Keep network failures and transient server errors distinct from an invalid code.
export async function fetchPlayers(code: string): Promise<FetchPlayersResult> {
  try {
    const response = await fetch("/api/auth/players", {
      headers: { "x-competition-code": code },
    });
    if (response.status === 403) return { status: "invalid-code" };
    if (!response.ok) return { status: "error" };
    const data = await response.json();
    return { status: "ok", players: data.players };
  } catch {
    return { status: "error" };
  }
}
