import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskReminderProvider } from "@/components/task-reminder/TaskReminderProvider";
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
    .select("id, full_name, email, role, domain, is_active, created_at, updated_at")
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
      <ChatProvider currentUserId={user.id}>
        <ProfileProvider profile={profile as Profile}>
          <SLAProvider profile={profile as Profile}>
            <div className="layout-canvas min-h-screen">
              <Sidebar profile={profile as Profile} />

              <div className="ml-60 min-h-screen p-3">
                <main
                  className="
                    relative min-h-0
                    bg-[#F9F9F6] rounded-2xl overflow-hidden
                    paper-shadow
                  "
                >
                  {children}
                </main>
              </div>
            </div>
          </SLAProvider>
        </ProfileProvider>
      </ChatProvider>
    </TaskReminderProvider>
  );
}
