"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { TaskGroupColumn } from "./TaskGroupColumn";
import {
  createTaskGroupForMaster,
  reorderSubTasks,
  getMasterTaskDetail,
} from "@/lib/actions/tasks";
import type { TaskGroup, SubTask, MasterTask } from "@/lib/types/database";
import { useRouter } from "next/navigation";

interface TaskBoardProps {
  masterTask: MasterTask;
  initialGroups: (TaskGroup & { tasks: SubTask[] })[];
}

export function TaskBoard({ masterTask, initialGroups }: TaskBoardProps) {
  const [groups, setGroups]            = useState(initialGroups);
  const [isPending, startTransition]   = useTransition();
  const [dragTaskId, setDragTaskId]    = useState<string | null>(null);
  const [dragFromGroup, setDragFromGroup] = useState<string | null>(null);
  const router = useRouter();

  // Sync local state when the RSC re-fetches after router.refresh().
  // This is intentional state-sync (not data fetching) — needed because
  // useState only consumes the initial value at mount, so RSC prop updates
  // would otherwise be silently ignored.
  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  const handleAddGroup = useCallback(() => {
    startTransition(async () => {
      const result = await createTaskGroupForMaster(masterTask.id, {
        title:    "New Group",
        position: groups.length,
      });
      if (result.success) {
        toast.success("Group created");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to create group");
      }
    });
  }, [masterTask.id, groups.length, router]);

  function handleDragStart(e: React.DragEvent, taskId: string, fromGroupId: string) {
    setDragTaskId(taskId);
    setDragFromGroup(fromGroupId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
  }

  function handleDrop(e: React.DragEvent, toGroupId: string) {
    e.preventDefault();
    if (!dragTaskId || dragFromGroup === toGroupId) return;

    // Optimistic update — move the task between columns
    setGroups((prev) => {
      const fromGroup = prev.find((g) => g.id === dragFromGroup);
      const toGroup   = prev.find((g) => g.id === toGroupId);
      if (!fromGroup || !toGroup) return prev;

      const task = fromGroup.tasks.find((t) => t.id === dragTaskId);
      if (!task) return prev;

      return prev.map((g) => {
        if (g.id === dragFromGroup) {
          return { ...g, tasks: (g.tasks as SubTask[]).filter((t) => t.id !== dragTaskId) };
        }
        if (g.id === toGroupId) {
          return { ...g, tasks: [...(g.tasks as SubTask[]), { ...task, group_id: toGroupId } as SubTask] };
        }
        return g;
      }) as (TaskGroup & { tasks: SubTask[] })[];
    });

    // Persist new group + order
    startTransition(async () => {
      const toGroup = groups.find((g) => g.id === toGroupId);
      if (!toGroup) return;

      const newOrder = [
        ...toGroup.tasks.map((t) => t.id),
        dragTaskId,
      ];
      await reorderSubTasks({ groupId: toGroupId, orderedTaskIds: newOrder });
    });

    setDragTaskId(null);
    setDragFromGroup(null);
  }

  return (
    <div className="flex h-full min-h-[min(420px,50vh)] flex-col">
      {/* Scrollable board — horizontal columns */}
      <div className="flex gap-4 overflow-x-auto pb-2 pt-0 -mx-1 px-1">
        {groups.map((group) => (
          <TaskGroupColumn
            key={group.id}
            group={group}
            masterTaskId={masterTask.id}
            onGroupRenamed={() => router.refresh()}
            onGroupDeleted={() => router.refresh()}
            onTaskCreated={() => router.refresh()}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        ))}

        {/* Add group button */}
        <div className="flex w-72 flex-shrink-0 items-start">
          <IndulgeButton
            variant="outline"
            size="sm"
            loading={isPending}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={handleAddGroup}
            className="w-full border-dashed"
            aria-label="Add a task group"
          >
            Add Group
          </IndulgeButton>
        </div>
      </div>
    </div>
  );
}
