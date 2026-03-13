import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ProfileDossier } from "@/components/profile/ProfileDossier";
import type { Profile } from "@/lib/types/database";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen">
      <TopBar
        title="My Dossier."
        subtitle="Personal & professional details"
      />
      <ProfileDossier profile={profile as Profile} />
    </div>
  );
}
