import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabaseClient } from "@/lib/supabase/service";
import type {
  EmployeeDepartment,
  IndulgeDomain,
  UserRole,
} from "@/lib/types/database";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Uses the service role client (no cookies) so it's safe inside unstable_cache.
// Fetches the full profile shape needed by both the layout and all server actions.
const getCachedProfile = (userId: string) =>
  unstable_cache(
    async () => {
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
    ["auth-profile", userId],
    { revalidate: 600 },
  )();

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

  /*
   * Typed to the real unions rather than `string`. These come straight from
   * `profiles`, whose columns are Postgres enums, so widening them to `string`
   * only pushed the cast out to every caller — and callers with a genuinely
   * typed signature (e.g. `isBishopOrAdmin`) then failed to compile.
   */
  const role = (profile?.role ?? "agent") as UserRole;
  const domain = (profile?.domain ?? "indulge_concierge") as IndulgeDomain;
  const department = (profile?.department ?? null) as EmployeeDepartment | null;

  return { supabase, user, role, domain, department, profile };
});
