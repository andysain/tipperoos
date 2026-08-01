"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PinInput } from "@/components/ui/PinInput";
import { TextField } from "@/components/ui/TextField";

const STORED_CODE_KEY = "tipperoos.competitionCode";

const EMOJI_OPTIONS = [
  "⚽",
  "🏆",
  "🔥",
  "🌟",
  "🦁",
  "🐯",
  "🐶",
  "🐱",
  "🎉",
  "🍕",
];

interface Player {
  displayName: string;
  emoji: string | null;
}

type Step = "checking" | "code" | "list" | "pin" | "join" | "success";

interface SuccessState {
  kind: "login" | "join";
  displayName: string;
  emoji: string | null;
  pinResetRequired?: boolean;
}

function formatSydneyTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export type FetchPlayersResult =
  | { status: "ok"; players: Player[] }
  | { status: "invalid-code" }
  | { status: "error" };

// Never rejects -- every failure mode (network failure, a non-JSON body, a
// transient 5xx, an actually-invalid/rotated code) resolves to a specific
// FetchPlayersResult instead. Centralized here rather than relying on every
// call site to remember try/catch: an earlier version left this rejecting
// on network failure, which the mount-time silent-replay call site (below)
// didn't catch -- the user was stuck on the initial loading screen forever.
// It also used to return `null` for any non-ok response, which conflated a
// genuinely invalid/rotated code (403) with a transient server error (5xx),
// wiping a still-valid stored code from localStorage on a mere blip.
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

function LoginFlow() {
  const searchParams = useSearchParams();
  const wantsJoin = searchParams.get("intent") === "join";

  // Always starts at "checking" on both server and client. localStorage
  // doesn't exist during SSR, so branching on it inside this initializer
  // (as an earlier version did) makes the server and the client's first
  // render pass disagree -- a real hydration mismatch, not just a lint
  // nit. The effect below (client-only, runs after hydration) is the only
  // place that's allowed to read it.
  const [step, setStep] = useState<Step>("checking");
  const [competitionCode, setCompetitionCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSubmitting, setCodeSubmitting] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Player | null>(null);

  const [pinResetKey, setPinResetKey] = useState(0);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const [joinDisplayName, setJoinDisplayName] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [joinPinResetKey, setJoinPinResetKey] = useState(0);
  const [joinEmail, setJoinEmail] = useState("");
  const [joinEmoji, setJoinEmoji] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);

  const [success, setSuccess] = useState<SuccessState | null>(null);

  // On mount, silently replay a previously-verified code (if any) so a
  // returning player on the same device isn't asked for it again. Falls
  // back to the code step if it's missing or no longer accepted (e.g. the
  // competition code was rotated).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORED_CODE_KEY);
    if (!stored) {
      // Legitimate synchronous setState: this is the "sync React state from
      // a browser-only API unavailable at SSR time" case, not the general
      // pattern react-hooks/set-state-in-effect warns about.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("code");
      return;
    }

    fetchPlayers(stored).then((result) => {
      if (result.status === "ok") {
        setCompetitionCode(stored);
        setPlayers(result.players);
        setStep(wantsJoin ? "join" : "list");
      } else if (result.status === "invalid-code") {
        window.localStorage.removeItem(STORED_CODE_KEY);
        setStep("code");
      } else {
        // Transient failure, not necessarily an invalid code -- don't evict
        // a code that might still be valid.
        setCodeError(
          "Couldn't reach Tipperoos. Check your connection and try again.",
        );
        setStep("code");
      }
    });
  }, [wantsJoin]);

  async function handleCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setCodeError(null);
    const trimmed = codeInput.trim();
    if (!trimmed) {
      setCodeError("Enter the competition code.");
      return;
    }

    setCodeSubmitting(true);
    try {
      const result = await fetchPlayers(trimmed);
      if (result.status === "invalid-code") {
        setCodeError("That code doesn't look right.");
        return;
      }
      if (result.status === "error") {
        setCodeError(
          "Couldn't reach Tipperoos. Check your connection and try again.",
        );
        return;
      }
      window.localStorage.setItem(STORED_CODE_KEY, trimmed);
      setCompetitionCode(trimmed);
      setPlayers(result.players);
      setStep(wantsJoin ? "join" : "list");
    } finally {
      setCodeSubmitting(false);
    }
  }

  async function handlePinComplete(pin: string) {
    if (!selected) return;
    setPinError(null);
    setPinSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tipperoos-client": "1",
        },
        body: JSON.stringify({ displayName: selected.displayName, pin }),
      });
      const data = await response.json();

      if (response.status === 423) {
        setPinError(
          `Too many tries — take a short break and try again at ${formatSydneyTime(data.lockedUntil)}.`,
        );
        setPinResetKey((k) => k + 1);
        return;
      }
      if (!response.ok) {
        const remaining = data.attemptsRemaining;
        setPinError(
          typeof remaining === "number"
            ? `That PIN didn't match. ${remaining} more ${remaining === 1 ? "try" : "tries"} before a short break.`
            : "That PIN didn't match. Try again.",
        );
        setPinResetKey((k) => k + 1);
        return;
      }

      setSuccess({
        kind: "login",
        displayName: data.displayName,
        emoji: data.emoji,
        pinResetRequired: data.pinResetRequired,
      });
      setStep("success");
    } catch {
      setPinError(
        "Couldn't reach Tipperoos. Check your connection and try again.",
      );
      setPinResetKey((k) => k + 1);
    } finally {
      setPinSubmitting(false);
    }
  }

  async function handleJoinSubmit(event: React.FormEvent) {
    event.preventDefault();
    setJoinError(null);

    if (!joinDisplayName.trim()) {
      setJoinError("Pick a display name first.");
      return;
    }
    if (joinPin.length !== 4) {
      setJoinError("Your PIN needs to be 4 digits.");
      return;
    }

    setJoinSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tipperoos-client": "1",
        },
        body: JSON.stringify({
          competitionCode,
          displayName: joinDisplayName,
          pin: joinPin,
          email: joinEmail.trim() || undefined,
          emoji: joinEmoji ?? undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setJoinError(data.error ?? "Something went wrong — try again.");
        setJoinPin("");
        setJoinPinResetKey((k) => k + 1);
        return;
      }

      setSuccess({
        kind: "join",
        displayName: data.displayName,
        emoji: data.emoji,
      });
      setStep("success");
    } catch {
      setJoinError(
        "Couldn't reach Tipperoos. Check your connection and try again.",
      );
    } finally {
      setJoinSubmitting(false);
    }
  }

  function goToList() {
    setSelected(null);
    setPinError(null);
    setJoinError(null);
    setStep("list");
  }

  if (step === "checking") {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-ink/60">Loading…</p>
      </main>
    );
  }

  if (step === "success" && success) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <Card className="w-full max-w-sm text-center">
          <div className="mb-2 text-5xl">{success.emoji ?? "⚽"}</div>
          <h1 className="text-[1.9rem] font-extrabold text-ink">
            {success.kind === "join"
              ? `You're in, ${success.displayName}!`
              : `Welcome back, ${success.displayName}!`}
          </h1>
          {success.pinResetRequired ? (
            <p className="mt-2 text-warning">
              You&apos;ll need to set a new PIN before you can keep going.
            </p>
          ) : (
            <p className="mt-2 text-ink/70">
              {success.kind === "join"
                ? "You're all set and logged in — the pitch is waiting."
                : "You're logged in."}
            </p>
          )}
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm">
        {step === "code" ? (
          <>
            <h1 className="text-[1.9rem] font-extrabold text-ink">
              Welcome to Tipperoos
            </h1>
            <p className="mt-1 mb-6 text-ink/70">
              Enter your competition code to get started.
            </p>
            <form onSubmit={handleCodeSubmit} className="flex flex-col gap-5">
              <TextField
                label="Competition code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                error={codeError ?? undefined}
                autoComplete="off"
                autoFocus
              />
              <Button type="submit" fullWidth disabled={codeSubmitting}>
                {codeSubmitting ? "Checking…" : "Continue"}
              </Button>
            </form>
          </>
        ) : null}

        {step === "list" ? (
          <>
            <h1 className="text-[1.9rem] font-extrabold text-ink">
              Who&apos;s playing?
            </h1>
            <p className="mt-1 mb-6 text-ink/70">Pick your name to log in.</p>

            {players.length === 0 ? (
              <p className="text-sm text-ink/60">
                No players yet — be the first to sign up!
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {players.map((player) => (
                  <button
                    key={player.displayName}
                    type="button"
                    onClick={() => {
                      setSelected(player);
                      setStep("pin");
                    }}
                    className="flex items-center gap-3 rounded-btn border border-paper-line bg-paper px-4 py-3 text-left text-[1.0625rem] font-bold text-ink transition hover:border-accent/60"
                  >
                    <span className="text-xl">{player.emoji ?? "⚽"}</span>
                    {player.displayName}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep("join")}
              className="mt-6 w-full text-center text-sm text-ink/60"
            >
              New here?{" "}
              <span className="font-bold text-ink underline">
                Join the competition
              </span>
            </button>
          </>
        ) : null}

        {step === "pin" && selected ? (
          <>
            <button
              type="button"
              onClick={goToList}
              className="mb-4 text-sm font-bold text-ink/60 hover:text-ink"
            >
              ← Not {selected.displayName}?
            </button>
            <h1 className="text-[1.9rem] font-extrabold text-ink">
              Hi {selected.displayName}! {selected.emoji ?? "⚽"}
            </h1>
            <p className="mt-1 mb-6 text-ink/70">Enter your PIN.</p>

            <PinInput
              key={pinResetKey}
              label="PIN"
              onComplete={handlePinComplete}
              error={pinError ?? undefined}
            />

            {pinSubmitting ? (
              <p className="mt-4 text-sm text-ink/60">Checking…</p>
            ) : null}
          </>
        ) : null}

        {step === "join" ? (
          <>
            <button
              type="button"
              onClick={goToList}
              className="mb-4 text-sm font-bold text-ink/60 hover:text-ink"
            >
              ← Back
            </button>
            <h1 className="text-[1.9rem] font-extrabold text-ink">
              Join Tipperoos
            </h1>
            <p className="mt-1 mb-6 text-ink/70">Let&apos;s get you set up.</p>

            <form onSubmit={handleJoinSubmit} className="flex flex-col gap-5">
              <TextField
                label="Display name"
                value={joinDisplayName}
                onChange={(e) => setJoinDisplayName(e.target.value)}
                autoComplete="nickname"
                autoFocus
                hint="2–20 characters. This is what everyone sees on the leaderboard."
              />
              <PinInput
                key={joinPinResetKey}
                label="Choose a 4-digit PIN"
                onComplete={setJoinPin}
              />
              <TextField
                label="Email (optional)"
                type="email"
                value={joinEmail}
                onChange={(e) => setJoinEmail(e.target.value)}
                autoComplete="email"
                hint="Only used for gameweek reminders — totally optional."
              />

              <div className="flex flex-col gap-1.5">
                <span className="text-[0.8rem] font-bold tracking-[0.08em] text-ink uppercase">
                  Pick an emoji (optional)
                </span>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setJoinEmoji((current) =>
                          current === option ? null : option,
                        )
                      }
                      aria-pressed={joinEmoji === option}
                      className={`flex h-11 w-11 items-center justify-center rounded-btn-sm border text-xl transition ${
                        joinEmoji === option
                          ? "border-accent bg-accent/20"
                          : "border-paper-line bg-paper hover:border-accent/60"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {joinError ? (
                <p className="text-sm text-danger">{joinError}</p>
              ) : null}

              <Button type="submit" fullWidth disabled={joinSubmitting}>
                {joinSubmitting ? "Joining…" : "Join the competition"}
              </Button>
            </form>
          </>
        ) : null}
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
          <p className="text-ink/60">Loading…</p>
        </main>
      }
    >
      <LoginFlow />
    </Suspense>
  );
}
