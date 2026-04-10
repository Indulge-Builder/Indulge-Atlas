"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { X, Crown, Send, Loader2, CalendarDays } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { getTaskById, addTaskProgress } from "@/lib/actions/tasks";
import type { TaskWithLead, TaskProgressUpdate } from "@/lib/types/database";

interface TaskDetailSheetProps {
  taskId: string | null;
  onClose: () => void;
  onProgressAdded?: () => void;
}

function formatTimelineDate(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dDay = new Date(d);
  dDay.setHours(0, 0, 0, 0);
  const days = Math.round((dDay.getTime() - today.getTime()) / 86400000);
  const dayLabel =
    days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : format(d, "MMM d");
  return `${dayLabel} · ${format(d, "h:mm a")}`;
}

export function TaskDetailSheet({
  taskId,
  onClose,
  onProgressAdded,
}: TaskDetailSheetProps) {
  const [task, setTask] = useState<TaskWithLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [updateText, setUpdateText] = useState("");
  const [posting, setPosting] = useState(false);
  const [optimisticUpdates, setOptimisticUpdates] = useState<TaskProgressUpdate[]>([]);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setOptimisticUpdates([]);
      return;
    }
    setLoading(true);
    getTaskById(taskId).then((t) => {
      setTask(t ?? null);
      setLoading(false);
    });
  }, [taskId]);

  const allUpdates = [
    ...(task?.progress_updates ?? []),
    ...optimisticUpdates,
  ].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const createdByRole = (task as TaskWithLead & { created_by_profile?: { role?: string } | null })
    ?.created_by_profile?.role;
  const assignedRole = (task as TaskWithLead & { assigned_to_profile?: { role?: string } | null })
    ?.assigned_to_profile?.role;
  const isFoundersTask =
    createdByRole === "admin" &&
    (assignedRole === "agent" || assignedRole === "manager");

  async function handlePostUpdate() {
    const trimmed = updateText.trim();
    if (!trimmed || !taskId || posting) return;

    const tempUpdate: TaskProgressUpdate = {
      timestamp: new Date().toISOString(),
      message: trimmed,
      user_id: "temp",
      user_name: "You",
    };
    setOptimisticUpdates((prev) => [...prev, tempUpdate]);
    setUpdateText("");
    setPosting(true);

    const result = await addTaskProgress(taskId, trimmed);
    setPosting(false);

    if (result.success) {
      setOptimisticUpdates((prev) =>
        prev.filter((u) => u.timestamp !== tempUpdate.timestamp),
      );
      onProgressAdded?.();
      if (task) {
        setTask({
          ...task,
          progress_updates: [
            ...(task.progress_updates ?? []),
            result.update!,
          ],
        });
      }
    } else {
      setOptimisticUpdates((prev) =>
        prev.filter((u) => u.timestamp !== tempUpdate.timestamp),
      );
      setUpdateText(trimmed);
    }
  }

  if (!taskId) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]"
        aria-hidden
      />
      <motion.div
        key="sheet"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed right-0 top-0 bottom-0 z-[60] w-full max-w-md bg-white/95 backdrop-blur-2xl ring-1 ring-stone-200/50 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 shrink-0">
          <h2
            className="text-stone-800 font-semibold text-lg"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Task Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : !task ? (
          <div className="flex-1 flex items-center justify-center text-stone-500 text-sm">
            Task not found
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Top: Task details */}
            <div className="px-6 py-5 space-y-4 shrink-0 border-b border-stone-100">
              <div className="flex items-start gap-3">
                {isFoundersTask && (
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)] flex items-center gap-1 shrink-0">
                    <Crown size={12} />
                    Founder&apos;s Task
                  </span>
                )}
                <h3 className="text-stone-800 font-medium text-base leading-snug">
                  {task.title}
                </h3>
              </div>

              {task.notes?.trim() && (
                <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">
                  {task.notes.trim()}
                </p>
              )}

              <div className="flex items-center gap-4 text-sm text-stone-500">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4" />
                  Due {format(new Date(task.due_date), "MMM d, yyyy 'at' h:mm a")}
                </span>
              </div>

              {((task as TaskWithLead & { assigned_to_profiles?: { id: string; full_name: string; role?: string }[] })
                ?.assigned_to_profiles?.length ?? 0) > 0 && (
                <div className="flex items-center gap-3">
                  <AvatarStack
                    assignees={
                      (task as TaskWithLead & { assigned_to_profiles?: { id: string; full_name: string; role?: string }[] })
                        .assigned_to_profiles ?? []
                    }
                    maxVisible={3}
                    size="md"
                  />
                  <span className="text-sm text-stone-600">
                    Assigned to{" "}
                    <span className="font-medium text-stone-700">
                      {(task as TaskWithLead & { assigned_to_profiles?: { full_name: string }[] })
                        .assigned_to_profiles
                        ?.map((p) => p.full_name)
                        .join(", ") ?? "Unknown"}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Middle: Timeline */}
            <div className="flex-1 min-h-0 flex flex-col">
              <p className="px-6 py-3 text-[11px] font-semibold text-stone-400 uppercase tracking-widest">
                Progress Timeline
              </p>
              <ScrollArea className="flex-1 px-6 pb-4">
                <div className="space-y-4">
                  {allUpdates.length === 0 ? (
                    <p className="text-sm text-stone-400 py-6">
                      No updates yet. Post the first update below.
                    </p>
                  ) : (
                    allUpdates.map((update, i) => (
                      <motion.div
                        key={update.timestamp ? `${update.timestamp}-${i}` : `update-${i}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="flex gap-3"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-stone-100 text-stone-600 text-xs">
                            {update.user_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2) ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-stone-500 mb-0.5">
                            {formatTimelineDate(update.timestamp)} ·{" "}
                            {update.user_name}
                          </p>
                          <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2.5">
                            <p className="text-sm text-stone-700 leading-relaxed">
                              {update.message}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Bottom: Update input */}
            <div className="shrink-0 p-4 border-t border-stone-100 bg-stone-50/50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handlePostUpdate();
                    }
                  }}
                  placeholder="Add an update…"
                  disabled={posting}
                  className={cn(
                    "flex-1 h-10 px-3 rounded-xl border border-stone-200 bg-white text-sm",
                    "text-stone-700 placeholder:text-stone-400",
                    "focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/40",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                  )}
                />
                <Button
                  onClick={handlePostUpdate}
                  disabled={!updateText.trim() || posting}
                  className="h-10 px-4 rounded-xl bg-stone-800 hover:bg-stone-900 text-white shrink-0"
                >
                  {posting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1.5" />
                      Post
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
