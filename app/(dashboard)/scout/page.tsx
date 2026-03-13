import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBriefingData } from "@/lib/actions/briefing";
import { TopBar } from "@/components/layout/TopBar";
import { BriefingHero } from "@/components/scout/BriefingHero";
import { WorldClock } from "@/components/scout/WorldClock";
import { AttentionDeck } from "@/components/scout/AttentionDeck";
import { CommsStub } from "@/components/scout/CommsStub";

export const dynamic = "force-dynamic";

// ── Dark shimmer skeleton ─────────────────────────────────────
// Matches the exact layout so the page never jumps when data
// streams in. Shimmers use white/[0.05] against the canvas.

function BriefingSkeleton() {
  return (
    <>
      {/* TopBar ghost */}
      <div className="sticky top-0 z-30 h-[65px] border-b border-[#E5E4DF]
                      bg-[#F9F9F6]/80 backdrop-blur-md" />

      <div className="px-8 py-10">
        {/* Welcome hero skeleton */}
        <div className="mb-8 space-y-3">
          <div className="h-3 w-56 rounded-lg bg-black/[0.04] animate-pulse" />
          <div className="h-10 w-80 rounded-xl bg-black/[0.06] animate-pulse" />
          <div className="h-4 w-[460px] max-w-full rounded-lg bg-black/[0.04] animate-pulse" />
        </div>

        {/* Bento grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-3 h-[340px] rounded-2xl bg-black/[0.04] animate-pulse" />
          <div className="lg:col-span-5 h-[340px] rounded-2xl bg-black/[0.04] animate-pulse" />
          <div className="lg:col-span-4 h-[340px] rounded-2xl bg-black/[0.04] animate-pulse" />
        </div>
      </div>
    </>
  );
}

// ── Async content — streams behind Suspense ───────────────────

async function BriefingContent({ userId }: { userId: string }) {
  const data = await getBriefingData(userId);

  return (
    <>
      <TopBar
        title="Morning Briefing."
        subtitle="Scout Intelligence Overview"
      />

      {/* Standard paper — matches all other dashboard pages */}
      <div className="px-8 py-10">
        <div className="max-w-[1400px] mx-auto">

          {/* Welcome hero — animated by BriefingHero (client) */}
          <BriefingHero
            greeting={data.greeting}
            firstName={data.firstName}
            summaryLine={data.summaryLine}
            attentionCount={data.attentionCount}
          />

          {/* ── Bento grid ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

            {/* ── Left: World Clock ────────────── (3/12) ── */}
            <div className="lg:col-span-3">
              <WorldClock />
            </div>

            {/* ── Centre: Attention Required ───── (5/12) ── */}
            <div className="lg:col-span-5">
              <AttentionDeck alerts={data.alerts} />
            </div>

            {/* ── Right: Comms Stub ────────────── (4/12) ── */}
            <div className="lg:col-span-4">
              <CommsStub />
            </div>
          </div>

          {/* Subtle bottom spacer */}
          <div className="h-12" />
        </div>
      </div>
    </>
  );
}

// ── Page entry point ──────────────────────────────────────────

export default async function ScoutPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Role guard — only scouts (managers) and admins may access this briefing
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["scout", "admin"].includes(profile.role)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen">
      <Suspense fallback={<BriefingSkeleton />}>
        <BriefingContent userId={user.id} />
      </Suspense>
    </div>
  );
}
