import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { FieldMappingsClient } from "@/components/admin/mappings/FieldMappingsClient";

export const dynamic = "force-dynamic";

export default async function AdminMappingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (rawProfile as { role: string } | null)?.role;
  if (role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="ETL Field Mapping Engine"
        subtitle="Visually map incoming Pabbly / webhook JSON keys to leads table columns — no code changes required."
      />

      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-8 lg:px-8">
        <FieldMappingsClient />
      </div>
    </div>
  );
}
