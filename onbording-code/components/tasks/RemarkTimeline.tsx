"use client";

import { formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { ATLAS_TASK_STATUS_LABELS, ATLAS_TASK_STATUS_COLORS } from "@/lib/types/database";
import type { TaskRemark } from "@/lib/types/database";
import { getInitials } from "@/lib/utils";

const IST = "Asia/Kolkata";

interface RemarkTimelineProps {
  remarks: TaskRemark[];
}

export function RemarkTimeline({ remarks }: RemarkTimelineProps) {
  if (remarks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-zinc-400">
        <MessageSquare className="h-8 w-8 opacity-30" aria-hidden />
        <p className="text-sm">No updates yet. Be the first to log a remark.</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-0" aria-label="Remark timeline">
      <AnimatePresence initial={false}>
        {remarks.map((remark, i) => {
          const isLast = i === remarks.length - 1;
          const statusColor = ATLAS_TASK_STATUS_COLORS[remark.state_at_time];
          const statusLabel = ATLAS_TASK_STATUS_LABELS[remark.state_at_time];
          const authorName = remark.author?.full_name ?? "Team member";
          const dateIST = toZonedTime(new Date(remark.created_at), IST);
          const timeAgo = formatDistanceToNow(dateIST, { addSuffix: true });

          return (
            <motion.li
              key={remark.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="flex gap-3"
            >
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: statusColor }}
                  aria-hidden
                >
                  {getInitials(authorName)}
                </div>
                {!isLast && (
                  <div className="mt-1 w-px flex-1 bg-zinc-200" aria-hidden />
                )}
              </div>

              {/* Content */}
              <div className={isLast ? "pb-0" : "pb-5"} style={{ flex: 1, minWidth: 0 }}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
                  <span className="text-xs font-semibold text-zinc-800">{authorName}</span>
                  {remark.author?.job_title && (
                    <span className="text-[10px] text-zinc-400">{remark.author.job_title}</span>
                  )}
                  <span className="text-[10px] text-zinc-400">{timeAgo}</span>
                </div>

                <p className="text-sm text-zinc-700 leading-relaxed mb-1.5">{remark.content}</p>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${statusColor}15`,
                      color: statusColor,
                    }}
                    aria-label={`Status: ${statusLabel}`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: statusColor }}
                      aria-hidden
                    />
                    {statusLabel}
                  </span>
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
