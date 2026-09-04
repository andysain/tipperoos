"use client";

import { Shuffle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PinInput } from "@/components/ui/PinInput";
import { TextField } from "@/components/ui/TextField";
import { detectBrowserTimeZone } from "@/components/nav/timezone-cookie";
import { EMOJI_OPTIONS, pickRandomEmoji } from "@/lib/auth/emoji-options";
import { FOCUS, LABEL, T, TX } from "@/components/ui/tokens";
import { fetchPlayers, type Player } from "./fetch-players";

const STORED_CODE_KEY = "tipperoos.competitionCode";
const TABLE_PREDICTION_NUDGE_KEY = "tipperoos.needsTablePrediction";

type Step = "checking" | "code" | "list" | "pin" | "join";

// This page is "use client" and the lockout message only ever renders after
// a client-side fetch response, so the viewer's browser timezone is read
// directly -- no cookie/SSR involvement needed here at all (see issue #93).
function formatLocalTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: detectBrowserTimeZone(),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function LoginFlow() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [joinDisplayNameError, setJoinDisplayNameError] = useState<
    string | null
  >(null);
  const [joinPin, setJoinPin] = useState("");
  const [joinPinResetKey, setJoinPinResetKey] = useState(0);
  const [joinEmoji, setJoinEmoji] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);

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
        body: JSON.stringify({
          competitionCode,
          displayName: selected.displayName,
          pin,
        }),
      });
      const data = await response.json();

      if (response.status === 423) {
        setPinError(
          `Too many tries — take a short break and try again at ${formatLocalTime(data.lockedUntil)}.`,
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

      // Straight to the Pick Board -- no success interstitial. The session
      // cookie is already set by this response, so `/` resolves the player
      // without another round trip. (pin_reset_required is intentionally
      // not surfaced here: the forced-PIN-reset flow isn't built yet, and
      // this screen used to be a dead-end warning with no way forward.)
      //
      // router.refresh() as well: the root layout computes `isAdmin` for
      // the More menu, and App Router doesn't re-render layouts on a soft
      // navigation -- without this the menu carries the previous session's
      // admin state onto a shared device (issue #199).
      router.push("/");
      router.refresh();
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
    setJoinDisplayNameError(null);

    if (!joinDisplayName.trim()) {
      setJoinError("Pick a display name first.");
      return;
    }
    if (joinPin.length !== 4) {
      setJoinError("Your PIN needs to be 4 digits.");
      return;
    }
    if (!joinEmoji) {
      setJoinError("Pick an emoji first.");
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
          emoji: joinEmoji ?? undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setJoinDisplayNameError(
            "That name is already taken. Try a different display name.",
          );
          setJoinError(null);
        } else {
          setJoinError(data.error ?? "Something went wrong — try again.");
        }
        setJoinPin("");
        setJoinPinResetKey((k) => k + 1);
        return;
      }

      window.localStorage.setItem(TABLE_PREDICTION_NUDGE_KEY, "true");
      // See handlePinComplete: refresh so the root layout re-derives the
      // session (a brand-new player is never admin, but the previous
      // session on a shared device may have been).
      router.push("/");
      router.refresh();
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

  // "Using a different competition?" -- a player logged into one competition
  // who needs another (e.g. a shared family device, or a friend in a second
  // comp) must be able to get back to the code step. The stored code is
  // what the mount-time replay effect reads, so evicting it here is what
  // stops the next /login visit from silently replaying the old competition.
  function goToCode() {
    window.localStorage.removeItem(STORED_CODE_KEY);
    setCompetitionCode(null);
    setCodeInput("");
    setCodeError(null);
    setSelected(null);
    setStep("code");
  }

  if (step === "checking") {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className={TX.muted}>Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm">
        {step === "code" ? (
          <>
            <h1 className={`${T.h1} font-extrabold ${TX.base}`}>
              Welcome to Tipperoos
            </h1>
            <p className={`mt-1 mb-6 ${TX.muted}`}>
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
            <h1 className={`${T.h1} font-extrabold ${TX.base}`}>
              Who&apos;s playing?
            </h1>
            <p className={`mt-1 mb-6 ${TX.muted}`}>Pick your name to log in.</p>

            {players.length === 0 ? (
              <p className={`${T.dense} ${TX.muted}`}>
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
                    className={`flex items-center gap-3 rounded-btn border border-paper-line bg-paper px-4 py-3 text-left ${T.body} font-bold ${TX.base} transition hover:border-accent/60 ${FOCUS}`}
                  >
                    <span className={T.body}>{player.emoji ?? "⚽"}</span>
                    {player.displayName}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep("join")}
              className={`mt-6 flex w-full items-center justify-center rounded-btn border-2 border-accent bg-accent/10 px-4 py-3 text-center ${T.body} font-extrabold ${TX.base} transition hover:bg-accent/20 ${FOCUS}`}
            >
              New here? Join the competition
            </button>

            <button
              type="button"
              onClick={goToCode}
              className={`mt-3 text-center ${T.dense} font-bold ${TX.muted} transition hover:text-text ${FOCUS}`}
            >
              Using a different competition? Enter another code
            </button>
          </>
        ) : null}

        {step === "pin" && selected ? (
          <>
            <button
              type="button"
              onClick={goToList}
              className={`mb-4 ${T.dense} font-bold ${TX.muted} hover:text-text ${FOCUS}`}
            >
              ← Not {selected.displayName}?
            </button>
            <h1 className={`${T.h1} font-extrabold ${TX.base}`}>
              Hi {selected.displayName}! {selected.emoji ?? "⚽"}
            </h1>
            <p className={`mt-1 mb-6 ${TX.muted}`}>Enter your PIN.</p>

            <PinInput
              key={pinResetKey}
              label="PIN"
              masked
              onComplete={handlePinComplete}
              error={pinError ?? undefined}
            />

            {pinSubmitting ? (
              <p className={`mt-4 ${T.dense} ${TX.muted}`}>Checking…</p>
            ) : null}
          </>
        ) : null}

        {step === "join" ? (
          <>
            <button
              type="button"
              onClick={goToList}
              className={`mb-4 ${T.dense} font-bold ${TX.muted} hover:text-text ${FOCUS}`}
            >
              ← Back
            </button>
            <h1 className={`${T.h1} font-extrabold ${TX.base}`}>
              Join Tipperoos
            </h1>
            <p className={`mt-1 mb-6 ${TX.muted}`}>Let&apos;s get you set up.</p>

            <form onSubmit={handleJoinSubmit} className="flex flex-col gap-5">
              <TextField
                label="Display name"
                value={joinDisplayName}
                onChange={(e) => {
                  setJoinDisplayName(e.target.value);
                  setJoinDisplayNameError(null);
                  setJoinError(null);
                }}
                autoComplete="nickname"
                autoFocus
                error={joinDisplayNameError ?? undefined}
                hint="Unique to you. Use 2–20 letters, numbers, spaces, apostrophes or hyphens. This is what everyone sees."
              />
              <PinInput
                key={joinPinResetKey}
                label="Choose a 4-digit PIN"
                autoFocus={false}
                onComplete={setJoinPin}
              />

              <div className="flex flex-col gap-1.5">
                <span className={`${LABEL} ${TX.base}`}>
                  Pick an emoji
                </span>
                <div className="grid grid-cols-6 gap-2">
                  {EMOJI_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setJoinEmoji(option)}
                      aria-pressed={joinEmoji === option}
                      className={`flex h-11 w-11 items-center justify-center rounded-btn-sm border ${T.body} transition ${FOCUS} ${
                        joinEmoji === option
                          ? "border-accent bg-accent/20"
                          : "border-paper-line bg-paper hover:border-accent/60"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    intent="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => setJoinEmoji(pickRandomEmoji(joinEmoji))}
                  >
                    {/* Shuffle, not Dices -- a pair of dice is the most
                        gambling-coded glyph in any icon set, on an app whose
                        spec bans gambling language (CLAUDE.md -> Hard
                        constraints). Same swap as the match card. */}
                    <Shuffle className="size-4" />
                    Pick Random Emoji
                  </Button>
                  {joinEmoji ? (
                    <span className={`flex items-center gap-2 rounded-btn-sm border border-accent bg-accent/10 px-3 py-1.5 ${T.dense} font-bold ${TX.base}`}>
                      <span className={`tracking-[0.08em] ${T.label} ${TX.muted} uppercase`}>
                        Selected
                      </span>
                      <span className={`${T.h1} leading-none`}>{joinEmoji}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              {joinError ? (
                <p className={`${T.dense} text-danger`}>{joinError}</p>
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
          <p className={TX.muted}>Loading…</p>
        </main>
      }
    >
      <LoginFlow />
    </Suspense>
  );
}
