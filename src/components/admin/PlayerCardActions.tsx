"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PinInput } from "@/components/ui/PinInput";
import { MICRO_LABEL, T, TX } from "@/components/ui/tokens";

// The Phase 1 roster-card actions (docs/admin-ui-spec.md §6.2). Both call the
// first mutating /api/admin/* routes (issue #201). On success we
// router.refresh() so the server-rendered "Locked until…" / "PIN reset
// pending" markers re-derive — client state here (the temp-PIN panel)
// survives a soft refresh.

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "x-tipperoos-client": "1",
} as const;

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function PlayerCardActions({
  playerId,
  displayName,
  isLocked,
}: {
  playerId: string;
  displayName: string;
  isLocked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinKey, setPinKey] = useState(0);
  const [confirmKey, setConfirmKey] = useState(0);
  // The temporary PIN, shown back once after a successful reset. Held in
  // client state only — the route never returns it.
  const [tempPin, setTempPin] = useState<string | null>(null);

  function resetForm() {
    setPin("");
    setPinConfirm("");
    setPinKey((k) => k + 1);
    setConfirmKey((k) => k + 1);
  }

  async function clearLockout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await postJson("/api/admin/players/clear-lockout", { playerId });
    setBusy(false);
    if (!ok) {
      setError("Couldn't clear the lockout — try again.");
      return;
    }
    router.refresh();
  }

  async function submitReset() {
    if (busy) return;
    if (pin.length !== 4 || pinConfirm.length !== 4) {
      setError("Enter the 4-digit PIN in both boxes.");
      return;
    }
    if (pin !== pinConfirm) {
      setError("The two PINs don't match.");
      setPinConfirm("");
      setConfirmKey((k) => k + 1);
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await postJson("/api/admin/players/reset-pin", {
      playerId,
      pin,
      pinConfirm,
    });
    setBusy(false);
    if (!ok) {
      setError("Couldn't set the PIN — try again.");
      return;
    }
    setTempPin(pin);
    setResetting(false);
    resetForm();
    router.refresh();
  }

  if (tempPin) {
    return (
      <div className="flex flex-col gap-1.5 rounded-btn border border-warning bg-warning/15 p-2.5">
        <span className={`${MICRO_LABEL} ${TX.muted}`}>
          Temporary PIN for {displayName}
        </span>
        <span className={`${T.h2} font-extrabold tabular-nums ${TX.base}`}>
          {tempPin}
        </span>
        <span className={`${T.caption} ${TX.muted}`}>
          Tell them this in person or by phone — there’s no other way it reaches
          them. They’ll be asked to choose a new PIN next time they log in.
        </span>
        <Button
          intent="ghost"
          size="sm"
          className="self-start"
          onClick={() => setTempPin(null)}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {resetting ? (
        <div className="flex flex-col gap-2 rounded-btn border border-paper-line bg-paper p-2.5">
          <PinInput
            key={pinKey}
            label="Temporary PIN"
            onComplete={setPin}
          />
          <PinInput
            key={confirmKey}
            label="Confirm PIN"
            autoFocus={false}
            onComplete={setPinConfirm}
          />
          <div className="flex gap-2">
            <Button
              intent="secondary"
              size="sm"
              disabled={busy}
              onClick={submitReset}
            >
              {busy ? "Setting…" : "Set temporary PIN"}
            </Button>
            <Button
              intent="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setResetting(false);
                setError(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {isLocked ? (
            <Button
              intent="ghost"
              size="sm"
              disabled={busy}
              onClick={clearLockout}
            >
              {busy ? "Clearing…" : "Clear lockout"}
            </Button>
          ) : null}
          <Button
            intent="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setResetting(true);
              setError(null);
            }}
          >
            Reset PIN
          </Button>
        </div>
      )}

      {error ? <p className={`${T.caption} text-danger`}>{error}</p> : null}
    </div>
  );
}
