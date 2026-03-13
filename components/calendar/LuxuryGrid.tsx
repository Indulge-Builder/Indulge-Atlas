"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Link2, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SmartTaskModal } from "./SmartTaskModal";
import { LeadResolutionFlow } from "./LeadResolutionFlow";
import { subjectFromTitle } from "@/lib/parse-smart-task";
import type { TaskWithLead } from "@/lib/types/database";

// Dynamically import AddLeadModal to keep initial bundle lean
import dynamic from "next/dynamic";
const AddLeadModal = dynamic(
  () =>
    import("@/components/leads/AddLeadModal").then((m) => ({
      default: m.AddLeadModal,
    })),
  { ssr: false }
);

// ── Animation variants ─────────────────────────────────────

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.012, delayChildren: 0.05 },
  },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

const cellVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 280, damping: 22 },
  },
};

// ── Day cell ───────────────────────────────────────────────

function DayCell({
  day,
  isCurrentMonth,
  tasks,
  onAddTask,
  onTaskClick,
}: {
  day: Date;
  isCurrentMonth: boolean;
  tasks: TaskWithLead[];
  onAddTask: (day: Date) => void;
  onTaskClick: (task: TaskWithLead) => void;
}) {
  const today = isToday(day);
  const pendingTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const allVisible = tasks.slice(0, 3);
  const overflow = tasks.length - 3;

  return (
    <motion.div
      variants={cellVariants}
      className={cn(
        "group relative border-r border-b border-[#EBEBEA] p-2.5 flex flex-col cursor-pointer transition-colors duration-150",
        isCurrentMonth
          ? "bg-white hover:bg-[#FAF9F7]"
          : "bg-[#FBFBFA] opacity-40 pointer-events-none",
        today && isCurrentMonth && "bg-[#FAFAF7]"
      )}
      onClick={() => isCurrentMonth && onAddTask(day)}
    >
      {/* Date number */}
      <div className="flex items-start justify-between mb-1.5">
        <span
          className={cn(
            "w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-medium leading-none transition-colors",
            today
              ? "bg-sidebar-hover text-white font-semibold"
              : "text-[#3A3A3A] group-hover:text-sidebar-hover"
          )}
        >
          {format(day, "d")}
        </span>

        {/* Hover: add button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.97 }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-sidebar-hover text-white flex items-center justify-center transition-opacity duration-150"
          onClick={(e) => {
            e.stopPropagation();
            onAddTask(day);
          }}
          title="Add task"
        >
          <Plus className="w-2.5 h-2.5" />
        </motion.button>
      </div>

      {/* Task chips */}
      <div className="space-y-[3px] flex-1">
        {allVisible.map((task) => (
          <button
            key={task.id}
            onClick={(e) => {
              e.stopPropagation();
              onTaskClick(task);
            }}
            className={cn(
              "w-full flex items-center gap-1.5 px-2 py-[4px] rounded-[6px] text-[10px] font-medium truncate transition-colors text-left",
              task.status === "completed"
                ? "bg-[#EBF2E8] text-success hover:bg-[#DFF0D8]"
                : "bg-[#F4F4F0] text-[#4A4A4A] hover:bg-[#EDE9E3]"
            )}
            title={task.title}
          >
            {/* Dot */}
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                task.status === "completed" ? "bg-[#5C7A3E]" : "bg-[#6A6A6A]"
              )}
            />
            {/* Lead linked indicator */}
            {task.lead_id && task.status !== "completed" && (
              <Link2 className="w-2.5 h-2.5 text-[#5C7A3E] shrink-0" />
            )}
            <span className="truncate">{task.title}</span>
          </button>
        ))}

        {overflow > 0 && (
          <p className="text-[9px] text-[#A0A09A] px-2 pt-0.5 font-medium">
            +{overflow} more
          </p>
        )}
      </div>

      {/* Bottom dot strip for days with many tasks (compact indicator) */}
      {tasks.length > 0 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5">
          {pendingTasks.length > 0 && (
            <span className="w-1 h-1 rounded-full bg-[#6A6A6A]" />
          )}
          {completedTasks.length > 0 && (
            <span className="w-1 h-1 rounded-full bg-[#5C7A3E]" />
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Props ──────────────────────────────────────────────────

interface LuxuryGridProps {
  tasks: TaskWithLead[];
}

// ── Component ──────────────────────────────────────────────

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function LuxuryGrid({ tasks }: LuxuryGridProps) {
  const router = useRouter();

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [direction, setDirection] = useState(1);

  // Modal state
  const [smartTaskModal, setSmartTaskModal] = useState<{ date: Date } | null>(
    null
  );
  const [leadResolution, setLeadResolution] = useState<{
    taskId: string;
    subject: string;
  } | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  // Navigation
  function goToPrev() {
    setDirection(-1);
    setCurrentMonth((m) => subMonths(m, 1));
  }
  function goToNext() {
    setDirection(1);
    setCurrentMonth((m) => addMonths(m, 1));
  }
  function jumpToday() {
    setDirection(0);
    setCurrentMonth(new Date());
  }

  // Calendar day grid
  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(currentMonth)),
      end: endOfWeek(endOfMonth(currentMonth)),
    });
  }, [currentMonth]);

  const numWeeks = Math.ceil(calendarDays.length / 7);

  // Group tasks by date key for O(1) lookup
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskWithLead[]>();
    for (const task of tasks) {
      const key = format(new Date(task.due_date), "yyyy-MM-dd");
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, task]);
    }
    return map;
  }, [tasks]);

  // Tasks for the current visible month (for summary)
  const monthTasks = useMemo(() => {
    return tasks.filter((t) => isSameMonth(new Date(t.due_date), currentMonth));
  }, [tasks, currentMonth]);

  // Callbacks
  const handleDayClick = useCallback((date: Date) => {
    setSmartTaskModal({ date });
  }, []);

  const handleTaskCreated = useCallback(
    (taskId: string, subject: string | null) => {
      setSmartTaskModal(null);
      router.refresh();
      if (subject) {
        setLeadResolution({ taskId, subject });
      }
    },
    [router]
  );

  const handleTaskClick = useCallback(
    (task: TaskWithLead) => {
      if (task.lead_id) return; // already linked — no resolution needed
      const subject = subjectFromTitle(task.title);
      if (subject) {
        setLeadResolution({ taskId: task.id, subject });
      }
    },
    []
  );

  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] px-7 py-5 select-none">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-5 shrink-0">
        <div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={format(currentMonth, "yyyy-MM")}
              initial={{ opacity: 0, y: direction * -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: direction * 6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="text-[28px] font-semibold text-sidebar-hover leading-none"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {format(currentMonth, "MMMM yyyy")}
            </motion.h1>
          </AnimatePresence>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-xs text-[#8A8A8A]">
              {monthTasks.filter((t) => t.status !== "completed").length} pending
            </p>
            <span className="text-[#D8D8D0]">·</span>
            <p className="text-xs text-[#5C7A3E] font-medium">
              {monthTasks.filter((t) => t.status === "completed").length} completed
            </p>
          </div>
        </div>

        {/* Nav controls */}
        <div className="flex items-center gap-1.5">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={goToPrev}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8A8A8A] hover:bg-[#F0EDE6] hover:text-sidebar-hover border border-transparent hover:border-[#E8E8E4] transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={jumpToday}
            className="h-8 px-3.5 rounded-lg text-[11px] font-medium text-[#4A4A4A] border border-[#E8E8E4] hover:bg-[#F0EDE6] hover:border-[#C8C8C0] transition-all"
          >
            Today
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={goToNext}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8A8A8A] hover:bg-[#F0EDE6] hover:text-sidebar-hover border border-transparent hover:border-[#E8E8E4] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* ── Weekday headers ─────────────────────────────────── */}
      <div className="grid grid-cols-7 border-t border-l border-[#EBEBEA] shrink-0">
        {WEEKDAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-2.5 text-center text-[10px] font-semibold text-[#A8A8A0] uppercase tracking-widest border-r border-[#EBEBEA]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ──────────────────────────────────── */}
      <div
        className="flex-1 border-l border-[#EBEBEA] overflow-hidden"
        style={{ position: "relative" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={format(currentMonth, "yyyy-MM")}
            variants={gridVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="grid grid-cols-7 h-full"
            style={{
              gridTemplateRows: `repeat(${numWeeks}, 1fr)`,
            }}
          >
            {calendarDays.map((day, i) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDate.get(key) ?? [];
              return (
                <DayCell
                  key={i}
                  day={day}
                  isCurrentMonth={isSameMonth(day, currentMonth)}
                  tasks={dayTasks}
                  onAddTask={handleDayClick}
                  onTaskClick={handleTaskClick}
                />
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Empty state ─────────────────────────────────────── */}
      <AnimatePresence>
        {monthTasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ top: "180px" }}
          >
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#F4F4F0] flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-5 h-5 text-[#C0C0B8]" />
              </div>
              <p className="text-sm font-medium text-[#C0C0B8]">
                No tasks this month
              </p>
              <p className="text-xs text-[#D0D0C8] mt-1">
                Click any day to add one
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ──────────────────────────────────────────── */}
      <AnimatePresence>
        {smartTaskModal && (
          <SmartTaskModal
            key="smart-task-modal"
            date={smartTaskModal.date}
            onClose={() => setSmartTaskModal(null)}
            onTaskCreated={handleTaskCreated}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {leadResolution && (
          <LeadResolutionFlow
            key="lead-resolution"
            taskId={leadResolution.taskId}
            subject={leadResolution.subject}
            onClose={() => setLeadResolution(null)}
            onOpenAddLead={() => {
              setLeadResolution(null);
              setAddLeadOpen(true);
            }}
            onRefresh={handleRefresh}
          />
        )}
      </AnimatePresence>

      {/* AddLeadModal — dynamically loaded when needed */}
      <AddLeadModal
        externalOpen={addLeadOpen}
        onExternalOpenChange={setAddLeadOpen}
      />
    </div>
  );
}
