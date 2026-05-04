"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { MoreHorizontal, Pencil, Trash2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import type { SubTask } from "@/lib/types/database";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const IST = "Asia/Kolkata";

const PRIORITY_ACCENT: Record<string, string> = {
  critical: "#D4AF37",
  high:     "#F97316",
  medium:   "#8B5CF6",
  low:      "#9CA3AF",
};

interface SubTaskCardProps {
  task: SubTask;
  onClick?: (task: SubTask) => void;
  onEdit?: (task: SubTask) => void;
  onDelete?: (taskId: string) => void;
  onReassign?: (taskId: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, taskId: string) => void;
}

export function SubTaskCard({
  task,
  onClick,
  onEdit,
  onDelete,
  onReassign,
  draggable = true,
  onDragStart,
}: SubTaskCardProps) {
  const [showActions, setShowActions] = useState(false);

  const accentColor = PRIORITY_ACCENT[task.priority ?? "medium"] ?? PRIORITY_ACCENT.medium;
  const assignees = (task.assigned_to_profiles ?? []) as { id: string; full_name: string }[];
  const firstAssignee = assignees[0];

  const isOverdue =
    task.due_date &&
    task.atlas_status !== "done" &&
    task.atlas_status !== "cancelled" &&
    new Date(task.due_date) < new Date();

  let dueDateLabel: string | null = null;
  if (task.due_date) {
    const d = toZonedTime(new Date(task.due_date), IST);
    dueDateLabel = format(d, "d MMM");
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e as unknown as React.DragEvent, task.id)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        surfaceCardVariants({ tone: "subtle", elevation: "sm", overflow: "visible" }),
        "relative cursor-pointer group select-none",
      )}
      style={{ borderLeft: `3px solid ${accentColor}` }}
      onClick={() => onClick?.(task)}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(task);
        }
      }}
    >
      <div className="p-3">
        {/* Title */}
        <p className="text-sm font-medium text-zinc-900 truncate leading-snug mb-2">
          {task.title}
        </p>

        {/* Bottom row */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <SubTaskStatusBadge status={task.atlas_status ?? "todo"} size="sm" />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {dueDateLabel && (
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  isOverdue
                    ? "bg-red-500/10 text-red-600"
                    : "bg-zinc-100 text-zinc-500",
                )}
                aria-label={`Due: ${dueDateLabel}${isOverdue ? " — overdue" : ""}`}
              >
                {dueDateLabel}
              </span>
            )}

            {firstAssignee && (
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white ring-1 ring-white"
                aria-label={`Assigned to ${firstAssignee.full_name}`}
              >
                {getInitials(firstAssignee.full_name)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Options button (reveal on hover) */}
      {(onEdit || onDelete || onReassign) && (
        <div
          className={cn(
            "absolute right-2 top-2 transition-opacity duration-150",
            showActions ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-zinc-400 hover:text-zinc-700 hover:bg-white shadow-sm"
                aria-label="Task options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(task)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
              )}
              {onReassign && (
                <DropdownMenuItem onClick={() => onReassign(task.id)}>
                  <UserCheck className="mr-2 h-3.5 w-3.5" />
                  Reassign
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(task.id)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </motion.div>
  );
}
