"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isSameDay } from "date-fns";
import { LuxuryCalendar } from "./LuxuryCalendar";
import { TaskList } from "./TaskList";
import { AddTaskModal } from "./AddTaskModal";
import { AdminCreateTaskModal } from "./AdminCreateTaskModal";
import { EditTaskModal } from "./EditTaskModal";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { completeTask, deleteTask } from "@/lib/actions/tasks";
import type { TaskWithLead, UserRole } from "@/lib/types/database";

type LeadOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  status: string;
};

interface TaskDashboardClientProps {
  tasks: TaskWithLead[];
  leads: LeadOption[];
  profile: { full_name: string; role: UserRole };
}

export function TaskDashboardClient({
  tasks,
  leads,
  profile,
}: TaskDashboardClientProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [completingIds, setCompletingIds] = useState<string[]>([]);
  const [editingTask, setEditingTask] = useState<TaskWithLead | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCompletingIds((prev) =>
      prev.filter((id) => {
        const task = tasks.find((t) => t.id === id);
        return task && task.status !== "completed";
      }),
    );
  }, [tasks]);

  const taskDates = useMemo(
    () => tasks.map((t) => new Date(t.due_date)),
    [tasks],
  );

  const tasksForDate = useMemo(
    () => tasks.filter((t) => isSameDay(new Date(t.due_date), selectedDate)),
    [tasks, selectedDate],
  );

  const pendingTasks = useMemo(
    () =>
      tasksForDate.filter(
        (t) => t.status !== "completed" && !completingIds.includes(t.id),
      ),
    [tasksForDate, completingIds],
  );

  const completedTasks = useMemo(
    () =>
      tasksForDate.filter(
        (t) => t.status === "completed" || completingIds.includes(t.id),
      ),
    [tasksForDate, completingIds],
  );

  function handleComplete(id: string) {
    setCompletingIds((prev) => [...prev, id]);
    startTransition(() => {
      completeTask(id);
    });
  }

  function handleDelete(id: string) {
    startTransition(() => {
      deleteTask(id);
    });
  }

  return (
    <>
    {editingTask && (
      <EditTaskModal
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSuccess={() => router.refresh()}
      />
    )}
    <TaskDetailSheet
      taskId={detailTaskId}
      onClose={() => setDetailTaskId(null)}
      onProgressAdded={() => router.refresh()}
    />
    <div className="px-8 py-6">
      <div className="flex gap-6 h-[calc(100vh-130px)]">
        {/* ── Left pane: Calendar ────────────────────────────── */}
        <div className="w-[272px] shrink-0 flex flex-col gap-4">
          <LuxuryCalendar
            selectedDate={selectedDate}
            taskDates={taskDates}
            onSelectDate={setSelectedDate}
          />

          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-[#EAEAEA] px-5 py-4">
            <p className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest mb-3">
              This Month
            </p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#4A4A4A]">Total tasks</span>
                <span className="text-xs font-semibold text-[#1A1A1A]">
                  {tasks.length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#4A4A4A]">Completed</span>
                <span className="text-xs font-semibold text-[#4A7C59]">
                  {tasks.filter((t) => t.status === "completed").length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#4A4A4A]">Pending</span>
                <span className="text-xs font-semibold text-[#C5830A]">
                  {tasks.filter((t) => t.status !== "completed").length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right pane: Task List ──────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* REMOVED: the separate header div from here */}

          <div className="flex-1 min-h-0">
            <TaskList
              selectedDate={selectedDate}
              pendingTasks={pendingTasks}
              completedTasks={completedTasks}
              completingIds={completingIds}
              role={profile.role}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onEdit={(task) => setEditingTask(task)}
              onOpenDetail={(task) => setDetailTaskId(task.id)}
              headerAction={
                <div className="flex items-center gap-2">
                  {profile.role === "admin" && (
                    <AdminCreateTaskModal
                      defaultDate={selectedDate}
                      onSuccess={() => router.refresh()}
                    />
                  )}
                  <AddTaskModal
                    role={profile.role}
                    leads={leads}
                    defaultDate={selectedDate}
                    onSuccess={() => router.refresh()}
                  />
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
