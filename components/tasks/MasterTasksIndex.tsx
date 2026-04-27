"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { MasterTaskCard } from "./MasterTaskCard";
import { CreateMasterTaskModal } from "./CreateMasterTaskModal";
import { EmptyTasksState } from "./EmptyTasksState";
import { TaskSearchFilter, type TaskFilters } from "./TaskSearchFilter";
import type { MasterTask } from "@/lib/types/database";

type ViewFilter = "all" | "archived";

interface MasterTasksIndexProps {
  tasks: MasterTask[];
}

export function MasterTasksIndex({ tasks }: MasterTasksIndexProps) {
  const [createOpen, setCreateOpen]   = useState(false);
  const [viewFilter, setViewFilter]   = useState<ViewFilter>("all");
  const [searchFilters, setSearchFilters] = useState<TaskFilters>({
    search:   "",
    status:   "all",
    priority: "all",
  });

  // Apply filters
  const filtered = tasks.filter((t) => {
    if (viewFilter === "archived" && !t.archived_at) return false;
    if (viewFilter !== "archived" && t.archived_at) return false;

    if (searchFilters.search) {
      const q = searchFilters.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q)) return false;
    }
    if (searchFilters.status && searchFilters.status !== "all" && t.atlas_status !== searchFilters.status) return false;
    // Master tasks don't have priority — skip priority filter at this level

    return true;
  });

  const TAB_ITEMS: { id: ViewFilter; label: string; count?: number }[] = [
    { id: "all",      label: "All",      count: tasks.filter((t) => !t.archived_at).length },
    { id: "archived", label: "Archived", count: tasks.filter((t) => !!t.archived_at).length },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-[28px] font-bold text-zinc-900 leading-none mb-1">
            Atlas Tasks
          </h1>
          <p className="text-sm text-zinc-500">
            Track objectives, projects, and deliverables across your team.
          </p>
        </div>
        <IndulgeButton
          variant="gold"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setCreateOpen(true)}
          aria-label="Create new master task"
        >
          New Master Task
        </IndulgeButton>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tab switcher */}
        <div
          className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
          role="tablist"
          aria-label="Task view filter"
        >
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={viewFilter === tab.id}
              onClick={() => setViewFilter(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                viewFilter === tab.id
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                    viewFilter === tab.id
                      ? "bg-[#D4AF37]/15 text-[#A88B25]"
                      : "bg-zinc-200 text-zinc-500",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <TaskSearchFilter filters={searchFilters} onChange={setSearchFilters} />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyTasksState
          title={viewFilter === "archived" ? "No archived tasks" : "No tasks yet"}
          description={
            viewFilter === "archived"
              ? "Archived tasks will appear here."
              : "Create your first master task to begin."
          }
          ctaLabel={viewFilter === "all" ? "Create Master Task" : undefined}
          onCta={viewFilter === "all" ? () => setCreateOpen(true) : undefined}
          variant={viewFilter === "archived" ? "archived" : "tasks"}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          initial={false}
        >
          {filtered.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.18 }}
            >
              <MasterTaskCard task={task} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create modal */}
      <CreateMasterTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
