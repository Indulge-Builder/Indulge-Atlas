"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ChevronDown, CheckCheck, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import type { TaskWithLead, UserRole } from "@/lib/types/database";

interface TaskListProps {
  selectedDate: Date;
  pendingTasks: TaskWithLead[];
  completedTasks: TaskWithLead[];
  completingIds: string[];
  role: UserRole;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: TaskWithLead) => void;
  onOpenDetail?: (task: TaskWithLead) => void;
  headerAction?: React.ReactNode;
}

export function TaskList({
  selectedDate,
  pendingTasks,
  completedTasks,
  completingIds,
  role,
  onComplete,
  onDelete,
  onEdit,
  onOpenDetail,
  headerAction,
}: TaskListProps) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  function toggleExpand(taskId: string) {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  }

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const isToday =
    format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const dateLabel = isToday ? "Today" : format(selectedDate, "EEEE, MMMM d");

  const allEmpty = pendingTasks.length === 0 && completedTasks.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Date heading & Action Button */}
      {/* MODIFIED: Added flex, items-start, and justify-between to align text and button */}
      <div className="mb-5 flex justify-between items-start">
        <div>
          <h2
            className="text-[#1A1A1A] text-xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {dateLabel}
          </h2>
          {!allEmpty && (
            <p className="text-[#9E9E9E] text-xs mt-0.5">
              {pendingTasks.length} pending
              {completedTasks.length > 0 &&
                ` · ${completedTasks.length} completed`}
            </p>
          )}
        </div>

        {/* Render the button on the right if provided */}
        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Task list — AnimatePresence keyed on the date so switching dates re-animates */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={dateKey}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-3"
          >
            {/* Pending tasks */}
            <AnimatePresence initial={false}>
              {pendingTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  role={role}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onOpenDetail={onOpenDetail}
                  isCompleting={completingIds.includes(task.id)}
                  isExpanded={expandedTaskId === task.id}
                  onToggleExpand={() => toggleExpand(task.id)}
                />
              ))}
            </AnimatePresence>

            {/* Empty state */}
            {allEmpty && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#F4F4F0] flex items-center justify-center mb-4">
                  <CalendarDays className="w-6 h-6 text-[#C0C0B8]" />
                </div>
                <p
                  className="text-[#4A4A4A] font-medium text-base"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  No tasks scheduled
                </p>
                <p className="text-[#9E9E9E] text-sm mt-1">
                  {isToday
                    ? "Your day is clear. Add a task to get started."
                    : "Nothing planned for this day."}
                </p>
              </motion.div>
            )}

            {/* No pending, but has completed */}
            {pendingTasks.length === 0 && completedTasks.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 py-3 px-4 bg-[#EBF4EF] rounded-xl border border-[#D4EAD8]"
              >
                <CheckCheck className="w-4 h-4 text-[#4A7C59]" />
                <p className="text-xs text-[#4A7C59] font-medium">
                  All tasks for this day are complete. Well done.
                </p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Completed accordion */}
        {completedTasks.length > 0 && (
          <div className="mt-2 border-t border-[#F0F0EC] pt-3">
            <button
              onClick={() => setCompletedOpen((o) => !o)}
              className="flex items-center gap-2 text-xs font-semibold text-[#9E9E9E] uppercase tracking-widest hover:text-[#4A4A4A] transition-colors w-full"
            >
              <motion.span
                animate={{ rotate: completedOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.span>
              Completed ({completedTasks.length})
            </button>

            <AnimatePresence>
              {completedOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={cn("overflow-hidden")}
                >
                  <div className="space-y-3 mt-3">
                    {completedTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        role={role}
                        onComplete={onComplete}
                        onOpenDetail={onOpenDetail}
                        isCompleting={completingIds.includes(task.id)}
                        isExpanded={expandedTaskId === task.id}
                        onToggleExpand={() => toggleExpand(task.id)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
