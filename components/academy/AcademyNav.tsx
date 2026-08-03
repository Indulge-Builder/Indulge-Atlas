"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, type JSX } from "react";
import { GraduationCap, LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Academy app's single navigation bar.
 *
 * Every destination lives here — the view tabs that used to sit in a second
 * row below the page header were folded in, which removed a whole band of
 * vertical chrome above the conversation.
 *
 * "Academy" is the wordmark, not a tab: it targets /academy, which is exactly
 * where "Clients" goes, so rendering both would be two controls for one route.
 */

interface NavLink {
  href: string;
  label: string;
  /** Trainers and admins. Hidden here AND gated server-side. */
  trainerOnly?: boolean;
  /** Admins only — trainers do not get these. Gated server-side too. */
  adminOnly?: boolean;
  /** Which ?view= value marks this tab active. Absent = no view param. */
  view?: string;
}

/**
 * Three tiers, all mirrored by a server-side gate on the route itself:
 *   everyone  — the training experience a trainee signs in for
 *   trainer   — cohort oversight
 *   admin     — the scenario answer key and the cohort-wide analytics
 *
 * Scenario library is admin-only deliberately: it holds hidden_constraints and
 * ideal_outcome, i.e. the answers to the drills. Analytics is the whole-cohort
 * dashboard. Trainers review their cohort through the Cohort tab instead.
 */
const LINKS: NavLink[] = [
  { href: "/academy", label: "Clients" },
  { href: "/academy/tasks", label: "Training tasks" },
  { href: "/academy?view=practice", label: "Free practice", view: "practice" },
  { href: "/academy?view=cohort", label: "Cohort", view: "cohort", trainerOnly: true },
  { href: "/academy/seeds", label: "Scenario library", adminOnly: true },
  { href: "/academy/admin", label: "Analytics", adminOnly: true },
];

/**
 * Reads the `view` query param, so the three tabs that share /academy can tell
 * each other apart. Split out because `useSearchParams` needs its own Suspense
 * boundary — same pattern as DomainSwitcher inside the Atlas TopBar.
 */
function NavLinks({
  isTrainer,
  isAdmin,
}: {
  isTrainer: boolean;
  isAdmin: boolean;
}): JSX.Element {
  const pathname = usePathname();
  const view = useSearchParams().get("view");

  /** Admins are trainers too, so an admin sees every tab. */
  const visible = (l: NavLink): boolean => {
    if (l.adminOnly) return isAdmin;
    if (l.trainerOnly) return isTrainer;
    return true;
  };

  const isActive = (link: NavLink): boolean => {
    if (link.href.startsWith("/academy/")) {
      const base = link.href;
      return pathname === base || pathname.startsWith(`${base}/`);
    }
    // The /academy trio: matched on the view param, not the path.
    if (pathname !== "/academy") return false;
    return (link.view ?? null) === (view ?? null);
  };

  return (
    <nav
      aria-label="Indulge Training sections"
      /* Scrolls rather than wraps on narrow screens: a second nav row is the
         exact thing this change removed. */
      className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {LINKS.filter(visible).map((link) => {
        const active = isActive(link);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
              active
                ? "bg-white/10 text-[#F9F9F6]"
                : "text-white/50 hover:bg-white/5 hover:text-white/80",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AcademyNav({
  canReturnToAtlas,
  displayName,
  isTrainer = false,
  isAdmin = false,
}: {
  canReturnToAtlas: boolean;
  displayName: string | null;
  isTrainer?: boolean;
  /** Admins additionally get the scenario library and cohort analytics. */
  isAdmin?: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);

  /*
   * Sign-out is a real form POST to /auth/signout, not a client-side call.
   *
   * The old version cleared the session from JavaScript and then
   * router.push()'d. That left the session cookie alive on the server and,
   * worse, left the authenticated `/academy` page sitting in Next's client
   * Router Cache — so Back re-displayed it without asking the server. The route
   * handler clears the cookies server-side and revalidates every segment.
   */

  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-[#1A1814]">
      <div className="flex items-center gap-4 px-4 py-2.5 md:px-6 lg:px-8">
        <Link href="/academy" className="flex shrink-0 items-center gap-2">
          <GraduationCap className="h-4 w-4 text-brand-gold" aria-hidden />
          <span
            className="text-[15px] font-semibold tracking-wide text-[#F9F9F6]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Indulge Training
          </span>
        </Link>

        {/* min-w-0 lets the nav shrink and scroll instead of shoving the
            right-hand controls off the bar. */}
        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="h-[30px]" />}>
            <NavLinks isTrainer={isTrainer} isAdmin={isAdmin} />
          </Suspense>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {displayName && (
            <span className="hidden text-[12px] text-white/40 lg:inline">
              {displayName}
            </span>
          )}

          {canReturnToAtlas && (
            <Link
              href="/"
              className="hidden text-[12px] text-white/50 transition-colors hover:text-white/80 sm:inline"
            >
              ← Atlas
            </Link>
          )}

          <form
            action="/auth/signout?from=/academy"
            method="post"
            onSubmit={() => setSigningOut(true)}
          >
            <button
              type="submit"
              disabled={signingOut}
              aria-label="Sign out"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-white/50 transition-colors hover:text-white/80 disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <LogOut className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
