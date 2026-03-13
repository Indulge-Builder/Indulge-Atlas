"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle2, Clock } from "lucide-react";
import { getTasksForReminders } from "@/lib/actions/tasks";
import { formatLocalTime } from "@/lib/utils/date-format";
import type { TaskWithLead, TaskType } from "@/lib/types/database";

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call: "Call",
  general_follow_up: "Follow-up",
  email: "Email",
  whatsapp_message: "WhatsApp",
  file_dispatch: "Send Document",
  campaign_review: "Campaign Review",
  strategy_meeting: "Strategy Meeting",
  budget_approval: "Budget Approval",
  performance_analysis: "Performance Analysis",
};

function formatTaskLabel(task: TaskWithLead): string {
  const typeLabel = TASK_TYPE_LABELS[task.task_type] ?? task.title;
  const leadName =
    task.lead?.first_name || task.lead?.last_name
      ? `${task.lead.first_name ?? ""} ${task.lead.last_name ?? ""}`.trim()
      : null;
  return leadName ? `${typeLabel} — ${leadName}` : typeLabel;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskWithLead[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch on mount to show badge; refetch when dropdown opens
  useEffect(() => {
    getTasksForReminders().then((data) => setTasks(data ?? []));
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getTasksForReminders()
      .then((data) => setTasks(data ?? []))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const hasTasks = tasks.length > 0;

  return (
    <div className="relative" ref={panelRef}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="
          relative w-9 h-9 rounded-xl
          flex items-center justify-center
          text-[#9E9E9E] hover:text-[#1A1A1A]
          hover:bg-black/[0.04]
          transition-colors duration-150
        "
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" strokeWidth={1.75} />
        {/* Live indicator dot — shows when there are upcoming tasks */}
        {hasTasks && (
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#D4AF37] rounded-full ring-2 ring-[#F9F9F6]" />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="
              absolute right-0 top-full mt-2 w-80
              rounded-xl border border-black/[0.06]
              bg-[#F9F9F6] shadow-xl
              overflow-hidden z-50
            "
          >
            <div className="px-4 py-3 border-b border-black/[0.05]">
              <p className="text-[11px] font-semibold text-[#B0ADA8] uppercase tracking-[0.2em]">
                Upcoming Tasks
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center">
                  <Clock className="w-6 h-6 mx-auto text-[#C8C4BE] animate-pulse" />
                  <p className="text-[12px] text-[#9E9E9E] mt-2">Loading…</p>
                </div>
              ) : !hasTasks ? (
                <div className="p-6 text-center">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-[#C8C4BE]" />
                  <p className="text-[13px] text-[#9E9E9E] mt-2">
                    No upcoming tasks
                  </p>
                  <p className="text-[11px] text-[#B0ADA8] mt-0.5">
                    You&rsquo;re all caught up
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-black/[0.04]">
                  {tasks.map((task) => (
                    <li
                      key={task.id}
                      className="px-4 py-3 hover:bg-black/[0.02] transition-colors"
                    >
                      <p className="text-[13px] text-[#1A1A1A] font-medium leading-snug">
                        {formatTaskLabel(task)}
                      </p>
                      <p className="text-[11px] text-[#9E9E9E] mt-0.5 tabular-nums">
                        {formatLocalTime(task.due_date)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
