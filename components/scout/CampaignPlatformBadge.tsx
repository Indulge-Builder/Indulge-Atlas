"use client";

import { Facebook, Search, Globe, CalendarDays, UserRound } from "lucide-react";
import type { AdPlatform } from "@/lib/types/database";

const PLATFORM_CONFIG: Record<
  AdPlatform,
  { label: string; icon: React.FC<{ className?: string }>; className: string }
> = {
  meta: {
    label: "Meta",
    icon: Facebook,
    className: "text-[#1877F2] bg-[#EEF4FF] border-[#C7DBFF]",
  },
  google: {
    label: "Google",
    icon: Search,
    className: "text-[#EA4335] bg-[#FEF2F1] border-[#FCCFCB]",
  },
  website: {
    label: "Website",
    icon: Globe,
    className: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  events: {
    label: "Events",
    icon: CalendarDays,
    className: "text-violet-600 bg-violet-50 border-violet-200",
  },
  referral: {
    label: "Referral",
    icon: UserRound,
    className: "text-amber-600 bg-amber-50 border-amber-200",
  },
};

interface CampaignPlatformBadgeProps {
  platform: AdPlatform;
  variant?: "light" | "dark";
}

export function CampaignPlatformBadge({ platform, variant = "light" }: CampaignPlatformBadgeProps) {
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.website;
  const Icon = config.icon;

  if (variant === "dark") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.12]">
        <Icon className="w-3 h-3 text-white/60 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
          {config.label}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border shrink-0 ${config.className}`}
    >
      <Icon className="w-3 h-3" />
      <span className="text-[10px] font-semibold uppercase tracking-wider">{config.label}</span>
    </span>
  );
}
