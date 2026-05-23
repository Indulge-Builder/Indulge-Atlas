"use client";

import { useEffect, useState, useCallback, useTransition, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  DepartmentTaskOverview,
  EmployeeDepartment,
  TaskInsightsWorkspaceCard,
  TaskIntelligenceAgentSummary,
} from "@/lib/types/database";
import {
  getDepartmentIndividualTasks,
  getDepartmentTaskOverview,
  getMasterWorkspacesForDashboard,
} from "@/lib/actions/task-intelligence";
import { useTaskIntelligenceRealtime } from "@/lib/hooks/useTaskIntelligenceRealtime";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { Send } from "lucide-react";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { TopBar } from "@/components/layout/TopBar";
import { GroupTasksCommandView } from "./GroupTasksCommandView";
import { DepartmentIndividualTasksView } from "./DepartmentIndividualTasksView";
import { TaskInsightsDepartmentSelector } from "./TaskInsightsDepartmentSelector";
import { AssignTaskModal } from "./AssignTaskModal";

interface TaskIntelligenceDashboardProps {
  initialOverview: DepartmentTaskOverview[];
  initialWorkspaces: TaskInsightsWorkspaceCard[];
  initialAgents: TaskIntelligenceAgentSummary[];
  currentUser: { id: string; full_name: string; job_title: string | null; role: string };
  loadError?: string | null;
}

export function TaskIntelligenceDashboard({
  initialOverview,
  initialWorkspaces,
  initialAgents,
  currentUser,
  loadError = null,
}: TaskIntelligenceDashboardProps) {
  const [rows, setRows] = useState<DepartmentTaskOverview[]>(initialOverview);
  const [workspaceTasks, setWorkspaceTasks] =
    useState<TaskInsightsWorkspaceCard[]>(initialWorkspaces);
  const [individualAgents, setIndividualAgents] = useState<TaskIntelligenceAgentSummary[]>(initialAgents);
  const [individualLoading, setIndividualLoading] = useState(false);
  const [, startTransition] = useTransition();

  const [filterDepartmentId, setFilterDepartmentId] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  useEffect(() => {
    if (filterDepartmentId && !rows.some((r) => r.departmentId === filterDepartmentId)) {
      setFilterDepartmentId(null);
    }
  }, [rows, filterDepartmentId]);

  useEffect(() => {
    setRows(initialOverview);
  }, [initialOverview]);

  useEffect(() => {
    setWorkspaceTasks(initialWorkspaces);
  }, [initialWorkspaces]);

  // Derive visible dept IDs from the overview rows — used to scope realtime subscriptions.
  const visibleDeptIds = useMemo(() => rows.map((r) => r.departmentId), [rows]);
  const refreshSignal = useTaskIntelligenceRealtime(visibleDeptIds);

  const refetchAll = useCallback(() => {
    startTransition(() => {
      void (async () => {
        const [ov, gt] = await Promise.all([
          getDepartmentTaskOverview(),
          getMasterWorkspacesForDashboard(),
        ]);
        if (ov.success && ov.data) {
          setRows(ov.data);
        } else if (!ov.success) toast.error(ov.error ?? "Could not refresh overview.");
        if (gt.success && gt.data) setWorkspaceTasks(gt.data);
      })();
    });
  }, []);

  useEffect(() => {
    if (refreshSignal === 0) return;
    refetchAll();
  }, [refreshSignal, refetchAll]);

  const filteredRows = useMemo(() => {
    if (!filterDepartmentId) return rows;
    return rows.filter((r) => r.departmentId === filterDepartmentId);
  }, [rows, filterDepartmentId]);

  /** Landing grid + chips: only departments with group work (masters and/or overdue subtasks). */
  const departmentsWithTasks = useMemo(
    () =>
      rows.filter(
        (r) => r.activeMasterTaskCount > 0 || r.overdueSubtaskCount > 0,
      ),
    [rows],
  );

  const filteredWorkspaceTasks = useMemo(() => {
    if (!filterDepartmentId) return workspaceTasks;
    return workspaceTasks.filter(
      (t) => (t.department ?? "").trim() === filterDepartmentId,
    );
  }, [workspaceTasks, filterDepartmentId]);

  // When the user applies a department filter, re-fetch only that dept's agents.
  // On initial load filteredRows === rows (no filter), and initialAgents is already
  // SSR'd, so we skip. We track the previous filter to detect real changes.
  const prevFilterRef = useRef<string | null>(undefined as unknown as null);
  useEffect(() => {
    const prev = prevFilterRef.current;
    prevFilterRef.current = filterDepartmentId;

    // Skip on first mount — SSR data is already in state.
    if (prev === undefined) return;
    // No change.
    if (prev === filterDepartmentId) return;

    if (filteredRows.length === 0) {
      setIndividualAgents([]);
      setIndividualLoading(false);
      return;
    }

    // Clearing a filter: restore the full SSR set rather than re-fetching.
    if (filterDepartmentId === null) {
      setIndividualAgents(initialAgents);
      return;
    }

    // Filtered to a specific dept — fetch just that dept.
    let cancelled = false;
    setIndividualLoading(true);
    void (async () => {
      const results = await Promise.all(
        filteredRows.map((r) =>
          getDepartmentIndividualTasks({ departmentId: r.departmentId }),
        ),
      );
      if (cancelled) return;
      const byId = new Map<string, TaskIntelligenceAgentSummary>();
      for (const res of results) {
        if (!res.success || !res.data) continue;
        for (const agent of res.data.agents) {
          if (!byId.has(agent.id)) byId.set(agent.id, agent);
        }
      }
      setIndividualAgents([...byId.values()]);
      setIndividualLoading(false);
    })();

    return () => { cancelled = true; };
  // filteredRows identity changes on every render; key off filterDepartmentId instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDepartmentId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        title="Task Insights"
        subtitle="Live workforce task overview across all departments"
        hideDomainSwitcher
        hideSearch
        actions={
          <IndulgeButton
            type="button"
            variant="gold"
            size="sm"
            className="shrink-0 shadow-sm"
            leftIcon={<Send className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => setShowAssignModal(true)}
          >
            Assign Task
          </IndulgeButton>
        }
      />

      <Tabs
        defaultValue="agents"
        indicatorLayoutId="ti-tab-indicator"
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Sticky filter bar: department pills + tab switcher in one cohesive band */}
        <div className="sticky top-[65px] z-20 border-b border-[#E5E4DF]/80 bg-[#F9F9F6]/95 px-4 py-4 backdrop-blur-md md:px-6 lg:px-8">
          {loadError && (
            <div
              role="alert"
              className={cn(
                surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
                "mb-4 border-red-200/80 bg-linear-to-r from-red-50/90 to-amber-50/30 px-4 py-3 text-sm text-red-900",
              )}
            >
              {loadError}
            </div>
          )}

          {!loadError && rows.length === 0 && (
            <div
              className={cn(
                surfaceCardVariants({ tone: "stone", elevation: "xs" }),
                "mb-4 px-4 py-3.5 text-[14px] leading-relaxed text-[#6B6B6B]",
              )}
            >
              No department scope is available for your account. Ask an admin to set your{" "}
              <span className="font-medium text-[#1A1A1A]">domain</span> to a valid value (e.g.
              indulge_concierge or indulge_global), then reload.
            </div>
          )}

          {!loadError && rows.length > 0 && (
            <div className="mb-4">
              <TaskInsightsDepartmentSelector
                departments={departmentsWithTasks}
                value={filterDepartmentId}
                onChange={setFilterDepartmentId}
              />
            </div>
          )}

          <div className="flex justify-center">
            <TabsList aria-label="Organization task views">
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="workspaces">All workspaces</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Tab content */}
        <TabsContent
          value="agents"
          className="mt-0 flex-1 px-4 pb-8 pt-6 md:px-6 lg:px-8"
        >
          {individualLoading && individualAgents.length === 0 ? (
            <p className="text-sm text-[#8A8A6E]">Loading agents…</p>
          ) : individualAgents.length > 0 ? (
            <DepartmentIndividualTasksView
              agents={individualAgents}
              departmentId={(filterDepartmentId as EmployeeDepartment | null) ?? null}
              currentUser={currentUser}
              returnToPath={
                filterDepartmentId ? `/task-insights/${filterDepartmentId}` : null
              }
            />
          ) : (
            <p className="text-sm text-[#8A8A6E]">
              No agents found in your visible departments.
            </p>
          )}
        </TabsContent>

        <TabsContent
          value="workspaces"
          className="mt-0 flex-1 px-4 pb-8 pt-6 md:px-6 lg:px-8"
        >
          <GroupTasksCommandView
            items={filteredWorkspaceTasks}
            showDepartmentBadge={filterDepartmentId === null}
          />
        </TabsContent>
      </Tabs>

      <AssignTaskModal open={showAssignModal} onClose={() => setShowAssignModal(false)} />
    </div>
  );
}
