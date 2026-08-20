"use client";

// PROTOTYPE state switcher -- deliberately high-contrast so it never reads as
// part of the design being judged. Hidden in production builds.
//
// No variant control: every design question is settled (see page.tsx). What
// this switches is state -- which surface, and where the week has got to.

export function PrototypeSwitcher({
  surface,
  surfaces,
  onSurface,
  phase,
  onPhase,
  recap,
  recaps,
  onRecap,
}: {
  surface: string;
  surfaces: string[];
  onSurface: (s: string) => void;
  phase: string;
  onPhase: (p: string) => void;
  recap: string;
  recaps: string[];
  onRecap: (r: string) => void;
}) {
  if (process.env.NODE_ENV === "production") return null;

  const seg = (active: boolean, enabled = true) =>
    `rounded-md px-2 py-1 text-[0.68rem] font-bold ${
      active
        ? "bg-white text-black"
        : enabled
          ? "text-white/55"
          : "text-white/25"
    }`;

  return (
    <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
      <div className="flex flex-col gap-1 rounded-2xl bg-black/90 p-2 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-1">
          <span className="pl-1 pr-1 text-[0.6rem] font-bold uppercase tracking-wider text-white/35">
            where
          </span>
          {surfaces.map((s) => (
            <button
              key={s}
              onClick={() => onSurface(s)}
              className={seg(surface === s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border-t border-white/15 pt-1">
          <span className="pl-1 pr-1 text-[0.6rem] font-bold uppercase tracking-wider text-white/35">
            when
          </span>
          {["entry", "filed", "locked", "part_played", "next"].map((p) => (
            <button
              key={p}
              onClick={() => onPhase(p)}
              disabled={surface !== "home"}
              className={seg(
                phase === p && surface === "home",
                surface === "home",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border-t border-white/15 pt-1">
          <span className="pl-1 pr-1 text-[0.6rem] font-bold uppercase tracking-wider text-white/35">
            recap
          </span>
          {recaps.map((r) => (
            <button
              key={r}
              onClick={() => onRecap(r)}
              disabled={surface !== "home"}
              className={seg(
                recap === r && surface === "home",
                surface === "home",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
