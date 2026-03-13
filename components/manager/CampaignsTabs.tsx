"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  { value: "meta", label: "Meta Ads", dot: "#1877F2", title: "Meta Campaigns", subtitle: "Facebook & Instagram performance" },
  { value: "google", label: "Google Ads", dot: "#4285F4", title: "Google Campaigns", subtitle: "Search & Display performance" },
  { value: "website", label: "Website", dot: "#10B981", title: "Website Campaigns", subtitle: "SEO, landing pages & organic traffic" },
  { value: "events", label: "Events", dot: "#8B5CF6", title: "Events", subtitle: "In-person & virtual event performance" },
  { value: "referral", label: "Referrals", dot: "#F59E0B", title: "Referral Channels", subtitle: "Partner & client referral programmes" },
] as const;

interface CampaignsTabsProps {
  metaContent: React.ReactNode;
  googleContent: React.ReactNode;
  websiteContent: React.ReactNode;
  eventsContent: React.ReactNode;
  referralContent: React.ReactNode;
}

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

export function CampaignsTabs({
  metaContent,
  googleContent,
  websiteContent,
  eventsContent,
  referralContent,
}: CampaignsTabsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full">
        <div className="flex gap-1 mb-6 p-1 bg-white border border-[#EAEAEA] rounded-xl w-auto">
          {TABS.map((tab) => (
            <Skeleton key={tab.value} className="h-9 w-24 rounded-lg" />
          ))}
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-[#F0F0EC]">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <TableSkeleton />
        </div>
      </div>
    );
  }

  const contentMap = {
    meta: metaContent,
    google: googleContent,
    website: websiteContent,
    events: eventsContent,
    referral: referralContent,
  };

  return (
    <Tabs defaultValue="meta" className="w-full">
      <TabsList className="bg-white border border-[#EAEAEA] p-1 rounded-xl mb-6 h-auto w-auto gap-1 flex-wrap">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="rounded-lg px-5 py-2 text-sm font-medium text-[#9E9E9E] data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-white data-[state=active]:shadow-none transition-all"
          >
            <span className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: tab.dot }}
              />
              {tab.label}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map(({ value, title, subtitle }) => (
        <TabsContent key={value} value={value}>
          <div className="bg-white border border-[#EAEAEA] rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[#F0F0EC]">
              <h2
                className="text-[#1A1A1A] font-semibold"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {title}
              </h2>
              <p className="text-[#9E9E9E] text-xs mt-0.5">{subtitle}</p>
            </div>
            <div className="px-2">{contentMap[value]}</div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
