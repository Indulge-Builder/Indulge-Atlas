"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { DepartmentTaskOverview, EmployeeDepartment } from "@/lib/types/database";
import { getDepartmentGroupTasks, getDepartmentIndividualTasks } from "@/lib/actions/task-intelligence";
import type { DepartmentGroupTaskBundle } from "@/lib/actions/task-intelligence";
import type { TaskIntelligenceAgentSummary } from "@/lib/types/database";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function getLucideIcon(name: string) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  >;
  return icons[name] ?? LucideIcons.Sparkles;
}

type TabKey = "group" | "agents";

interface DepartmentDetailViewProps {
  overview: DepartmentTaskOverview;
  currentUser: { id: string; full_name: string; job_title: string | null; role: string };
}

export function DepartmentDetailView({ overview, currentUser }: DepartmentDetailViewProps) {
  const [tab, setTab] = useState<TabKey>("group");
  const [groupLoading, setGroupLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [bundles, setBundles] = useState<DepartmentGroupTaskBundle[]>([]);
  const [agents, setAgents] = useState<TaskIntelligenceAgentSummary[]>([]);
  // Track whether the agents tab has ever been opened — gate its first fetch.
  const [agentsTabOpened, setAgentsTabOpened] = useState(false);
  const [, startTransition] = useTransition();

  // Fetch group tasks eagerly — it's the default visible tab.
  useEffect(() => {
    setTab("group");
    setAgentsTabOpened(false);
    setBundles([]);
    setAgents([]);
    setGroupLoading(true);
    const dept = overview.departmentId;
    startTransition(() => {
      void (async () => {
        const g = await getDepartmentGroupTasks({ departmentId: dept });
        if (!g.success) toast.error(g.error ?? "Could not load group tasks.");
        else setBundles(g.data ?? []);
        setGroupLoading(false);
      })();
    });
  }, [overview.departmentId]);

  // Fetch agents only when their tab is first activated.
  useEffect(() => {
    if (!agentsTabOpened) return;
    setAgentsLoading(true);
    const dept = overview.departmentId;
    startTransition(() => {
      void (async () => {
        const i = await getDepartmentIndividualTasks({ departmentId: dept });
        if (!i.success) toast.error(i.error ?? "Could not load agents.");
        else setAgents(i.data?.agents ?? []);
        setAgentsLoading(false);
      })();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsTabOpened]);

  function handleTabChange(key: string) {
    setTab(key as "group" | "agents");
    if (key === "agents" && !agentsTabOpened) setAgentsTabOpened(true);
  }

  const Icon = getLucideIcon(overview.icon);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar: back link + department identity */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/5 bg-[#F9F9F6]/80 px-4 py-4 backdrop-blur-xl md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/task-insights"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#9E9E9E] transition-colors hover:bg-black/4 hover:text-[#1A1A1A]"
            aria-label="Back to Task Insights"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${overview.accentColor}20` }}
            >
              <Icon className="h-[18px] w-[18px]" style={{ color: overview.accentColor }} />
            </div>
            <div className="min-w-0">
              <h1
                className="truncate text-2xl font-semibold leading-tight tracking-tight text-[#1A1A1A] md:text-3xl"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {overview.label}
              </h1>
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
      </header>

      <Tabs
        value={tab}
        onValueChange={handleTabChange}
        indicatorLayoutId="ti-dept-tab-indicator"
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Stats + tab switcher — sticky sub-bar */}
        <div className="sticky top-[65px] z-20 border-b border-[#E5E4DF]/80 bg-[#F9F9F6]/95 px-4 backdrop-blur-md md:px-6 lg:px-8">
          {/* Stats row */}
          <div className="flex flex-wrap gap-4 py-3 text-[13px] text-[#6B6B6B]">
            <span>
              <strong className="text-[#1A1A1A]">{overview.activeMasterTaskCount}</strong> group
            </span>
            <span className="text-[#D5D3CE]">·</span>
            <span>
              <strong className="text-[#1A1A1A]">{overview.groupSubtaskCompletionPct}%</strong> completion
            </span>
            <span className="text-[#D5D3CE]">·</span>
            <span className={cn(overview.overdueSubtaskCount > 0 ? "font-medium text-[#C0392B]" : "")}>
              <strong>{overview.overdueSubtaskCount}</strong> overdue
            </span>
            <span className="text-[#D5D3CE]">·</span>
            <span>
              <strong className="text-[#1A1A1A]">{overview.todaySopCompletionPct}%</strong> SOPs today
            </span>
          </div>

          {/* Tab switcher */}
          <div className="flex justify-center pb-4">
            <TabsList aria-label="Department detail views">
              <TabsTrigger value="group">Group Tasks</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Tab content */}
        <TabsContent value="group" className="mt-0 flex-1 px-4 pb-8 pt-6 md:px-6 lg:px-8">
          {groupLoading ? (
            <DepartmentModalSkeleton />
          ) : (
            <DepartmentGroupTasksView
              departmentId={overview.departmentId as EmployeeDepartment}
              initialBundles={bundles}
              currentUser={currentUser}
            />
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-0 flex-1 px-4 pb-8 pt-6 md:px-6 lg:px-8">
          {agentsLoading ? (
            <DepartmentModalSkeleton />
          ) : (
            <DepartmentIndividualTasksView
              agents={agents}
              departmentId={overview.departmentId}
              currentUser={currentUser}
              returnToPath={`/task-insights/${overview.departmentId}`}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
