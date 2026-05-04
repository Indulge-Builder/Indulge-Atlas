import { redirect } from "next/navigation";
import { EliaChat } from "@/components/elia/EliaChat";
import { getEliaActiveMemberCount } from "@/lib/actions/elia";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EliaPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clientCount = await getEliaActiveMemberCount();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F9F9F6]">
      <EliaChat clientCount={clientCount} />
    </div>
  );
}
