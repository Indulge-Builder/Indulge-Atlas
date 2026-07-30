import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isAcademyTrainer, isPrivilegedRole } from "@/lib/types/database";
import { AcademyNav } from "@/components/academy/AcademyNav";
import type { UserRole } from "@/lib/types/database";

/**
 * Academy app shell — the standalone training surface.
 *
 * Deliberately does NOT mount the Atlas dashboard provider tree
 * (TaskReminder / LeadAlert / Chat / Profile / SLA / CommandPalette /
 * TaskAlert / LeadCollaborationGrantListener). Academy uses none of them, and
 * booting eight providers on a page that never reads them is pure cost. Pages
 * here use `AcademyTopBar`, not `components/layout/TopBar`, for the same
 * reason — TopBar depends on three of those contexts.
 *
 * Unauthenticated users go to /academy/login, not /login: this app has its own
 * front door. That login page lives in the sibling (academy-auth) group so it
 * is not gated by this layout — otherwise it would redirect onto itself.
 */
export default async function AcademyAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let role: string;
  let department: string | null;
  let profile: Awaited<ReturnType<typeof getAuthUser>>["profile"];

  try {
    ({ role, department, profile } = await getAuthUser());
  } catch {
    redirect("/academy/login");
  }

  if (!profile) redirect("/academy/login");

  // Interns (department === "academy", unprivileged) are bounced out of the
  // Atlas dashboard, so offering them a back-link would just loop them.
  const canReturnToAtlas =
    isPrivilegedRole(role as UserRole) || department !== "academy";

  return (
    /*
     * `h-screen` (not `min-h-screen`) so `<main>` is a bounded flex child.
     * The Academy chat view pins itself with `h-full` and scrolls only its
     * message list; scrolling pages (practice, cohort, seeds) get their
     * scrollbar from `overflow-y-auto` here.
     */
    <div className="flex h-screen flex-col overflow-hidden bg-[#F9F9F6]">
      <AcademyNav
        canReturnToAtlas={canReturnToAtlas}
        displayName={profile.full_name ?? null}
        isTrainer={isAcademyTrainer(role as UserRole, department)}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
