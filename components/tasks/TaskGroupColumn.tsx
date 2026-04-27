"use client";

import { useState } from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubTaskCard } from "./SubTaskCard";
import { AddSubTaskInline } from "./AddSubTaskInline";
import { SubTaskDetailSheet } from "./SubTaskDetailSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { renameTaskGroup, deleteTaskGroupForMaster } from "@/lib/actions/tasks";
import type { TaskGroup, SubTask } from "@/lib/types/database";

interface TaskGroupColumnProps {
  group: TaskGroup & { tasks: SubTask[] };
  masterTaskId: string;
  onGroupRenamed?: () => void;
  onGroupDeleted?: () => void;
  onTaskCreated?: () => void;
  onDragStart?: (e: React.DragEvent, taskId: string, fromGroupId: string) => void;
  onDragOver?: (e: React.DragEvent, toGroupId: string) => void;
  onDrop?: (e: React.DragEvent, toGroupId: string) => void;
}

export function TaskGroupColumn({
  group,
  masterTaskId,
  onGroupRenamed,
  onGroupDeleted,
  onTaskCreated,
  onDragStart,
  onDragOver,
  onDrop,
}: TaskGroupColumnProps) {
  const [selectedTask, setSelectedTask] = useState<SubTask | null>(null);
  const [isEditing, setIsEditing]       = useState(false);
  const [editTitle, setEditTitle]       = useState(group.title);
  const [isDragOver, setIsDragOver]     = useState(false);
  const [isPending, startTransition]    = useTransition();

  function handleRename() {
    if (!editTitle.trim() || editTitle === group.title) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await renameTaskGroup(group.id, editTitle.trim());
      if (result.success) {
        toast.success("Group renamed");
        onGroupRenamed?.();
      } else {
        toast.error(result.error ?? "Failed to rename group");
      }
      setIsEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTaskGroupForMaster(group.id);
      if (result.success) {
        toast.success("Group deleted");
        onGroupDeleted?.();
      } else {
        toast.error(result.error ?? "Failed to delete group");
      }
    });
  }

  const doneCount = (group.tasks as SubTask[]).filter((t) => t.atlas_status === "done").length;

  return (
    <div
      className={cn(
        "flex flex-col w-72 shrink-0 rounded-xl border bg-[#FAFAF8] transition-colors",
        isDragOver ? "border-[#D4AF37] bg-[#D4AF37]/5" : "border-[#E5E4DF]",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        onDragOver?.(e, group.id);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        onDrop?.(e, group.id);
      }}
      aria-label={`Task group: ${group.title}`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <GripVertical className="h-4 w-4 text-zinc-300 flex-shrink-0 cursor-grab" aria-hidden />

        {isEditing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") { setIsEditing(false); setEditTitle(group.title); }
            }}
            className="flex-1 text-sm font-semibold text-zinc-800 bg-transparent border-b border-[#D4AF37] outline-none"
            aria-label="Rename group"
          />
        ) : (
          <h3 className="flex-1 text-sm font-semibold text-zinc-800 truncate">
            {group.title}
          </h3>
        )}

        <span className="text-[10px] text-zinc-400 font-medium">
          {doneCount}/{group.tasks.length}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200"
              aria-label="Group options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={isPending}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Task cards */}
      <div className="flex flex-col gap-2 px-3 pb-2 min-h-[48px]">
        {(group.tasks as SubTask[]).map((task) => (
          <SubTaskCard
            key={task.id}
            task={task}
            onClick={(t) => setSelectedTask(t)}
            onDragStart={(e, id) => onDragStart?.(e, id, group.id)}
          />
        ))}
      </div>

      {/* Add inline */}
      <div className="px-3 pb-3">
        <AddSubTaskInline
          masterTaskId={masterTaskId}
          groupId={group.id}
          onCreated={onTaskCreated}
        />
      </div>

      {/* Detail sheet */}
      {selectedTask && (
        <SubTaskDetailSheet
          taskId={selectedTask.id}
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
