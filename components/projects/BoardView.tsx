"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TaskCard } from "@/components/projects/TaskCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskGroup, ProjectTask } from "@/lib/types/database";
import { createTaskGroup, createGroupTask } from "@/lib/actions/projects";
import { toast } from "sonner";
import { Plus, MoreHorizontal } from "lucide-react";

interface BoardViewProps {
  projectId: string;
  taskGroups: TaskGroup[];
  tasks: ProjectTask[];
  onTaskClick: (task: ProjectTask) => void;
}

interface InlineAddTask {
  groupId: string;
  value: string;
}

export function BoardView({
  projectId,
  taskGroups,
  tasks,
  onTaskClick,
}: BoardViewProps) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [inlineAdd, setInlineAdd] = useState<InlineAddTask | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Group tasks by group_id
  const tasksByGroup = tasks.reduce<Record<string, ProjectTask[]>>((acc, t) => {
    const key = t.group_id ?? "__ungrouped__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const sorted = [...taskGroups].sort((a, b) => a.position - b.position);

  function handleAddGroup() {
    if (!newGroupTitle.trim()) return;
    startTransition(async () => {
      const result = await createTaskGroup(projectId, {
        title: newGroupTitle.trim(),
        position: taskGroups.length,
      });
      if (result.success) {
        toast.success("Group created");
        setNewGroupTitle("");
        setAddingGroup(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to create group");
      }
    });
  }

  function handleInlineAddTask(groupId: string) {
    if (!inlineAdd?.value.trim()) {
      setInlineAdd(null);
      return;
    }
    startTransition(async () => {
      const result = await createGroupTask(groupId, {
        title: inlineAdd.value.trim(),
      });
      if (result.success) {
        setInlineAdd(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to create task");
      }
    });
  }

  // Empty state — no groups yet
  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-280px)] px-6 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center">
          <Plus className="w-6 h-6 text-[#D4AF37]/70" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-700 mb-1">No groups yet</p>
          <p className="text-xs text-zinc-400 max-w-xs">
            Create your first group (like "Design", "Backend", "QA") to start adding tasks.
          </p>
        </div>

        {addingGroup ? (
          <div className="w-[280px] rounded-2xl border border-dashed border-[#D4AF37]/50 p-4 space-y-3">
            <input
              autoFocus
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup();
                if (e.key === "Escape") { setAddingGroup(false); setNewGroupTitle(""); }
              }}
              placeholder="Group name…"
              maxLength={200}
              className="w-full text-sm font-medium text-[#1A1A1A] bg-transparent focus:outline-none placeholder:text-zinc-400"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="gold" disabled={isPending} onClick={handleAddGroup} className="text-xs">
                {isPending ? "Adding…" : "Add"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingGroup(false); setNewGroupTitle(""); }} className="text-xs">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingGroup(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#0A0A0A] text-sm font-semibold hover:bg-[#C9A530] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create first group
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 px-6 pt-4 min-h-[calc(100vh-200px)]">
      {sorted.map((group) => {
        const groupTasks = tasksByGroup[group.id] ?? [];
        return (
          <div
            key={group.id}
            className="shrink-0 w-[280px] flex flex-col"
          >
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className="text-[13px] font-semibold text-[#1A1A1A] flex-1 truncate">
                {group.title}
              </h3>
              <span className="text-[11px] text-zinc-400 font-medium bg-zinc-100 rounded-full px-2 py-0.5">
                {groupTasks.length}
              </span>
              <button
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                aria-label="Group options"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Task cards */}
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5">
              {groupTasks
                .sort((a, b) => a.position - b.position)
                .map((task) => (
                  <TaskCard key={task.id} task={task} onClick={onTaskClick} />
                ))}

              {/* Inline add task input */}
              {inlineAdd?.groupId === group.id ? (
                <div className="rounded-2xl border border-[#D4AF37]/40 bg-white p-2.5">
                  <input
                    autoFocus
                    type="text"
                    value={inlineAdd.value}
                    onChange={(e) =>
                      setInlineAdd({ groupId: group.id, value: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInlineAddTask(group.id);
                      if (e.key === "Escape") setInlineAdd(null);
                    }}
                    onBlur={() => handleInlineAddTask(group.id)}
                    placeholder="Task title…"
                    className="w-full text-sm text-[#1A1A1A] bg-transparent focus:outline-none placeholder:text-zinc-400"
                  />
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleInlineAddTask(group.id)}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#0A0A0A] hover:bg-[#C9A530] transition-colors disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setInlineAdd(null)}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg text-zinc-500 hover:bg-zinc-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setInlineAdd({ groupId: group.id, value: "" })}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-3 py-2 rounded-2xl text-zinc-400",
                    "hover:text-zinc-600 hover:bg-zinc-50 transition-colors",
                    "text-xs font-medium",
                  )}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add task
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* New group column */}
      <div className="shrink-0 w-[280px]">
        {addingGroup ? (
          <div className="rounded-2xl border border-dashed border-[#D4AF37]/50 p-4 space-y-3">
            <input
              autoFocus
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup();
                if (e.key === "Escape") {
                  setAddingGroup(false);
                  setNewGroupTitle("");
                }
              }}
              placeholder="Group name…"
              maxLength={200}
              className="w-full text-sm font-medium text-[#1A1A1A] bg-transparent focus:outline-none placeholder:text-zinc-400"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="gold"
                disabled={isPending}
                onClick={handleAddGroup}
                className="text-xs"
              >
                {isPending ? "Adding…" : "Add"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingGroup(false);
                  setNewGroupTitle("");
                }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingGroup(true)}
            className={cn(
              "w-full flex items-center gap-2 px-4 py-3 rounded-2xl",
              "border border-dashed border-zinc-200 hover:border-[#D4AF37]/50",
              "text-zinc-400 hover:text-zinc-600",
              "transition-all duration-200",
              "text-[13px] font-medium",
            )}
          >
            <Plus className="w-4 h-4" />
            New Group
          </button>
        )}
      </div>
    </div>
  );
}
