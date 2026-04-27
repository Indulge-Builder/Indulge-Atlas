"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CampaignPlatformBadge } from "@/components/manager/CampaignPlatformBadge";
import { CampaignDossierSummary } from "@/components/manager/CampaignDossierSummary";
import type { CampaignDossierData } from "@/lib/actions/campaigns";

const DOSSIER_TABS = [
  { id: "summary", label: "Summary" },
  { id: "leads", label: "Leads" },
  { id: "settings", label: "Settings" },
] as const;

function formatRuntime(createdAt: string): string {
  const start = new Date(createdAt);
  const now = new Date();
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  if (days < 1) return "Less than 1 day";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month";
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year" : `${years} years`;
}

interface CampaignDossierClientProps {
  campaignId: string;
  dossier: CampaignDossierData;
  leadsTab: React.ReactNode;
}

export function CampaignDossierClient({
  campaignId,
  dossier,
  leadsTab,
}: CampaignDossierClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const initialTab =
    DOSSIER_TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "summary";
  const [activeTab, setActiveTab] = useState<(typeof DOSSIER_TABS)[number]["id"]>(
    initialTab as (typeof DOSSIER_TABS)[number]["id"]
  );

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && DOSSIER_TABS.some((tab) => tab.id === t)) {
      setActiveTab(t as (typeof DOSSIER_TABS)[number]["id"]);
    }
  }, [searchParams]);

  const runtime = formatRuntime(dossier.campaign.created_at);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <Link
            href="/manager/campaigns"
            className="w-9 h-9 rounded-xl border border-[#E5E4DF] bg-white/60 hover:bg-white flex items-center justify-center text-[#9E9E9E] hover:text-[#1A1A1A] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <CampaignPlatformBadge platform={dossier.campaign.platform} />
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 uppercase tracking-wider">
              Live
            </span>
            <span className="text-xs text-[#9E9E9E] font-medium">
              {runtime} runtime
            </span>
          </div>
        </div>
      </motion.div>

      {/* Sub-navigation tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="inline-flex items-center gap-0.5 p-1 rounded-full bg-white/60 backdrop-blur-sm border border-[#E5E4DF] shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]"
      >
        {DOSSIER_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "leads") {
                  router.replace(`${pathname}?tab=leads`);
                }
              }}
              className="relative px-5 py-2 text-sm font-medium rounded-full transition-colors duration-200"
            >
              {isActive && (
                <motion.span
                  layoutId="dossier-pill-bg"
                  className="absolute inset-0 rounded-full bg-white border border-[#E5E4DF] shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span
                className={`relative z-10 ${
                  isActive ? "text-[#1A1A1A]" : "text-[#9E9E9E] hover:text-[#4A4A4A]"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "summary" && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >
            <CampaignDossierSummary
              campaignId={campaignId}
              dossier={dossier}
            />
          </motion.div>
        )}
        {activeTab === "leads" && (
          <motion.div
            key="leads"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >
            {leadsTab}
          </motion.div>
        )}
        {activeTab === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <p className="text-[#9E9E9E] text-sm">Campaign settings coming soon.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
