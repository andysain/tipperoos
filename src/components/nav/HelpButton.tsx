import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

export function HelpButton() {
  const pathname = usePathname();
  const router = useRouter();
  const onHelpPage = pathname === "/how-it-works";

  if (onHelpPage) {
    return (
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Back to previous page"
        title="Back to previous page"
        className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-[4.25rem] z-10 flex size-10 items-center justify-center rounded-badge border border-paper-line bg-paper text-lg font-extrabold text-ink shadow-lg shadow-ink/25 transition hover:bg-white"
      >
        <ArrowLeft className="size-5 stroke-ink stroke-2" />
      </button>
    );
  }

  return (
    <Link
      href={{ pathname: "/how-it-works" }}
      aria-label="How it works"
      title="How it works"
      className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-[4.25rem] z-10 flex size-10 items-center justify-center rounded-badge border border-paper-line bg-paper text-lg font-extrabold text-ink shadow-lg shadow-ink/25 transition hover:bg-white"
    >
      ?
    </Link>
  );
}
