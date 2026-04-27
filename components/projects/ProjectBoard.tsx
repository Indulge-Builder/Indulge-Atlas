"use client";

import { useState } from "react";
import Link from "next/link";
import { BoardView } from "@/components/projects/BoardView";
import { ListView } from "@/components/projects/ListView";
import { TaskDetailSheet } from "@/components/projects/TaskDetailSheet";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { PROJECT_STATUS_CONFIG } from "@/lib/types/database";
import type { Project, TaskGroup, ProjectTask } from "@/lib/types/database";
import { format } from "date-fns";
import {
  LayoutGrid,
  List,
  Clock,
  ChevronLeft,
  Calendar,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

// ── Dynamic icon from lucide name ─────────────────────────────────────────

function ProjectIcon({ iconName, className }: { iconName: string | null; className?: string }) {
  if (!iconName) return <LayoutGrid className={className} />;
  const Icon = (LucideIcons as Record<string, React.FC<{ className?: string }>>)[
    iconName
  ] as React.FC<{ className?: string }> | undefined;
  return Icon ? <Icon className={className} /> : <LayoutGrid className={className} />;
}

// ── View switcher tabs ────────────────────────────────────────────────────

type ViewMode = "board" | "list";

interface ViewTabProps {
  mode: ViewMode;
  current: ViewMode;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ViewTab({ mode, current, onClick, icon, label }: ViewTabProps) {
  const isActive = mode === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all",
        isActive
          ? "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20"
          : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Member avatars ────────────────────────────────────────────────────────

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
  const [view, setView] = useState<ViewMode>("board");
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

  // Find context for the selected task
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedGroup = selectedTask?.group_id
    ? taskGroups.find((g) => g.id === selectedTask.group_id)
    : null;

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Project header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E5E4DF] shrink-0">
        {/* Color accent bar */}
        <div className="h-1" style={{ background: color }} />

        <div className="px-6 py-4">
          {/* Back + breadcrumb */}
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
            {/* Title area */}
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

            {/* Right meta */}
            <div className="flex items-center gap-4 shrink-0">
              {/* Members */}
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

              {/* Due date */}
              {project.due_date && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(project.due_date), "MMM d, yyyy")}
                </div>
              )}

              {/* Status */}
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

          {/* Progress bar + stats */}
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

          {/* View switcher */}
          <div className="flex items-center gap-1.5 mt-4">
            <ViewTab
              mode="board"
              current={view}
              onClick={() => setView("board")}
              icon={<LayoutGrid className="w-3.5 h-3.5" />}
              label="Board"
            />
            <ViewTab
              mode="list"
              current={view}
              onClick={() => setView("list")}
              icon={<List className="w-3.5 h-3.5" />}
              label="List"
            />
            {/* Timeline — Phase 2 */}
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

      {/* ── Board / List content ────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {view === "board" ? (
          <BoardView
            projectId={project.id}
            taskGroups={taskGroups}
            tasks={tasks}
            onTaskClick={handleTaskClick}
          />
        ) : (
          <ListView
            taskGroups={taskGroups}
            tasks={tasks}
            onTaskClick={handleTaskClick}
          />
        )}
      </div>

      {/* ── Task detail sheet ───────────────────────────────────────── */}
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
