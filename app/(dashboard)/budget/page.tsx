import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BudgetClient } from "@/components/budget/BudgetClient";
import { getAllBudgetData } from "@/lib/actions/budget";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Profile + budget data in parallel — getAllBudgetData re-auths internally but
  // Next.js dedupes the cookie read; the role check below gates access.
  const [{ data: profile }, initialData] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    getAllBudgetData(),
  ]);

  const role = (profile?.role as string) ?? "agent";
  if (!["founder", "admin", "super_admin"].includes(role)) redirect("/");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <BudgetClient initialData={initialData} />
    </div>
  );
}
