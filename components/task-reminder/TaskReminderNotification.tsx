"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { completeTask } from "@/lib/actions/tasks";
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

interface TaskReminderNotificationProps {
  task: TaskWithLead;
  onDismiss: () => void;
}

export function TaskReminderNotification({
  task,
  onDismiss,
}: TaskReminderNotificationProps) {
  const displayText =
    task.notes?.trim() ||
    task.title ||
    TASK_TYPE_LABELS[task.task_type] ||
    "Task due now";

  const leadName =
    task.lead?.first_name || task.lead?.last_name
      ? `${task.lead.first_name ?? ""} ${task.lead.last_name ?? ""}`.trim()
      : null;

  const fullDisplay = leadName ? `${displayText} — ${leadName}` : displayText;

  async function handleMarkDone() {
    const result = await completeTask(task.id);
    if (result.success) {
      onDismiss();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      className="fixed top-5 right-5 z-[9999] pointer-events-auto w-full max-w-sm"
    >
      <div
        className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1A1A] shadow-2xl backdrop-blur-md"
        style={{
          boxShadow:
            "0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div className="p-4">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#D4AF37" }}
          >
            Task Reminder
          </p>
          <p className="mt-2 text-sm text-white/90 leading-snug">
            {fullDisplay}
          </p>
          <button
            onClick={handleMarkDone}
            className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 hover:border-white/20"
          >
            <Check className="w-3.5 h-3.5" />
            Mark as Done
          </button>
        </div>
      </div>
    </motion.div>
  );
}
