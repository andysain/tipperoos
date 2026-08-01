"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PinInput } from "@/components/ui/PinInput";

interface Player {
  displayName: string;
  emoji: string | null;
}

interface LoginSuccess {
  id: string;
  displayName: string;
  emoji: string | null;
  pinResetRequired: boolean;
}

function formatSydneyTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function LoginPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);

  const [pinResetKey, setPinResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<LoginSuccess | null>(null);

  useEffect(() => {
    fetch("/api/auth/players")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => setPlayers(data.players))
      .catch(() => setLoadError(true));
  }, []);

  async function handlePinComplete(pin: string) {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
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
        setError(
          `Too many tries — take a short break and try again at ${formatSydneyTime(data.lockedUntil)}.`,
        );
        setPinResetKey((k) => k + 1);
        return;
      }
      if (!response.ok) {
        const remaining = data.attemptsRemaining;
        setError(
          typeof remaining === "number"
            ? `That PIN didn't match. ${remaining} more ${remaining === 1 ? "try" : "tries"} before a short break.`
            : "That PIN didn't match. Try again.",
        );
        setPinResetKey((k) => k + 1);
        return;
      }

      setSuccess(data);
    } catch {
      setError(
        "Couldn't reach Tipperoos. Check your connection and try again.",
      );
      setPinResetKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  function backToNameList() {
    setSelected(null);
    setError(null);
    setPinResetKey((k) => k + 1);
  }

  if (success) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <Card className="w-full max-w-sm text-center">
          <div className="mb-2 text-5xl">{success.emoji ?? "⚽"}</div>
          <h1 className="text-[1.9rem] font-extrabold text-ink">
            Welcome back, {success.displayName}!
          </h1>
          {success.pinResetRequired ? (
            <p className="mt-2 text-warning">
              You&apos;ll need to set a new PIN before you can keep going.
            </p>
          ) : (
            <p className="mt-2 text-ink/70">You&apos;re logged in.</p>
          )}
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm">
        {!selected ? (
          <>
            <h1 className="text-[1.9rem] font-extrabold text-ink">
              Who&apos;s playing?
            </h1>
            <p className="mt-1 mb-6 text-ink/70">Pick your name to log in.</p>

            {loadError ? (
              <p className="text-sm text-danger">
                Couldn&apos;t load players. Refresh to try again.
              </p>
            ) : players === null ? (
              <p className="text-sm text-ink/60">Loading players…</p>
            ) : players.length === 0 ? (
              <p className="text-sm text-ink/60">
                No players yet — be the first to sign up!
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {players.map((player) => (
                  <button
                    key={player.displayName}
                    type="button"
                    onClick={() => setSelected(player)}
                    className="flex items-center gap-3 rounded-btn border border-paper-line bg-paper px-4 py-3 text-left text-[1.0625rem] font-bold text-ink transition hover:border-accent/60"
                  >
                    <span className="text-xl">{player.emoji ?? "⚽"}</span>
                    {player.displayName}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-6 text-center text-sm text-ink/60">
              New here?{" "}
              <Link href="/signup" className="font-bold text-ink underline">
                Join the competition
              </Link>
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={backToNameList}
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
              error={error ?? undefined}
            />

            {submitting ? (
              <p className="mt-4 text-sm text-ink/60">Checking…</p>
            ) : null}
          </>
        )}
      </Card>
    </main>
  );
}
