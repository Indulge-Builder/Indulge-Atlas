"use client";

import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import type { DepartmentTaskOverview, TaskIntelligenceHealthSignal } from "@/lib/types/database";

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
}

export function DepartmentHealthCard({ overview, href }: DepartmentHealthCardProps) {
  const Icon = getLucideIcon(overview.icon);
  const noGroupTasks = overview.activeMasterTaskCount === 0;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full min-h-0 flex-col cursor-pointer rounded-xl text-left outline-none transition-[filter,box-shadow] duration-300",
        surfaceCardVariants({ tone: "luxury", elevation: "sm", overflow: "hidden" }),
        "hover:shadow-[0_12px_40px_-12px_rgb(0_0_0/0.12)]",
        noGroupTasks && "brightness-[0.94] saturate-[0.86] hover:brightness-[0.99] hover:saturate-[0.94]",
      )}
      aria-label={`Open ${overview.label} in Task Insights`}
    >
      <div className={cn("h-1 w-full", HEALTH_BAR[overview.healthSignal])} />

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${overview.accentColor}18` }}
          >
            <Icon className="h-[18px] w-[18px]" style={{ color: overview.accentColor }} />
          </div>
          <h2 className="truncate font-serif text-[15px] font-semibold text-[#1A1A1A]">
            {overview.label}
          </h2>
        </div>

        <div className="grid grid-cols-4 gap-0 border-y border-[#E5E4DF]/80 py-2.5">
          <Metric label="Group" value={String(overview.activeMasterTaskCount)} />
          <div className="border-l border-[#E5E4DF]/80 pl-2.5">
            <Metric label="Done %" value={`${overview.groupSubtaskCompletionPct}%`} />
          </div>
          <div className="border-l border-[#E5E4DF]/80 pl-2.5">
            <Metric
              label="Late"
              value={String(overview.overdueSubtaskCount)}
              valueClassName={
                overview.overdueSubtaskCount > 0 ? "text-[#C0392B]" : "text-[#8A8A6E]"
              }
            />
          </div>
          <div className="border-l border-[#E5E4DF]/80 pl-2.5">
            <Metric label="SOP" value={`${overview.todaySopCompletionPct}%`} />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between pt-3 text-[11px]">
          <span className="text-[#6B6B6B]">
            <span className="font-semibold text-[#1A1A1A]">{overview.activeAgentCount}</span> active agents
          </span>
          <span className="text-[#D4AF37] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            View Details →
          </span>
        </div>
      </div>
    </Link>
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
      <p className={cn("text-[17px] font-semibold tabular-nums leading-none text-[#1A1A1A]", valueClassName)}>
        {value}
      </p>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-[#8A8A6E]">{label}</p>
    </div>
  );
}
