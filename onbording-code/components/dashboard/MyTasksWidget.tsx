"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckSquare, Clock, Check, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { completeTask } from "@/lib/actions/tasks";
import {
  dispatchTaskAlertAfterCompleteOrDelete,
  dispatchTaskAlertRefresh,
} from "@/lib/task-alert-refresh";
import { formatLocalDateTime } from "@/lib/utils/date-format";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types/database";

const TASK_TYPE_LABELS: Record<Task["task_type"], string> = {
  call: "Call",
  email: "Email",
  general_follow_up: "Follow-up",
  whatsapp_message: "WhatsApp Message",
  file_dispatch: "Send File",
  campaign_review: "Campaign Review",
  strategy_meeting: "Strategy Meeting",
  budget_approval: "Budget Approval",
  performance_analysis: "Performance Analysis",
};

interface MyTasksWidgetProps {
  tasks: Task[];
}

export function MyTasksWidget({ tasks }: MyTasksWidgetProps) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const now = new Date();
  const overdue = tasks.filter(
    (t) => !completedIds.has(t.id) && new Date(t.due_date) < now
  );
  const upcoming = tasks.filter(
    (t) => !completedIds.has(t.id) && new Date(t.due_date) >= now
  );

  async function handleComplete(taskId: string) {
    setCompleting(taskId);
    const result = await completeTask(taskId);
    if (result.success) {
      setCompletedIds((prev) => new Set([...prev, taskId]));
      const task = tasks.find((t) => t.id === taskId);
      if (task) dispatchTaskAlertAfterCompleteOrDelete(task);
      else dispatchTaskAlertRefresh({ action: "fetch" });
    }
    setCompleting(null);
  }

  const visibleTasks = [...overdue, ...upcoming];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="font-serif text-lg">My Tasks</CardTitle>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Scheduled follow-ups & reminders
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overdue.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-[#FAEAE8] text-[#C0392B] text-[10px] font-semibold">
              {overdue.length} overdue
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-[#EBF4EF] flex items-center justify-center mb-2">
              <CheckSquare className="w-4 h-4 text-[#4A7C59]" />
            </div>
            <p className="text-sm text-[#4A7C59] font-medium">All done!</p>
            <p className="text-xs text-[#B5A99A] mt-0.5">No upcoming tasks.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleTasks.slice(0, 5).map((task, i) => {
              const isOverdue = new Date(task.due_date) < now;
              const isCompleting = completing === task.id;

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 5) * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                    isOverdue
                      ? "bg-[#FAEAE8]/50 border-[#C0392B]/15"
                      : "bg-[#F9F9F6] border-[#E5E4DF]"
                  )}
                >
                  <button
                    onClick={() => handleComplete(task.id)}
                    disabled={isCompleting}
                    className={cn(
                      "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                      isOverdue
                        ? "border-[#C0392B]/40 hover:border-[#C0392B] hover:bg-[#C0392B]/10"
                        : "border-[#D0C8BE] hover:border-[#D4AF37] hover:bg-[#D4AF37]/10"
                    )}
                  >
                    {isCompleting && (
                      <div className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A] truncate">
                      {task.title}
                    </p>
                    {task.lead && (
                      <Link
                        href={`/leads/${task.lead.id}`}
                        className="text-xs text-[#D4AF37] hover:underline truncate block"
                      >
                        {task.lead.first_name + " " + (task.lead.last_name ?? "")}
                      </Link>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          isOverdue
                            ? "bg-[#FAEAE8] text-[#C0392B]"
                            : "bg-[#F2F2EE] text-[#8A8A6E]"
                        )}
                      >
                        {TASK_TYPE_LABELS[task.task_type]}
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] text-[#B5A99A]">
                        <Clock className="w-2.5 h-2.5" />
                        {formatLocalDateTime(task.due_date)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
