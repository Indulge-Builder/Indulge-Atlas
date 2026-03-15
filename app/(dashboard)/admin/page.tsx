import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAllProfiles } from "@/lib/actions/admin";
import { TopBar } from "@/components/layout/TopBar";
import { UsersTable, UsersTableSkeleton } from "@/components/admin/UsersTable";
import type { Profile } from "@/lib/types/database";

export const dynamic = "force-dynamic";

async function AdminContent({ userId }: { userId: string }) {
  const profiles = await getAllProfiles();

  return <UsersTable profiles={profiles} currentUserId={userId} />;
}

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Guard: admin and manager only
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as { role: string } | null;

  if (profile?.role !== "admin" && profile?.role !== "scout") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="User Management"
        subtitle="Create and manage CRM access for your team"
      />

      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6">
        {/* Page intro */}
        <div className="bg-white rounded-xl border border-[#E5E4DF] p-5 mb-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/25 flex items-center justify-center shrink-0">
              <svg
                className="w-5 h-5 text-[#D4AF37]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                />
              </svg>
            </div>
            <div>
              <h2
                className="text-base font-semibold text-[#1A1A1A]"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                Team Access Control
              </h2>
              <p className="text-sm text-[#6B6B6B] mt-1 max-w-xl">
                Manage who has access to the Indulge Global CRM. Create accounts for new
                agents, adjust roles, and deactivate users who no longer require access.
                All actions are instant and protected by Supabase Row Level Security.
              </p>
              <div className="flex items-center gap-4 mt-3">
                <RolePill color="#2C6FAC" bg="#E8F0FA" label="Sales Agent" desc="Leads & tasks access" />
                <RolePill color="#6B4FBB" bg="#F0EBFF" label="Manager" desc="Team oversight" />
                <RolePill color="#C5830A" bg="#FEF3D0" label="Admin" desc="Full system access" />
              </div>
            </div>
          </div>
        </div>

        <Suspense fallback={<UsersTableSkeleton />}>
          <AdminContent userId={user.id} />
        </Suspense>
      </div>
    </div>
  );
}

function RolePill({
  color,
  bg,
  label,
  desc,
}: {
  color: string;
  bg: string;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs font-medium px-2 py-0.5 rounded-full"
        style={{ backgroundColor: bg, color }}
      >
        {label}
      </span>
      <span className="text-xs text-[#B5A99A]">{desc}</span>
    </div>
  );
}
