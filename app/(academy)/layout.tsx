import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { canReturnToAtlas, isNativeShell } from "@/lib/academy/shell";
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

  /*
   * The back-link is hidden for two independent reasons:
   *  - interns (unprivileged, department "academy") are bounced out of the
   *    dashboard anyway, so offering it would just loop them; and
   *  - inside the Android shell there is no Atlas to return to. The APK is
   *    Academy only, so rendering a link out would strand the user on a screen
   *    the native URL guard then refuses to load.
   */
  /*
   * "← Atlas" is administrators only.
   *
   * The previous condition also passed for anyone whose department merely was
   * not "academy", so an ordinary concierge agent taking a training session saw
   * a link into the CRM. Role is now the only thing that decides it, and
   * `isPrivilegedRole` (admin / founder / super_admin) is the same test the
   * Atlas dashboard itself gates on — so the link can never point somewhere its
   * owner would be bounced from.
   */
  const inNativeShell = isNativeShell((await headers()).get("user-agent"));
  const showAtlasLink = canReturnToAtlas({ role, inNativeShell });

  return (
    /*
     * `h-screen` (not `min-h-screen`) so `<main>` is a bounded flex child.
     * The Academy chat view pins itself with `h-full` and scrolls only its
     * message list; scrolling pages (practice, cohort, seeds) get their
     * scrollbar from `overflow-y-auto` here.
     */
    <div className="flex h-screen flex-col overflow-hidden bg-[#F9F9F6]">
      <AcademyNav
        canReturnToAtlas={showAtlasLink}
        displayName={profile.full_name ?? null}
        isTrainer={isAcademyTrainer(role as UserRole, department)}
        isAdmin={isPrivilegedRole(role as UserRole)}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
