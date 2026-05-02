"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Upload, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { MyTasksDashboard } from "./MyTasksDashboard";
import { AtlasTasksListView } from "./AtlasTasksListView";
import { CreateMasterTaskModal } from "./CreateMasterTaskModal";
import { CreatePersonalTaskModal } from "./CreatePersonalTaskModal";
import { ManageSOPsModal } from "./ManageSOPsModal";
import { isPrivilegedRole } from "@/lib/types/database";
import type { SubTask, PersonalTask } from "@/lib/types/database";
import type { AtlasTasksData } from "./AtlasTasksCompletionOverview";

type TabKey = "my-tasks" | "atlas-tasks";

const TABS: { id: TabKey; label: string }[] = [
  { id: "my-tasks",    label: "My Tasks"    },
  { id: "atlas-tasks", label: "Group Tasks" },
];

interface TasksDashboardShellProps {
  initialTab: TabKey;
  personalTasks:  PersonalTask[];
  subTasks:       Array<SubTask & { masterTaskTitle: string | null }>;
  atlasTasks:     AtlasTasksData[];
  currentUser: {
    id:         string;
    full_name:  string;
    job_title:  string | null;
    role:       string;
    department: string | null;
  };
  activeTaskCount: number;
}

export function TasksDashboardShell({
  initialTab,
  personalTasks,
  subTasks,
  atlasTasks,
  currentUser,
  activeTaskCount,
}: TasksDashboardShellProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [personalModalOpen, setPersonalModalOpen] = useState(false);
  const [sopModalOpen, setSopModalOpen] = useState(false);

  const canManageSOPs =
    currentUser.role === "manager" || isPrivilegedRole(currentUser.role);

  // Sync tab to URL
  const switchTab = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`/tasks?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabKey | null;
    if (tabParam && (tabParam === "my-tasks" || tabParam === "atlas-tasks")) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#F9F9F6] flex flex-col">
      {/* ── Masthead ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto w-full">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="m-0 font-serif text-[32px] font-bold leading-none tracking-tight text-[#1A1A1A]">
              Tasks
            </h1>
            <div
              role="status"
              aria-live="polite"
              aria-label={`${activeTaskCount} active tasks assigned to you, live count`}
              className="inline-flex h-8 shrink-0 items-center gap-3 rounded-full border border-[#E5E4DF] bg-white px-3.5 shadow-[0_1px_2px_rgba(26,24,20,0.05)]"
              title={`${activeTaskCount} active tasks assigned to you`}
            >
              <span className="font-semibold tabular-nums text-[15px] text-[#1A1A1A] leading-none" aria-hidden>
                {activeTaskCount}
              </span>
              <span className="h-3 w-px shrink-0 bg-[#E5E4DF]" aria-hidden />
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium leading-none text-emerald-700" aria-hidden>
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25"
                  aria-hidden
                />
                Live
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManageSOPs && (
              <button
                type="button"
                onClick={() => setSopModalOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E4DF] bg-white text-[#6B6B6B] shadow-[0_1px_2px_rgba(26,24,20,0.05)] transition-colors hover:border-[#D4AF37]/50 hover:text-[#1A1A1A]"
                aria-label="Manage daily SOP templates"
                title="Daily SOP templates"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
            <IndulgeButton
              variant="outline"
              size="sm"
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={() => router.push("/tasks/import")}
            >
              Import
            </IndulgeButton>
            <IndulgeButton
              variant="gold"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() =>
                activeTab === "my-tasks"
                  ? setPersonalModalOpen(true)
                  : setMasterModalOpen(true)
              }
            >
              {activeTab === "my-tasks" ? "My task" : "Group task"}
            </IndulgeButton>
          </div>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 border-b border-[#E5E4DF] relative" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "relative px-5 py-3 text-[14px] font-medium transition-colors duration-150 select-none",
                  isActive ? "text-[#1A1A1A]" : "text-[#8A8A6E] hover:text-[#1A1A1A]",
                )}
              >
                {tab.label}
                {/* Animated underline indicator */}
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37] rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "my-tasks" ? (
            <motion.div
              key="my-tasks"
              id="panel-my-tasks"
              role="tabpanel"
              aria-labelledby="tab-my-tasks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <MyTasksDashboard
                personalTasks={personalTasks}
                subTasks={subTasks}
                currentUser={currentUser}
                onRefresh={() => router.refresh()}
              />
            </motion.div>
          ) : (
            <motion.div
              key="atlas-tasks"
              id="panel-atlas-tasks"
              role="tabpanel"
              aria-labelledby="tab-atlas-tasks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <AtlasTasksListView tasks={atlasTasks} currentUser={currentUser} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CreatePersonalTaskModal
        open={personalModalOpen}
        onClose={() => setPersonalModalOpen(false)}
      />
      <CreateMasterTaskModal
        open={masterModalOpen}
        onClose={() => setMasterModalOpen(false)}
      />
      <ManageSOPsModal open={sopModalOpen} onClose={() => setSopModalOpen(false)} />
    </div>
  );
}
