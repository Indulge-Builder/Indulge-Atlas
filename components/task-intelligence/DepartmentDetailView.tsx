"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { toast } from "sonner";
import type { DepartmentTaskOverview, EmployeeDepartment } from "@/lib/types/database";
import { getDepartmentGroupTasks, getDepartmentIndividualTasks } from "@/lib/actions/task-intelligence";
import type { DepartmentGroupTaskBundle } from "@/lib/actions/task-intelligence";
import type { TaskIntelligenceAgentSummary } from "@/lib/types/database";
import { DepartmentModalSkeleton } from "./DepartmentModalSkeleton";
import { DepartmentGroupTasksView } from "./DepartmentGroupTasksView";
import { DepartmentIndividualTasksView } from "./DepartmentIndividualTasksView";

const BADGE = {
  critical: "bg-[#EF4444]/12 text-[#B91C1C] border-[#EF4444]/25",
  needs_attention: "bg-[#D4AF37]/15 text-[#8B7320] border-[#D4AF37]/30",
  healthy: "bg-[#10B981]/12 text-[#047857] border-[#10B981]/25",
} as const;

const BADGE_LABEL = {
  critical: "Critical",
  needs_attention: "Needs Attention",
  healthy: "On Track",
} as const;

type TabKey = "group" | "individual";

function getLucideIcon(name: string) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[name] ?? LucideIcons.Sparkles;
}

interface DepartmentDetailViewProps {
  overview: DepartmentTaskOverview;
  currentUser: { id: string; full_name: string; job_title: string | null; role: string };
}

export function DepartmentDetailView({ overview, currentUser }: DepartmentDetailViewProps) {
  const [tab, setTab] = useState<TabKey>("group");
  const [loading, setLoading] = useState(false);
  const [bundles, setBundles] = useState<DepartmentGroupTaskBundle[]>([]);
  const [agents, setAgents] = useState<TaskIntelligenceAgentSummary[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setTab("group");
    setLoading(true);
    const dept = overview.departmentId;
    startTransition(() => {
      void (async () => {
        const [g, i] = await Promise.all([
          getDepartmentGroupTasks({ departmentId: dept }),
          getDepartmentIndividualTasks({ departmentId: dept }),
        ]);
        if (!g.success) toast.error(g.error ?? "Could not load group tasks.");
        else setBundles(g.data ?? []);
        if (!i.success) toast.error(i.error ?? "Could not load agents.");
        else setAgents(i.data?.agents ?? []);
        setLoading(false);
      })();
    });
  }, [overview.departmentId]);

  const Icon = getLucideIcon(overview.icon);
  const noGroupTasks = overview.activeMasterTaskCount === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#E5E4DF] bg-[#F9F9F6] px-6 py-4 sm:px-8">
        <Link
          href="/task-insights"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to Task Insights
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-6 sm:px-8 sm:py-8">
        <div
          className={cn(
            "flex min-h-[min(92vh,880px)] flex-col overflow-hidden",
            surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "hidden" }),
            noGroupTasks && "brightness-[0.97] saturate-[0.92]",
          )}
        >
          <header className="shrink-0 border-b border-[#E5E4DF] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${overview.accentColor}20` }}
                >
                  <Icon className="h-6 w-6" style={{ color: overview.accentColor }} />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate font-serif text-2xl font-semibold text-[#1A1A1A]">
                    {overview.label}
                  </h1>
                  <div className="mt-3 flex flex-wrap gap-3 text-[13px] text-[#6B6B6B]">
                    <span>
                      <strong className="text-[#1A1A1A]">{overview.activeMasterTaskCount}</strong>{" "}
                      group
                    </span>
                    <span className="text-[#E5E4DF]">|</span>
                    <span>
                      <strong className="text-[#1A1A1A]">{overview.groupSubtaskCompletionPct}%</strong>{" "}
                      completion
                    </span>
                    <span className="text-[#E5E4DF]">|</span>
                    <span
                      className={cn(overview.overdueSubtaskCount > 0 ? "font-medium text-[#C0392B]" : "")}
                    >
                      <strong>{overview.overdueSubtaskCount}</strong> overdue
                    </span>
                    <span className="text-[#E5E4DF]">|</span>
                    <span>
                      <strong className="text-[#1A1A1A]">{overview.todaySopCompletionPct}%</strong> SOPs
                      today
                    </span>
                  </div>
                </div>
              </div>
              <span
                className={cn(
                  "hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide sm:inline",
                  BADGE[overview.healthSignal],
                )}
              >
                {BADGE_LABEL[overview.healthSignal]}
              </span>
            </div>

            <div
              role="tablist"
              aria-label="Department detail"
              className="mt-5 flex gap-8 border-b border-[#E5E4DF]"
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setTab("individual");
                }
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setTab("group");
                }
              }}
            >
              {(["group", "individual"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  tabIndex={tab === key ? 0 : -1}
                  onClick={() => setTab(key)}
                  className={cn(
                    "relative pb-2.5 text-[13px] font-medium transition-colors",
                    tab === key ? "text-[#1A1A1A]" : "text-[#8A8A6E] hover:text-[#1A1A1A]",
                  )}
                >
                  {key === "group" ? "Group Tasks" : "Individual Tasks"}
                  {tab === key && (
                    <motion.span
                      layoutId="ti-dept-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {loading ? (
              <DepartmentModalSkeleton />
            ) : tab === "group" ? (
              <DepartmentGroupTasksView
                departmentId={overview.departmentId as EmployeeDepartment}
                initialBundles={bundles}
                currentUser={currentUser}
              />
            ) : (
              <DepartmentIndividualTasksView
                agents={agents}
                departmentId={overview.departmentId}
                currentUser={currentUser}
                returnToPath={`/task-insights/${overview.departmentId}`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
