"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { updateSubTaskStatus } from "@/lib/actions/tasks";
import { ATLAS_TASK_STATUS_LABELS } from "@/lib/types/database";
import type { AtlasTaskStatus, TaskRemark } from "@/lib/types/database";

const ALL_STATUSES: AtlasTaskStatus[] = [
  "todo", "in_progress", "in_review", "done", "blocked", "error", "cancelled",
];

interface LogUpdateFormProps {
  taskId: string;
  currentStatus: AtlasTaskStatus;
  currentProgress: number;
  onOptimisticInsert: (remark: TaskRemark) => void;
  onStatusChange?: (newStatus: AtlasTaskStatus) => void;
  onProgressChange?: (newProgress: number) => void;
  currentUserId: string;
  currentUserName: string;
  currentUserJobTitle: string | null;
}

export function LogUpdateForm({
  taskId,
  currentStatus,
  currentProgress,
  onOptimisticInsert,
  onStatusChange,
  onProgressChange,
  currentUserId,
  currentUserName,
  currentUserJobTitle,
}: LogUpdateFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<AtlasTaskStatus>(currentStatus);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_CHARS = 1000;
  const statusChanged = selectedStatus !== currentStatus;

  // Mirror server logic: done → 100, everything else keeps current
  const resolvedProgress =
    selectedStatus === "done" ? 100 : currentProgress;

  // Keep selected status in sync when parent updates it after a post
  useEffect(() => {
    setSelectedStatus(currentStatus);
  }, [currentStatus]);

  function handleInputFocus() {
    setExpanded(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleCollapse() {
    setExpanded(false);
    setContent("");
    setSelectedStatus(currentStatus);
  }

  // Auto-grow textarea
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 6 * 24)}px`;
  }

  function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Please write something before posting.");
      return;
    }

    // Optimistic insert — progress_at_time mirrors server calculation
    const optimisticRemark: TaskRemark = {
      id:               `optimistic-${Date.now()}`,
      task_id:          taskId,
      author_id:        currentUserId,
      content:          trimmed,
      state_at_time:    selectedStatus,
      previous_status:  statusChanged ? currentStatus : null,
      progress_at_time: resolvedProgress,
      source:           "agent",
      created_at:       new Date().toISOString(),
      author: {
        id:        currentUserId,
        full_name: currentUserName,
        job_title: currentUserJobTitle,
      },
    };

    onOptimisticInsert(optimisticRemark);

    // Immediately reflect changes in the header / Zone A
    if (statusChanged) onStatusChange?.(selectedStatus);
    if (resolvedProgress !== currentProgress) onProgressChange?.(resolvedProgress);

    handleCollapse();

    startTransition(async () => {
      const result = await updateSubTaskStatus({
        task_id:        taskId,
        new_status:     selectedStatus,
        remark_content: trimmed,
        // no new_progress — server derives it the same way as resolvedProgress
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to post update. Please try again.");
      } else {
        toast.success("Update posted.");
      }
    });
  }

  return (
    <div className="border-t border-[#E5E4DF] bg-white pt-3">
      <AnimatePresence mode="wait">
        {!expanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-2"
          >
            <div
              className="flex-1 h-9 flex items-center px-3 rounded-lg border border-[#E5E4DF] bg-[#F9F9F6] cursor-text text-[13px] text-[#B5A99A]"
              onClick={handleInputFocus}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleInputFocus(); }}
            >
              Log a progress update, note, or observation…
            </div>
            <button
              type="button"
              onClick={handleInputFocus}
              className="h-9 px-4 rounded-lg bg-[#D4AF37] text-white text-[13px] font-medium hover:bg-[#A88B25] transition-colors"
            >
              Post
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="space-y-3 overflow-hidden"
          >
            {/* Status selector */}
            <IndulgeField label="New Status" htmlFor="log-status">
              <div className="flex flex-wrap gap-1.5">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedStatus(s)}
                    className={cn(
                      "inline-flex items-center rounded-full p-0.5 transition-all duration-100",
                      selectedStatus === s
                        ? "ring-2 ring-[#D4AF37]"
                        : "opacity-60 hover:opacity-90",
                    )}
                    aria-label={ATLAS_TASK_STATUS_LABELS[s]}
                    aria-pressed={selectedStatus === s}
                  >
                    <SubTaskStatusBadge status={s} size="sm" />
                  </button>
                ))}
              </div>
            </IndulgeField>

            {/* Status change preview */}
            {statusChanged && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[#D4AF37]/05 border border-[#D4AF37]/20 px-3 py-2">
                <span className="text-[11px] text-[#8A8A6E]">Status will change:</span>
                <SubTaskStatusBadge status={currentStatus} size="sm" />
                <span className="text-[#B5A99A] text-xs">→</span>
                <SubTaskStatusBadge status={selectedStatus} size="sm" />
                {selectedStatus === "done" && (
                  <span className="ml-auto text-[11px] text-[#A88B25] font-medium">
                    Progress → 100%
                  </span>
                )}
              </div>
            )}

            {/* Text area */}
            <IndulgeField
              label="Update"
              htmlFor="log-content"
              error={content.length > MAX_CHARS ? `${content.length - MAX_CHARS} chars over limit` : undefined}
            >
              <div className="relative">
                <textarea
                  id="log-content"
                  ref={textareaRef}
                  value={content}
                  onChange={handleTextareaChange}
                  placeholder="Describe what was completed, what you're working on, what's blocking progress, or any important observation…"
                  className={cn(
                    "w-full resize-none rounded-lg border border-[#E5E4DF] bg-[#F9F9F6] px-3 py-2.5 text-[13px] text-[#1A1A1A] placeholder:text-[#B5A99A] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-colors min-h-[72px] overflow-hidden",
                    content.length > MAX_CHARS && "border-[#C0392B] focus:border-[#C0392B]",
                  )}
                  maxLength={MAX_CHARS + 50}
                />
                <span
                  className={cn(
                    "absolute bottom-2 right-2.5 text-[10px] select-none",
                    content.length > MAX_CHARS * 0.9 ? "text-[#C0392B]" : "text-[#B5A99A]",
                  )}
                >
                  {content.length}/{MAX_CHARS}
                </span>
              </div>
            </IndulgeField>

            {/* Form actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleCollapse}
                className="flex items-center gap-1.5 text-[12px] text-[#8A8A6E] hover:text-[#1A1A1A] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <IndulgeButton
                variant="gold"
                size="sm"
                loading={isPending}
                onClick={handleSubmit}
                disabled={!content.trim() || content.length > MAX_CHARS}
                leftIcon={<Send className="h-3.5 w-3.5" />}
              >
                Post Update
              </IndulgeButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
