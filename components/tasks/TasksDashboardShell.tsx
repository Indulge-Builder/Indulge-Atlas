"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { MyTasksDashboard } from "./MyTasksDashboard";
import { AtlasTasksListView } from "./AtlasTasksListView";
import { CreateMasterTaskModal } from "./CreateMasterTaskModal";
import type { MasterTask, SubTask, TaskGroup, PersonalTask } from "@/lib/types/database";

type TabKey = "my-tasks" | "atlas-tasks";

const TABS: { id: TabKey; label: string }[] = [
  { id: "my-tasks",    label: "My Tasks"    },
  { id: "atlas-tasks", label: "Atlas Tasks" },
];

interface AtlasTasksData {
  masterTask: MasterTask;
  taskGroups: Array<TaskGroup & { tasks: SubTask[] }>;
}

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
  const [createOpen, setCreateOpen] = useState(false);

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

  // On mount, respect URL param
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
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-serif text-[32px] font-bold text-[#1A1A1A] leading-none mb-1.5">
              Atlas Tasks
            </h1>
            <p className="text-[14px] text-[#8A8A6E]">
              {currentUser.department
                ? `${currentUser.department.charAt(0).toUpperCase() + currentUser.department.slice(1)} Department`
                : "All Departments"}
              {activeTaskCount > 0 && (
                <> &middot; <span className="font-medium text-[#1A1A1A]">{activeTaskCount}</span> active tasks assigned to you</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
              onClick={() => setCreateOpen(true)}
            >
              New Master Task
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
                onRefresh={() => {}}
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
              <AtlasTasksListView
                tasks={atlasTasks}
                currentUser={currentUser}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Create master task modal */}
      <CreateMasterTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
