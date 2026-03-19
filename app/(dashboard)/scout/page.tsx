import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getYesterdayBriefing } from "@/lib/actions/briefing";
import { canViewExecutiveData } from "@/lib/briefing/executiveBriefing";
import { MorningBriefing } from "@/components/scout/MorningBriefing";

export const dynamic = "force-dynamic";

function BriefingSkeleton() {
  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 h-7 w-48 rounded-lg bg-black/5 animate-pulse" />
        <div className="mb-4 h-4 w-64 rounded-md bg-black/4 animate-pulse" />
        <div className="mb-8 min-h-18 rounded-2xl border border-stone-200/60 bg-stone-50/80 pl-5 pr-4 py-4">
          <div className="h-4 w-full max-w-2xl rounded bg-black/4 animate-pulse" />
          <div className="mt-2 h-4 w-4/5 max-w-xl rounded bg-black/3 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 rounded bg-black/4 animate-pulse" />
              <div className="h-8 w-12 rounded bg-black/5 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function BriefingContent() {
  const yesterdayBriefing = await getYesterdayBriefing();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-[1400px]">
        {yesterdayBriefing ? (
          <MorningBriefing briefing={yesterdayBriefing} />
        ) : null}
      </div>
    </div>
  );
}

export default async function ScoutPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !canViewExecutiveData(profile.role)) {
    redirect("/");
  }

  return (
    <div>
      <Suspense fallback={<BriefingSkeleton />}>
        <BriefingContent />
      </Suspense>
    </div>
  );
}
