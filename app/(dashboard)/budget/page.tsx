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

  // getAllBudgetData calls getAuthUser() internally (React.cache dedupes auth.getUser()).
  // role comes back from the cached profile — no separate profiles query needed.
  const initialData = await getAllBudgetData();
  const { role } = initialData;

  if (!["founder", "admin", "super_admin"].includes(role)) redirect("/");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <BudgetClient initialData={initialData} />
    </div>
  );
}
