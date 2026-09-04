"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { PinInput } from "@/components/ui/PinInput";
import { FOCUS, T, TX } from "@/components/ui/tokens";

// The client half of /reset-pin. Mirrors the login screen's PIN-entry
// conventions (Card + PinInput, remount-to-clear via a key counter).
export function ResetPinForm() {
  const router = useRouter();
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function submit(pin: string) {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/set-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tipperoos-client": "1",
        },
        body: JSON.stringify({ pin }),
      });

      if (response.ok) {
        // Into the app. refresh() so the root layout re-derives the session
        // (mirrors the login screen's success path, issue #199).
        router.push("/");
        router.refresh();
        return;
      }

      if (response.status === 403) {
        // No reset pending anymore (cleared between load and submit) -- let
        // the server prologue redirect rather than show a wrong error.
        router.refresh();
        return;
      }

      if (response.status === 409) {
        // The reset already completed on another request -- send them to
        // sign in with the PIN that write set.
        router.push("/login");
        router.refresh();
        return;
      }

      setError(
        "That didn't work — pick a different 4-digit PIN and try again.",
      );
      setResetKey((k) => k + 1);
    } catch {
      setError(
        "Couldn't reach Tipperoos. Check your connection and try again.",
      );
      setResetKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function switchPlayer() {
    if (switching) return;
    setSwitching(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "x-tipperoos-client": "1" },
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm">
        <h1 className={`${T.h1} font-extrabold ${TX.base}`}>Choose a new PIN</h1>
        <p className={`mt-1 mb-6 ${TX.muted}`}>
          You&apos;re signed in with a temporary PIN. Pick a new 4-digit PIN
          you&apos;ll remember — you&apos;ll use it every time from now on.
        </p>

        <PinInput
          key={resetKey}
          label="Choose a new 4-digit PIN"
          masked
          onComplete={submit}
          error={error ?? undefined}
        />

        {submitting ? (
          <p className={`mt-4 ${T.dense} ${TX.muted}`}>Saving…</p>
        ) : null}

        <button
          type="button"
          onClick={switchPlayer}
          disabled={switching}
          className={`mt-6 block w-full text-center ${T.dense} font-bold ${TX.muted} transition hover:text-text disabled:opacity-50 ${FOCUS}`}
        >
          Not you? Switch player
        </button>
      </Card>
    </main>
  );
}
