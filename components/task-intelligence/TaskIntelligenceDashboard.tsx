"use client";

import { useEffect, useState, useCallback, useTransition, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
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
import { DepartmentHealthCard } from "./DepartmentHealthCard";
import { DepartmentDetailModal } from "./DepartmentDetailModal";
import { GroupTasksCommandView } from "./GroupTasksCommandView";
import { DepartmentIndividualTasksView } from "./DepartmentIndividualTasksView";
import { TaskInsightsDepartmentSelector } from "./TaskInsightsDepartmentSelector";
import { AssignTaskModal } from "./AssignTaskModal";

type TabKey = "workspaces" | "individual";

interface TaskIntelligenceDashboardProps {
  initialOverview: DepartmentTaskOverview[];
  initialWorkspaces: TaskInsightsWorkspaceCard[];
  currentUser: { id: string; full_name: string; job_title: string | null };
  loadError?: string | null;
  /** When set (e.g. from `/task-insights?dept=tech`), opens the department detail on load. */
  initialOpenDepartmentId?: string | null;
}

export function TaskIntelligenceDashboard({
  initialOverview,
  initialWorkspaces,
  currentUser,
  loadError = null,
  initialOpenDepartmentId = null,
}: TaskIntelligenceDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<DepartmentTaskOverview[]>(initialOverview);
  const [workspaceTasks, setWorkspaceTasks] =
    useState<TaskInsightsWorkspaceCard[]>(initialWorkspaces);
  const [selected, setSelected] = useState<DepartmentTaskOverview | null>(() => {
    if (!initialOpenDepartmentId) return null;
    return initialOverview.find((r) => r.departmentId === initialOpenDepartmentId) ?? null;
  });
  const [activeTab, setActiveTab] = useState<TabKey>("workspaces");
  const [individualAgents, setIndividualAgents] = useState<TaskIntelligenceAgentSummary[]>([]);
  const [individualLoading, setIndividualLoading] = useState(false);
  const [, startTransition] = useTransition();
  const refreshSignal = useTaskIntelligenceRealtime();

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

  const refetchAll = useCallback(() => {
    startTransition(() => {
      void (async () => {
        const [ov, gt] = await Promise.all([
          getDepartmentTaskOverview(),
          getMasterWorkspacesForDashboard(),
        ]);
        if (ov.success && ov.data) {
          setRows(ov.data);
          setSelected((prev) => {
            if (!prev) return null;
            return ov.data!.find((r) => r.departmentId === prev.departmentId) ?? prev;
          });
        } else if (!ov.success) toast.error(ov.error ?? "Could not refresh overview.");
        if (gt.success && gt.data) setWorkspaceTasks(gt.data);
      })();
    });
  }, []);

  useEffect(() => {
    if (refreshSignal === 0) return;
    refetchAll();
  }, [refreshSignal, refetchAll]);

  const openDepartment = useCallback(
    (o: DepartmentTaskOverview) => {
      setSelected(o);
      const next = new URLSearchParams(searchParams.toString());
      next.set("dept", o.departmentId);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closeDepartmentModal = useCallback(() => {
    setSelected(null);
    if (searchParams.get("dept")) {
      router.replace(pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  const filteredRows = useMemo(() => {
    if (!filterDepartmentId) return rows;
    return rows.filter((r) => r.departmentId === filterDepartmentId);
  }, [rows, filterDepartmentId]);

  const filteredWorkspaceTasks = useMemo(() => {
    if (!filterDepartmentId) return workspaceTasks;
    return workspaceTasks.filter(
      (t) => (t.department ?? "").trim() === filterDepartmentId,
    );
  }, [workspaceTasks, filterDepartmentId]);

  useEffect(() => {
    if (activeTab !== "individual") return;
    if (filteredRows.length === 0) {
      setIndividualAgents([]);
      return;
    }

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

    return () => {
      cancelled = true;
    };
  }, [activeTab, filteredRows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-7xl flex-1 px-6 pt-6 pb-14">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-[30px] font-bold leading-[1.1] text-[#1A1A1A] sm:text-[32px]">
              Task Insights
            </h1>
            <p className="mt-1.5 text-[13px] text-[#8A8A6E]">
              {formatInTimeZone(new Date(), "Asia/Kolkata", "EEEE, d MMMM yyyy · IST")}
            </p>
          </div>
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
        </header>

        {!loadError && rows.length > 0 && (
          <TaskInsightsDepartmentSelector
            departments={rows}
            value={filterDepartmentId}
            onChange={setFilterDepartmentId}
          />
        )}

        {loadError && (
          <div
            role="alert"
            className={cn(
              surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
              "mb-6 border-red-200/80 bg-gradient-to-r from-red-50/90 to-amber-50/30 px-4 py-3.5 text-sm text-red-900",
            )}
          >
            {loadError}
          </div>
        )}

        {!loadError && rows.length === 0 && (
          <div
            className={cn(
              surfaceCardVariants({ tone: "stone", elevation: "xs" }),
              "mb-6 px-4 py-4 text-[14px] leading-relaxed text-[#6B6B6B]",
            )}
          >
            No department scope is available for your account. Ask an admin to set your{" "}
            <span className="font-medium text-[#1A1A1A]">domain</span> to a valid value (e.g.
            indulge_concierge or indulge_global), then reload.
          </div>
        )}

        {!loadError && rows.length > 0 && (
          <section className="mb-10" aria-labelledby="ti-departments-heading">
            <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="ti-departments-heading"
                  className="font-serif text-[22px] font-bold leading-tight text-[#1A1A1A]"
                >
                  Departments
                </h2>
                <p className="mt-1 text-[13px] text-[#8A8A6E]">
                  Click a card for the full department breakdown.
                </p>
              </div>
            </div>
            <motion.div
              className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3"
              variants={{
                hidden: {},
                show: {
                  transition: { staggerChildren: 0.06 },
                },
              }}
              initial="hidden"
              animate="show"
            >
              {filteredRows.map((o) => (
                <DepartmentHealthCard
                  key={o.departmentId}
                  overview={o}
                  onOpen={() => openDepartment(o)}
                />
              ))}
            </motion.div>
          </section>
        )}

        <div
          className="relative flex items-stretch gap-0 border-b border-[#E5E4DF]"
          role="tablist"
          aria-label="Organization task views"
        >
          <button
            id="ti-workspaces-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "workspaces"}
            onClick={() => setActiveTab("workspaces")}
            className={cn(
              "relative select-none px-5 py-3.5 text-[14px] font-medium transition-colors duration-150",
              activeTab === "workspaces" ? "text-[#1A1A1A]" : "text-[#8A8A6E] hover:text-[#1A1A1A]",
            )}
          >
            All workspaces
            {activeTab === "workspaces" && (
              <motion.div
                layoutId="ti-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#D4AF37]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "individual"}
            onClick={() => setActiveTab("individual")}
            className={cn(
              "relative select-none px-5 py-3.5 text-[14px] font-medium transition-colors duration-150",
              activeTab === "individual" ? "text-[#1A1A1A]" : "text-[#8A8A6E] hover:text-[#1A1A1A]",
            )}
          >
            Individual &amp; team
            {activeTab === "individual" && (
              <motion.div
                layoutId="ti-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#D4AF37]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </button>
        </div>

        <div className="pt-8">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === "workspaces" ? (
              <motion.div
                key="workspaces"
                id="panel-workspaces"
                role="tabpanel"
                aria-labelledby="ti-workspaces-tab"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2 }}
              >
                <GroupTasksCommandView
                  items={filteredWorkspaceTasks}
                  showDepartmentBadge={filterDepartmentId === null}
                />
              </motion.div>
            ) : (
              <motion.div
                key="individual"
                id="panel-individual"
                role="tabpanel"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <p className="text-[13px] text-[#8A8A6E]">
                  {filterDepartmentId
                    ? "Personal-task activity for the selected department."
                    : "Agents and personal-task activity across your visible departments."}
                </p>
                {individualLoading ? (
                  <p className="text-sm text-[#8A8A6E]">
                    Loading agents…
                  </p>
                ) : individualAgents.length > 0 ? (
                  <DepartmentIndividualTasksView
                    agents={individualAgents}
                    departmentId={(filterDepartmentId as EmployeeDepartment | null) ?? null}
                  />
                ) : (
                  <p className="text-sm text-[#8A8A6E]">
                    No agents found for individual tasks in your visible departments.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <DepartmentDetailModal
        open={!!selected}
        overview={selected}
        onClose={closeDepartmentModal}
        currentUser={currentUser}
      />

      <AssignTaskModal open={showAssignModal} onClose={() => setShowAssignModal(false)} />
    </div>
  );
}
