import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCampaignStats } from "@/lib/actions/manager";
import { CampaignsTable } from "@/components/manager/CampaignsTable";
import { CampaignsTabs } from "@/components/manager/CampaignsTabs";
import { SyncButton } from "@/components/manager/SyncButton";
import { TopBar } from "@/components/layout/TopBar";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";

// ── Server-side role guard ────────────────────────────────────

async function getAuthorisedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.role === "agent") redirect("/");

  return profile;
}

// ── Skeleton for table loading state ─────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-3 pt-2 px-4 pb-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-[220px]" />
          <Skeleton className="h-4 w-20 ml-auto" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Per-platform data components (each is its own Suspense target) ───

async function MetaCampaigns() {
  const campaigns = await getCampaignStats("meta");
  return <CampaignsTable campaigns={campaigns} platform="meta" />;
}

async function GoogleCampaigns() {
  const campaigns = await getCampaignStats("google");
  return <CampaignsTable campaigns={campaigns} platform="google" />;
}

async function WebsiteCampaigns() {
  const campaigns = await getCampaignStats("website");
  return <CampaignsTable campaigns={campaigns} platform="website" />;
}

async function EventsCampaigns() {
  const campaigns = await getCampaignStats("events");
  return <CampaignsTable campaigns={campaigns} platform="events" />;
}

async function ReferralCampaigns() {
  const campaigns = await getCampaignStats("referral");
  return <CampaignsTable campaigns={campaigns} platform="referral" />;
}

// ── Page ──────────────────────────────────────────────────────

export default async function CampaignsPage() {
  await getAuthorisedProfile();

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Ad Campaigns"
        subtitle="All channel performance"
      />

      <div className="px-8 py-8 max-w-6xl">
        {/* Page Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-[#1A1A1A] text-3xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Campaign Performance
            </h1>
            <p className="text-[#9E9E9E] text-sm mt-1">
              Spend, leads and revenue attribution across all channels.
            </p>
          </div>
          <SyncButton />
        </div>

        {/* Tabs — client-only mount to avoid Radix ID hydration mismatch */}
        <CampaignsTabs
          metaContent={
            <Suspense fallback={<TableSkeleton />}>
              <MetaCampaigns />
            </Suspense>
          }
          googleContent={
            <Suspense fallback={<TableSkeleton />}>
              <GoogleCampaigns />
            </Suspense>
          }
          websiteContent={
            <Suspense fallback={<TableSkeleton />}>
              <WebsiteCampaigns />
            </Suspense>
          }
          eventsContent={
            <Suspense fallback={<TableSkeleton />}>
              <EventsCampaigns />
            </Suspense>
          }
          referralContent={
            <Suspense fallback={<TableSkeleton />}>
              <ReferralCampaigns />
            </Suspense>
          }
        />
      </div>
    </div>
  );
}
