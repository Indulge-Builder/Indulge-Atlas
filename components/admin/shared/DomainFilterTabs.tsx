"use client";

import { cn } from "@/lib/utils";
import { DOMAIN_CONFIG } from "@/lib/constants/departments";
import { LEAD_DOMAINS } from "@/lib/types/agentAssignment";
import type { IndulgeDomain } from "@/lib/types/database";

interface DomainFilterTabsProps {
  value: IndulgeDomain | "all";
  onChange: (v: IndulgeDomain | "all") => void;
}

const TABS: { value: IndulgeDomain | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...LEAD_DOMAINS.map((d) => ({ value: d, label: DOMAIN_CONFIG[d].label.replace("Indulge ", "") })),
];

export function DomainFilterTabs({ value, onChange }: DomainFilterTabsProps) {
  return (
    <div className="flex gap-1 bg-[#F2F2EE] rounded-xl p-1 w-fit mb-6 flex-wrap">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
            value === tab.value
              ? "bg-white text-[#1A1814] shadow-sm"
              : "text-[#8C8780] hover:text-[#1A1814]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
