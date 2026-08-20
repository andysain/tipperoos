// PROTOTYPE roster. The season's matches, picks and scores all come from
// season.ts's single generator -- this file is only the people.

export interface ProtoPlayer {
  id: string;
  name: string;
  emoji: string;
  isBot: boolean;
  isLateJoiner?: boolean;
}

// Roster order feeds the pick generator, so it decides where everyone lands.
// The viewer sits deliberately MID-TABLE rather than first: a summary whose
// job is "where does that leave me" can't be judged by someone with nobody
// above them, and neither can a chase. Same discipline as ADR 0012's own
// fixture, which put its Late Joiner top of the board because that was the
// case its rule had to survive.
export const PLAYERS: ProtoPlayer[] = [
  { id: "sam", name: "Sam", emoji: "🐢", isBot: false },
  { id: "ellie", name: "Ellie", emoji: "🦄", isBot: false },
  { id: "tom", name: "Tom", emoji: "🐙", isBot: false },
  { id: "maya", name: "Maya", emoji: "🐝", isBot: false },
  { id: "andy", name: "Andy", emoji: "🦊", isBot: false },
  { id: "jack", name: "Jack", emoji: "🦖", isBot: false },
  { id: "priya", name: "Priya", emoji: "🐳", isBot: false },
  { id: "ben", name: "Ben", emoji: "🦁", isBot: false },
  { id: "nina", name: "Nina", emoji: "🐧", isBot: false },
  { id: "ollie", name: "Ollie", emoji: "🦋", isBot: false },
  { id: "grace", name: "Grace", emoji: "🐴", isBot: false },
  { id: "finn", name: "Finn", emoji: "🦉", isBot: false },
  { id: "zoe", name: "Zoe", emoji: "🐼", isBot: false, isLateJoiner: true },
  { id: "bot-random", name: "Random Bot", emoji: "🤖", isBot: true },
  { id: "bot-oneone", name: "1-1 Bot", emoji: "🤖", isBot: true },
  { id: "bot-median", name: "Median Bot", emoji: "🤖", isBot: true },
];

export const SIGNED_IN = "andy";
export const MEDIAN_BOT = "bot-median";
export const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));

export interface ProtoPick {
  playerId: string;
  home: number | null;
  away: number | null;
}

export interface ProtoMatch {
  id: string;
  gameweek: number;
  home: { name: string; shortCode: string; position: number };
  away: { name: string; shortCode: string; position: number };
  kickoffLabel: string;
  provenance: "Top Matchup" | "Random Pick";
  /** Voided = postponed AFTER lock. A Skipped Slot is the absence of a
   *  second match, not a state on one (CONTEXT.md keeps these distinct). */
  kind: "played" | "voided";
  /** Carried explicitly. Never inferred from `result === null`, which
   *  conflates "kicked off, no result yet" with "not locked, nobody may see
   *  this" -- the conflation that leaks a pre-lock pick (ADR 0013 D10). */
  locked: boolean;
  result: { home: number; away: number } | null;
  picks: ProtoPick[];
  audit?: { at: string; from: string; to: string };
}
