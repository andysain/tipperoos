"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PinInput } from "@/components/ui/PinInput";
import { TextField } from "@/components/ui/TextField";

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

interface SignupSuccess {
  id: string;
  displayName: string;
  emoji: string | null;
}

export default function SignupPage() {
  const [competitionCode, setCompetitionCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [pinResetKey, setPinResetKey] = useState(0);
  const [email, setEmail] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SignupSuccess | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!competitionCode.trim()) {
      setError("You'll need the competition code to join.");
      return;
    }
    if (!displayName.trim()) {
      setError("Pick a display name first.");
      return;
    }
    if (pin.length !== 4) {
      setError("Your PIN needs to be 4 digits.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tipperoos-client": "1",
        },
        body: JSON.stringify({
          competitionCode,
          displayName,
          pin,
          email: email.trim() || undefined,
          emoji: emoji ?? undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong — try again.");
        setPin("");
        setPinResetKey((k) => k + 1);
        return;
      }

      setSuccess(data);
    } catch {
      setError(
        "Couldn't reach Tipperoos. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <Card className="w-full max-w-sm text-center">
          <div className="mb-2 text-5xl">{success.emoji ?? "⚽"}</div>
          <h1 className="text-[1.9rem] font-extrabold text-ink">
            You&apos;re in, {success.displayName}!
          </h1>
          <p className="mt-2 text-ink/70">
            The pitch is waiting — head to login next time to jump back in.
          </p>
          <Link href="/login" className="mt-6 inline-block">
            <Button intent="secondary">Go to login</Button>
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-[1.9rem] font-extrabold text-ink">
          Join Tipperoos
        </h1>
        <p className="mt-1 mb-6 text-ink/70">
          Got the competition code? Let&apos;s get you set up.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <TextField
            label="Competition code"
            value={competitionCode}
            onChange={(e) => setCompetitionCode(e.target.value)}
            autoComplete="off"
          />
          <TextField
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            hint="2–20 characters. This is what everyone sees on the leaderboard."
          />
          <PinInput
            key={pinResetKey}
            label="Choose a 4-digit PIN"
            onComplete={setPin}
          />
          <TextField
            label="Email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
                    setEmoji((current) => (current === option ? null : option))
                  }
                  aria-pressed={emoji === option}
                  className={`flex h-11 w-11 items-center justify-center rounded-btn-sm border text-xl transition ${
                    emoji === option
                      ? "border-accent bg-accent/20"
                      : "border-paper-line bg-paper hover:border-accent/60"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? "Joining…" : "Join the competition"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink/60">
          Already playing?{" "}
          <Link href="/login" className="font-bold text-ink underline">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
