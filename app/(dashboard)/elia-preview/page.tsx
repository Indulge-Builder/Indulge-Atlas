import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { EliaChat } from "@/components/elia/EliaChat";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Active member count changes rarely — cache for 5 minutes org-wide
const getCachedMemberCount = unstable_cache(
  async () => {
    const sb = getServiceSupabaseClient();
    const { count } = await sb
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("client_status", "active");
    return count ?? 0;
  },
  ["elia-active-member-count"],
  { revalidate: 300 },
);

export default async function EliaPreviewPage() {
  const supabase = await createClient();

  // Auth + member count in parallel
  const [{ data: { user } }, clientCount] = await Promise.all([
    supabase.auth.getUser(),
    getCachedMemberCount(),
  ]);
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F9F9F6]">
      <EliaChat clientCount={clientCount} />
    </div>
  );
}
