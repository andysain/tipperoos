"use client";

// PROTOTYPE CHROME -- throwaway. Floating variant switcher for dev-only
// prototype routes (see /Users/andy/.claude/skills/prototype). Deliberately
// high-contrast and off-palette so it never reads as part of the design
// being evaluated. Never rendered in a production build.

import { useEffect } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
  extra,
}: {
  variants: PrototypeVariant[];
  current: string;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next =
        variants[(index + delta + variants.length) % variants.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next.key);
      router.replace(`${pathname}?${params.toString()}` as Route);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, pathname, router, searchParams, variants]);

  if (process.env.NODE_ENV === "production") return null;

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next.key);
    router.replace(`${pathname}?${params.toString()}` as Route);
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3">
      <div className="flex items-center gap-1 rounded-full bg-neutral-900 px-1.5 py-1.5 text-white shadow-2xl ring-1 ring-white/20">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous variant"
          className="rounded-full px-3 py-1.5 text-sm font-bold hover:bg-white/15"
        >
          ←
        </button>
        <span className="min-w-[13rem] px-2 text-center text-xs font-semibold tracking-wide">
          {variants[index].key} — {variants[index].name}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next variant"
          className="rounded-full px-3 py-1.5 text-sm font-bold hover:bg-white/15"
        >
          →
        </button>
        {extra ? (
          <>
            <span className="mx-1 h-5 w-px bg-white/25" aria-hidden />
            {extra}
          </>
        ) : null}
      </div>
    </div>
  );
}
