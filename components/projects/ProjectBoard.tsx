"use client";

import { useState } from "react";
import Link from "next/link";
import { ListView } from "@/components/projects/ListView";
import { TaskDetailSheet } from "@/components/projects/TaskDetailSheet";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { PROJECT_STATUS_CONFIG } from "@/lib/types/database";
import type { Project, TaskGroup, ProjectTask } from "@/lib/types/database";
import { format } from "date-fns";
import {
  LayoutGrid,
  Clock,
  ChevronLeft,
  Calendar,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

function ProjectIcon({ iconName, className }: { iconName: string | null; className?: string }) {
  if (!iconName) return <LayoutGrid className={className} />;
  const Icon = (
    LucideIcons as unknown as Record<
      string,
      React.ComponentType<{ className?: string }>
    >
  )[iconName] as React.ComponentType<{ className?: string }> | undefined;
  return Icon ? <Icon className={className} /> : <LayoutGrid className={className} />;
}

interface ProjectBoardProps {
  project: Project;
  taskGroups: TaskGroup[];
  tasks: ProjectTask[];
  currentUserId: string;
}

export function ProjectBoard({
  project,
  taskGroups,
  tasks,
  currentUserId,
}: ProjectBoardProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const statusConfig = PROJECT_STATUS_CONFIG[project.status];
  const color = project.color ?? "#D4AF37";

  const members = project.members ?? [];
  const memberProfiles = members
    .map((m) => m.profile)
    .filter(Boolean) as { id: string; full_name: string; role: string }[];

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  function handleTaskClick(task: ProjectTask) {
    setSelectedTaskId(task.id);
    setSheetOpen(true);
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedGroup = selectedTask?.group_id
    ? taskGroups.find((g) => g.id === selectedTask.group_id)
    : null;

  return (
    <div className="flex flex-col min-h-full">
      <div className="bg-white border-b border-[#E5E4DF] shrink-0">
        <div className="h-1" style={{ background: color }} />

        <div className="px-6 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Link
              href="/projects"
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Projects
            </Link>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${color}20` }}
              >
                <div style={{ color }}>
                  <ProjectIcon iconName={project.icon} className="w-5 h-5" />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-[#1A1A1A] leading-tight truncate">
                  {project.title}
                </h1>
                {project.description && (
                  <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-md">
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {memberProfiles.length > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <AvatarStack
                    assignees={memberProfiles}
                    maxVisible={5}
                    size="sm"
                  />
                </div>
              )}

              {project.due_date && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(project.due_date), "MMM d, yyyy")}
                </div>
              )}

              <span
                className={cn(
                  "text-[11px] font-semibold px-2.5 py-1 rounded-lg",
                  statusConfig.className,
                )}
              >
                {statusConfig.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${completionPct}%`,
                  background: color,
                }}
              />
            </div>
            <span className="text-xs text-zinc-500 font-medium shrink-0">
              {completedTasks}/{totalTasks} tasks · {completionPct}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-4">
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-zinc-300 cursor-not-allowed"
            >
              <Clock className="w-3.5 h-3.5" />
              Timeline
              <span className="text-[10px] bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded-full">
                Soon
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ListView
          projectId={project.id}
          taskGroups={taskGroups}
          tasks={tasks}
          onTaskClick={handleTaskClick}
        />
      </div>

      <TaskDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        taskId={selectedTaskId}
        projectName={project.title}
        groupName={selectedGroup?.title}
        initialTask={selectedTask}
        currentUserId={currentUserId}
        projectId={project.id}
      />
    </div>
  );
}
