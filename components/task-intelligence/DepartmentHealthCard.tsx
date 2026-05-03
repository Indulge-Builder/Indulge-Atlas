"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import type { DepartmentTaskOverview, TaskIntelligenceHealthSignal } from "@/lib/types/database";

const MotionLink = motion(Link);

/** Top accent strip by health signal. */
const HEALTH_BAR = {
  critical:       "bg-[#EF4444]",
  needs_attention: "bg-[#D4AF37]/70",
  healthy:        "bg-[#10B981]",
} as const satisfies Record<TaskIntelligenceHealthSignal, string>;

function getLucideIcon(name: string) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[name] ?? LucideIcons.Sparkles;
}

interface DepartmentHealthCardProps {
  overview: DepartmentTaskOverview;
  href: string;
  layout?: boolean;
}

export function DepartmentHealthCard({ overview, href, layout = true }: DepartmentHealthCardProps) {
  const Icon = getLucideIcon(overview.icon);
  const noGroupTasks = overview.activeMasterTaskCount === 0;

  return (
    <MotionLink
      href={href}
      layout={layout}
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 },
      }}
      className={cn(
        "group relative block cursor-pointer rounded-xl text-left outline-none transition-[filter,box-shadow] duration-300",
        surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "hidden" }),
        "hover:shadow-[0_12px_40px_-12px_rgb(0_0_0/0.12)]",
        noGroupTasks && "brightness-[0.94] saturate-[0.86] hover:brightness-[0.99] hover:saturate-[0.94]",
      )}
      aria-label={`Open ${overview.label} in Task Insights`}
    >
      <div className={cn("h-1 w-full", HEALTH_BAR[overview.healthSignal])} />

      <div className="p-5">
        <div className="mb-4 flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${overview.accentColor}18` }}
          >
            <Icon className="w-5 h-5" style={{ color: overview.accentColor }} />
          </div>
          <h2 className="font-serif text-lg font-semibold text-[#1A1A1A] truncate">{overview.label}</h2>
        </div>

        <div className="grid grid-cols-4 gap-0 border-y border-[#E5E4DF]/80 py-3">
          <Metric label="Group Tasks" value={String(overview.activeMasterTaskCount)} />
          <div className="border-l border-[#E5E4DF]/80 pl-3">
            <Metric label="Completion" value={`${overview.groupSubtaskCompletionPct}%`} />
          </div>
          <div className="border-l border-[#E5E4DF]/80 pl-3">
            <Metric
              label="Overdue"
              value={String(overview.overdueSubtaskCount)}
              valueClassName={
                overview.overdueSubtaskCount > 0 ? "text-[#C0392B]" : "text-[#8A8A6E]"
              }
            />
          </div>
          <div className="border-l border-[#E5E4DF]/80 pl-3">
            <Metric label="SOPs Today" value={`${overview.todaySopCompletionPct}%`} />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 text-[12px]">
          <span className="text-[#6B6B6B]">
            <span className="font-semibold text-[#1A1A1A]">{overview.activeAgentCount}</span> active agents
          </span>
          <span className="text-[#D4AF37] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            View Details →
          </span>
        </div>
      </div>
    </MotionLink>
  );
}

function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="pr-2">
      <p className={cn("text-xl font-semibold tabular-nums text-[#1A1A1A]", valueClassName)}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#8A8A6E] mt-0.5">{label}</p>
    </div>
  );
}
