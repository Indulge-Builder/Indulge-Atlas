import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskReminderProvider } from "@/components/task-reminder/TaskReminderProvider";
import { TaskAlertProvider } from "@/components/providers/TaskAlertProvider";
import { LeadAlertProvider } from "@/components/providers/LeadAlertProvider";
import { CommandPaletteProvider } from "@/components/providers/CommandPaletteProvider";
import { LeadCollaborationGrantListener } from "@/components/leads/LeadCollaborationGrantListener";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ProfileProvider } from "@/components/sla/ProfileProvider";
import { SLAProvider } from "@/components/sla/SLAProvider";
import type { Profile } from "@/lib/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, domain, department, job_title, reports_to, is_active, created_at, updated_at",
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

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
