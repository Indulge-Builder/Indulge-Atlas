import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAllProfiles } from "@/lib/actions/admin";
import { TopBar } from "@/components/layout/TopBar";
import { UsersTable, UsersTableSkeleton } from "@/components/admin/UsersTable";

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

  if (
    !profile?.role ||
    !["admin", "founder", "manager"].includes(profile.role)
  ) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="User Management"
        subtitle="Create and manage CRM access for your team"
      />

      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6">
        <Suspense fallback={<UsersTableSkeleton />}>
          <AdminContent userId={user.id} />
        </Suspense>
      </div>
    </div>
  );
}
