"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProfile } from "@/components/sla/ProfileProvider";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import type { IndulgeDomain } from "@/lib/types/database";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const DOMAINS: IndulgeDomain[] = [
  "indulge_concierge",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
];

interface DomainSwitcherProps {
  variant?: "default" | "dark";
}

export function DomainSwitcher({ variant = "default" }: DomainSwitcherProps) {
  const [mounted, setMounted] = useState(false);
  const profile = useProfile();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPrivileged =
    profile?.role === "admin" ||
    profile?.role === "founder" ||
    profile?.role === "manager";
  if (!mounted || !isPrivileged || !profile?.domain) return null;

  const currentDomain = (searchParams.get("domain") as IndulgeDomain) || null;
  const displayDomain = currentDomain ?? profile.domain;
  const config = DOMAIN_DISPLAY_CONFIG[displayDomain] ?? {
    shortLabel: displayDomain?.replace(/_/g, " ") ?? "All",
    ringColor: "rgba(212,175,55,0.3)",
  };

  const isDark = variant === "dark";

  function setDomain(domain: IndulgeDomain | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (domain) {
      params.set("domain", domain);
    } else {
      params.delete("domain");
    }
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors duration-150",
            isDark
              ? "bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/80"
              : "bg-black/[0.04] hover:bg-black/[0.08] border border-black/[0.06] text-[#1A1A1A]/80",
          )}
          style={{
            boxShadow: `0 0 0 1px ${config.ringColor}30`,
          }}
        >
          <span>{config.shortLabel}</span>
          <ChevronDown
            className={cn(
              "w-3 h-3",
              isDark ? "text-white/50" : "text-[#1A1A1A]/50",
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "min-w-[160px]",
          isDark ? "bg-[#1a1917] border-white/10" : "bg-white border-[#E5E4DF]",
        )}
      >
        <DropdownMenuItem
          onClick={() => setDomain(null)}
          className={cn(
            !currentDomain ? "bg-[#D4AF37]/10 text-[#D4AF37]" : "",
            isDark
              ? "text-white/80 hover:bg-white/[0.06]"
              : "text-[#1A1A1A] hover:bg-[#F2F2EE]",
          )}
        >
          All Domains
        </DropdownMenuItem>
        {DOMAINS.map((d) => {
          const cfg = DOMAIN_DISPLAY_CONFIG[d];
          return (
            <DropdownMenuItem
              key={d}
              onClick={() => setDomain(d)}
              className={cn(
                currentDomain === d ? "bg-[#D4AF37]/10 text-[#D4AF37]" : "",
                isDark
                  ? "text-white/80 hover:bg-white/[0.06]"
                  : "text-[#1A1A1A] hover:bg-[#F2F2EE]",
              )}
            >
              {cfg?.shortLabel ?? d.replace(/_/g, " ")}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
