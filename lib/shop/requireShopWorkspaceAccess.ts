import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessShopSurfaces } from "@/lib/shop/access";
import type { Profile } from "@/lib/types/database";

/** Use from shop workspace server pages (not a Server Action). */
export async function requireShopWorkspaceAccess(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: raw } = await supabase
    .from("profiles")
    .select("role, domain")
    .eq("id", user.id)
    .single();

  const profile = raw as Pick<Profile, "role" | "domain"> | null;
  if (!profile || !canAccessShopSurfaces(profile)) {
    redirect("/");
  }
}
