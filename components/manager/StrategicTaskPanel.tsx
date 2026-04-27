"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isToday, isPast, isTomorrow, format } from "date-fns";
import { completeTask } from "@/lib/actions/tasks";
import {
  dispatchTaskAlertAfterCompleteOrDelete,
  dispatchTaskAlertRefresh,
} from "@/lib/task-alert-refresh";
import { cn } from "@/lib/utils";
import type { TaskWithLead } from "@/lib/types/database";

// ── Task type metadata ────────────────────────────────────────

const TASK_LABELS: Record<string, string> = {
  campaign_review:      "Campaign Review",
  budget_approval:      "Budget Approval",
  strategy_meeting:     "Strategy Meeting",
  performance_analysis: "Perf. Analysis",
  call:           "Follow-up Call",
  general_follow_up:     "Nurture",
  whatsapp_message:        "WhatsApp",
  file_dispatch:            "Send File",
};

const TASK_COLORS: Record<string, string> = {
  campaign_review:      "#6B4FBB",
  budget_approval:      "#D4AF37",
  strategy_meeting:     "#2C6FAC",
  performance_analysis: "#4A7C59",
  call:           "#C5830A",
  general_follow_up:     "#8A8A6E",
  whatsapp_message:        "#4A7C59",
  file_dispatch:            "#2C6FAC",
};

const STRATEGIC = new Set([
  "campaign_review",
  "budget_approval",
  "strategy_meeting",
  "performance_analysis",
]);

// ── Helpers ───────────────────────────────────────────────────

function formatDue(iso: string): { label: string; overdue: boolean } {
  const d = new Date(iso);
  if (isToday(d))    return { label: "Today",    overdue: false };
  if (isTomorrow(d)) return { label: "Tomorrow", overdue: false };
  if (isPast(d))     return { label: "Overdue",  overdue: true  };
  return { label: format(d, "MMM d"), overdue: false };
}

// ── SVG Animated Checkbox ─────────────────────────────────────

function SvgCheckbox({
  checked,
  onClick,
  disabled,
}: {
  checked: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-shrink-0 focus:outline-none group/chk"
      aria-label="Complete task"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <motion.circle
          cx="10"
          cy="10"
          r="8.5"
          strokeWidth="1.5"
          animate={{
            fill:   checked ? "#D4AF37" : "transparent",
            stroke: checked ? "#D4AF37" : "#D0CFC4",
          }}
          transition={{ duration: 0.22 }}
        />
        <motion.path
          d="M6.5 10.5l2.5 2.5 5-6"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: checked ? 1 : 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        />
      </svg>
    </button>
  );
}

// ── Panel ─────────────────────────────────────────────────────

interface StrategicTaskPanelProps {
  initialTasks: TaskWithLead[];
}

export function StrategicTaskPanel({ initialTasks }: StrategicTaskPanelProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function handleComplete(taskId: string) {
    const snapshot = tasks.find((t) => t.id === taskId);
    setCompleting((prev) => new Set(prev).add(taskId));

    // Remove from list after the fade animation
    setTimeout(() => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setCompleting((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 680);

    startTransition(() => {
      void completeTask(taskId).then((r) => {
        if (!r.success) return;
        if (snapshot)
          dispatchTaskAlertAfterCompleteOrDelete({
            status: snapshot.status,
            due_date: snapshot.due_date,
          });
        else dispatchTaskAlertRefresh({ action: "fetch" });
      });
    });
  }

  const strategicCount = tasks.filter((t) => STRATEGIC.has(t.task_type)).length;
  const operationalCount = tasks.length - strategicCount;

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-2xl p-6 flex flex-col min-h-0">
      {/* Header */}
      <div className="mb-5">
        <h3
          className="text-[#1A1A1A] font-semibold text-base leading-snug"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Action Items
        </h3>
        <p className="text-[#9E9E9E] text-xs mt-0.5">
          {tasks.length} pending · your priorities
        </p>
      </div>

      {/* List */}
      <div className="flex-1 space-y-1.5 overflow-y-auto min-h-0">
        <AnimatePresence mode="popLayout" initial={false}>
          {tasks.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-[#9E9E9E] text-sm py-10"
            >
              All clear — enjoy the momentum.
            </motion.p>
          ) : (
            tasks.map((task) => {
              const isCompleting = completing.has(task.id);
              const isStrategic = STRATEGIC.has(task.task_type);
              const color = TASK_COLORS[task.task_type] ?? "#9E9E9E";
              const { label: dueLabel, overdue } = formatDue(task.due_date);

              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{
                    opacity: isCompleting ? 0.25 : 1,
                    y: 0,
                    scale: isCompleting ? 0.975 : 1,
                  }}
                  exit={{
                    opacity: 0,
                    x: -16,
                    transition: { duration: 0.28 },
                  }}
                  transition={{ duration: 0.28 }}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl transition-colors duration-150",
                    isStrategic
                      ? "bg-[#F8F5FF] border border-[#E6DEFF]"
                      : "hover:bg-[#F9F9F6]"
                  )}
                >
                  <SvgCheckbox
                    checked={isCompleting}
                    onClick={() => handleComplete(task.id)}
                    disabled={isCompleting}
                  />

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-[13px] leading-snug font-medium line-clamp-2",
                        isCompleting
                          ? "line-through text-[#9E9E9E]"
                          : "text-[#1A1A1A]"
                      )}
                    >
                      {task.title}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
                        style={{
                          background: `${color}1A`,
                          color,
                        }}
                      >
                        {TASK_LABELS[task.task_type] ?? task.task_type}
                      </span>

                      <span
                        className={cn(
                          "text-[10px] font-medium flex-shrink-0",
                          overdue ? "text-[#C0392B]" : "text-[#9E9E9E]"
                        )}
                      >
                        {dueLabel}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      {tasks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#F0EDE8]">
          <p className="text-[10px] text-[#9E9E9E] text-center">
            {strategicCount} strategic · {operationalCount} operational
          </p>
        </div>
      )}
    </div>
  );
}
