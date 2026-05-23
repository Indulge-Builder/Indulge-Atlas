import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Uses the service role client (no cookies) so it's safe inside unstable_cache.
// Fetches the full profile shape needed by both the layout and all server actions.
const getCachedProfile = unstable_cache(
  async (userId: string) => {
    const supabase = getServiceSupabaseClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, role, domain, department, job_title, reports_to, is_active, created_at, updated_at",
      )
      .eq("id", userId)
      .single();
    return data;
  },
  ["auth-profile"],
  { revalidate: 600 }
);

// React.cache deduplicates auth.getUser() across parallel RSC calls in one render pass.
// unstable_cache deduplicates the profile DB query across render passes (10-min TTL).
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");

  const profile = await getCachedProfile(user.id);

  const role = (profile?.role ?? "agent") as string;
  const domain = (profile?.domain ?? "indulge_concierge") as string;
  const department = (profile?.department ?? null) as string | null;

  return { supabase, user, role, domain, department, profile };
});
