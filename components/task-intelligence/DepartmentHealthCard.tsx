"use client";

import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import type { DepartmentTaskOverview, TaskIntelligenceHealthSignal } from "@/lib/types/database";

/** Health strip + badge colours (tokens + brand per spec). */
const HEALTH_BAR = {
  critical:       "bg-[#EF4444]",
  needs_attention: "bg-[#D4AF37]/70",
  healthy:        "bg-[#10B981]",
} as const satisfies Record<TaskIntelligenceHealthSignal, string>;

const BADGE_STYLES: Record<
  TaskIntelligenceHealthSignal,
  { label: string; className: string }
> = {
  critical: {
    label: "Critical",
    className: "bg-[#EF4444]/12 text-[#B91C1C] border-[#EF4444]/25",
  },
  needs_attention: {
    label: "Needs Attention",
    className: "bg-[#D4AF37]/15 text-[#8B7320] border-[#D4AF37]/30",
  },
  healthy: {
    label: "On Track",
    className: "bg-[#10B981]/12 text-[#047857] border-[#10B981]/25",
  },
};

function getLucideIcon(name: string) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[name] ?? LucideIcons.Sparkles;
}

interface DepartmentHealthCardProps {
  overview: DepartmentTaskOverview;
  onOpen: () => void;
  layout?: boolean;
}

export function DepartmentHealthCard({ overview, onOpen, layout = true }: DepartmentHealthCardProps) {
  const Icon = getLucideIcon(overview.icon);
  const badge = BADGE_STYLES[overview.healthSignal];

  return (
    <motion.article
      layout={layout}
      variants={{
        hidden: { opacity: 0, y: 10 },
        show:   { opacity: 1, y: 0 },
      }}
      className={cn(
        "group relative cursor-pointer rounded-xl text-left outline-none transition-shadow duration-300",
        surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "hidden" }),
        "hover:shadow-[0_12px_40px_-12px_rgb(0_0_0/0.12)]",
      )}
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open ${overview.label} in Task Insights`}
    >
      <div className={cn("h-1 w-full", HEALTH_BAR[overview.healthSignal])} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${overview.accentColor}18` }}
            >
              <Icon className="w-5 h-5" style={{ color: overview.accentColor }} />
            </div>
            <h2 className="font-serif text-lg font-semibold text-[#1A1A1A] truncate">{overview.label}</h2>
          </div>
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border",
              badge.className,
            )}
          >
            {badge.label}
          </span>
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
    </motion.article>
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
