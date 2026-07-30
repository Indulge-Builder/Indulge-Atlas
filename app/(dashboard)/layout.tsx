import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskReminderProvider } from "@/components/task-reminder/TaskReminderProvider";
import { TaskAlertProvider } from "@/components/providers/TaskAlertProvider";
import { LeadAlertProvider } from "@/components/providers/LeadAlertProvider";
import { CommandPaletteProvider } from "@/components/providers/CommandPaletteProvider";
import { LeadCollaborationGrantListener } from "@/components/leads/LeadCollaborationGrantListener";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ProfileProvider } from "@/components/sla/ProfileProvider";
import { SLAProvider } from "@/components/sla/SLAProvider";
import { isPrivilegedRole } from "@/lib/types/database";
import type { Profile, UserRole } from "@/lib/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let profile: Awaited<ReturnType<typeof getAuthUser>>["profile"];
  let role: string;
  let department: string | null;

  try {
    ({ user, profile, role, department } = await getAuthUser());
  } catch {
    redirect("/login");
  }

  if (!profile) redirect("/login");

  /*
   * Academy interns belong to the Academy app, not Atlas.
   *
   * DEPARTMENT_ROUTE_ACCESS only filters Sidebar links — it is not an
   * authorization gate, so without this an intern could reach /leads or
   * /clients by typing the URL. Privileged roles in the academy department
   * (trainers who are also admins/founders) keep their Atlas access.
   */
  if (department === "academy" && !isPrivilegedRole(role as UserRole)) {
    redirect("/academy");
  }

  return (
    /*
     * layout-canvas  → the textured dark shell (globals.css)
     * Sidebar is transparent — it paints directly onto the canvas
     * The ml-60 + p-3 shell creates a 12 px visible gutter of canvas
     * around the paper on three sides (top / right / bottom) and keeps
     * the left edge flush with the sidebar for a seamless join.
     */
    <TaskReminderProvider>
      <LeadAlertProvider>
        <ChatProvider currentUserId={user.id}>
          <ProfileProvider profile={profile as Profile}>
            <SLAProvider profile={profile as Profile}>
              <div className="layout-canvas min-h-screen">
                <Sidebar profile={profile as Profile} />

                <div className="ml-60 flex min-h-screen flex-col p-3">
                  <main
                    className="
                      relative flex min-h-0 flex-1 flex-col overflow-x-hidden
                      bg-[#F9F9F6] rounded-2xl overflow-hidden
                      paper-shadow
                    "
                  >
                    <CommandPaletteProvider>
                      <TaskAlertProvider>
                        <LeadCollaborationGrantListener userId={user.id} />
                        {children}
                      </TaskAlertProvider>
                    </CommandPaletteProvider>
                  </main>
                </div>
              </div>
            </SLAProvider>
          </ProfileProvider>
        </ChatProvider>
      </LeadAlertProvider>
    </TaskReminderProvider>
  );
}
