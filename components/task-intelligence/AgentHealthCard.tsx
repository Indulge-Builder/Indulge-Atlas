"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import { DEPARTMENT_CONFIG } from "@/lib/constants/departments";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { EmployeeDepartment, Profile } from "@/lib/types/database";

function cardInitials(fullName: string): string {
  const parts = fullName.trim().split(" ");
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export interface AgentHealthCardProps {
  profile: Profile;
  activeTaskCount?: number;
  isOnLeave?: boolean;
  href: string;
}

export function AgentHealthCard({
  profile,
  activeTaskCount = 0,
  isOnLeave = false,
  href,
}: AgentHealthCardProps) {
  const dept = profile.department as EmployeeDepartment | null;
  const deptColor =
    dept && DEPARTMENT_CONFIG[dept]
      ? DEPARTMENT_CONFIG[dept].accentColor
      : "#78716c";

  const showActiveRow = activeTaskCount > 0;

  return (
    <Link
      href={href}
      data-agent-card
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm", overflow: "visible" }),
        "group relative flex w-[200px] shrink-0 flex-col overflow-hidden text-left transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-[#D4AF37]/35 hover:shadow-[0_8px_28px_-8px_rgb(90_85_75/0.12)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F9F6]",
        isOnLeave && "opacity-[0.72] saturate-[0.85]",
      )}
      aria-label={`Open dossier for ${profile.full_name}`}
    >
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: deptColor }}
        aria-hidden
      />

      <motion.div
        whileTap={{ scale: 0.98 }}
        className="flex flex-col items-center gap-3 px-4 pb-4 pt-3.5 text-center"
      >
        <div
          className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border-2 bg-gradient-to-br from-[#EDEAE4] to-[#E0DDD6] font-[family-name:var(--font-playfair)] text-lg font-semibold text-[#5c5346]"
          style={{ borderColor: `${deptColor}88` }}
        >
          {cardInitials(profile.full_name)}
        </div>

        <div className="w-full min-w-0 space-y-0.5">
          <p className="line-clamp-2 text-center font-[family-name:var(--font-playfair)] text-[15px] font-semibold leading-snug text-stone-900">
            {profile.full_name}
          </p>
          <p className="line-clamp-2 min-h-[2.25rem] text-center text-[11px] leading-snug text-stone-500">
            {(profile.job_title ?? "").trim() ? (
              profile.job_title
            ) : (
              <span className="text-stone-400 italic">No title on file</span>
            )}
          </p>
        </div>

        {showActiveRow && (
          <div className="flex w-full flex-col items-stretch text-[11px]">
            <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F9F9F6] px-2 py-1.5 text-stone-600 ring-1 ring-[#E5E4DF]/90">
              <Layers className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
              <span>
                <span className="font-semibold tabular-nums text-stone-800">
                  {activeTaskCount}
                </span>{" "}
                active
              </span>
            </span>
          </div>
        )}
      </motion.div>
    </Link>
  );
}
