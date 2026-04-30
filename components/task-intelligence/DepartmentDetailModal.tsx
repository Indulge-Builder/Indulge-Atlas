"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
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
  critical:        "bg-[#EF4444]/12 text-[#B91C1C] border-[#EF4444]/25",
  needs_attention: "bg-[#D4AF37]/15 text-[#8B7320] border-[#D4AF37]/30",
  healthy:         "bg-[#10B981]/12 text-[#047857] border-[#10B981]/25",
} as const;

const BADGE_LABEL = {
  critical:        "Critical",
  needs_attention: "Needs Attention",
  healthy:         "On Track",
} as const;

type TabKey = "group" | "individual";

function getLucideIcon(name: string) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[name] ?? LucideIcons.Sparkles;
}

interface DepartmentDetailModalProps {
  open: boolean;
  overview: DepartmentTaskOverview | null;
  onClose: () => void;
  currentUser: { id: string; full_name: string; job_title: string | null };
}

export function DepartmentDetailModal({
  open,
  overview,
  onClose,
  currentUser,
}: DepartmentDetailModalProps) {
  const [tab, setTab] = useState<TabKey>("group");
  const [loading, setLoading] = useState(false);
  const [bundles, setBundles] = useState<DepartmentGroupTaskBundle[]>([]);
  const [agents, setAgents] = useState<TaskIntelligenceAgentSummary[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !overview) return;
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
  }, [open, overview?.departmentId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!overview) return null;

  const Icon = getLucideIcon(overview.icon);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "relative z-10 w-full max-w-[1100px] max-h-[min(92vh,880px)] flex flex-col overflow-hidden",
              surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "hidden" }),
            )}
          >
            <header className="shrink-0 border-b border-[#E5E4DF] px-5 sm:px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${overview.accentColor}20` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: overview.accentColor }} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-serif text-2xl font-semibold text-[#1A1A1A] truncate">{overview.label}</h2>
                    <div className="flex flex-wrap gap-3 mt-3 text-[13px] text-[#6B6B6B]">
                      <span>
                        <strong className="text-[#1A1A1A]">{overview.activeMasterTaskCount}</strong> group
                      </span>
                      <span className="text-[#E5E4DF]">|</span>
                      <span>
                        <strong className="text-[#1A1A1A]">{overview.groupSubtaskCompletionPct}%</strong> completion
                      </span>
                      <span className="text-[#E5E4DF]">|</span>
                      <span
                        className={cn(
                          overview.overdueSubtaskCount > 0 ? "text-[#C0392B] font-medium" : "",
                        )}
                      >
                        <strong>{overview.overdueSubtaskCount}</strong> overdue
                      </span>
                      <span className="text-[#E5E4DF]">|</span>
                      <span>
                        <strong className="text-[#1A1A1A]">{overview.todaySopCompletionPct}%</strong> SOPs today
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border hidden sm:inline",
                      BADGE[overview.healthSignal],
                    )}
                  >
                    {BADGE_LABEL[overview.healthSignal]}
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-[#F2F2EE] text-[#6B6B6B]"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Department detail"
                className="flex gap-8 mt-5 border-b border-[#E5E4DF]"
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
                        layoutId="ti-tab-underline"
                        className="absolute left-0 right-0 bottom-0 h-0.5 bg-[#D4AF37]"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto min-h-0 px-5 sm:px-6 py-5">
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
                />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
