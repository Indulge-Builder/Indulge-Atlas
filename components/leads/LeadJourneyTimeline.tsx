"use client";

import { motion } from "framer-motion";
import {
  GitBranch,
  MessageSquare,
  Phone,
  CheckSquare,
  ArrowRight,
  Trophy,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { LeadActivity } from "@/lib/types/database";

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  status_change: ArrowRight,
  note: MessageSquare,
  call_attempt: Phone,
  task_created: CheckSquare,
};

const ACTIVITY_COLORS: Record<string, { bg: string; icon: string }> = {
  status_change: { bg: "#E8F0FA", icon: "#2C6FAC" },
  note: { bg: "#F4F4EE", icon: "#8A8A6E" },
  call_attempt: { bg: "#FEF3D0", icon: "#C5830A" },
  task_created: { bg: "#F0EBFF", icon: "#6B4FBB" },
};

function getActivityDescription(activity: LeadActivity): string {
  const payload = activity.payload as Record<string, unknown>;

  switch (activity.type) {
    case "status_change":
      return `Status changed from ${payload.from} → ${payload.to}${
        payload.note ? `: "${payload.note}"` : ""
      }`;
    case "note":
      return payload.text as string ?? "Note added";
    case "call_attempt":
      return payload.outcome === "no_answer"
        ? `Call attempted — no answer. Retry scheduled.`
        : `Call attempt recorded`;
    case "task_created":
      return `Task scheduled: ${payload.title ?? payload.task_type}`;
    default:
      return "Activity recorded";
  }
}

interface LeadJourneyTimelineProps {
  activities: LeadActivity[];
}

export function LeadJourneyTimeline({ activities }: LeadJourneyTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-10 h-10 rounded-full bg-[#F2F2EE] flex items-center justify-center mb-2">
          <GitBranch className="w-4 h-4 text-[#B5A99A]" />
        </div>
        <p className="text-sm text-[#B5A99A]">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[18px] top-6 bottom-0 w-px bg-[#E5E4DF]" />

      <div className="space-y-4">
        {activities.map((activity, i) => {
          const Icon = ACTIVITY_ICONS[activity.type] ?? GitBranch;
          const colors =
            ACTIVITY_COLORS[activity.type] ?? ACTIVITY_COLORS.note;

          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-3 relative"
            >
              {/* Icon bubble */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white z-10"
                style={{ backgroundColor: colors.bg }}
              >
                <Icon className="w-4 h-4" style={{ color: colors.icon }} />
              </div>

              {/* Content */}
              <div className="flex-1 pt-1.5 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-[#1A1A1A] leading-snug">
                      {getActivityDescription(activity)}
                    </p>
                    {activity.agent && (
                      <p className="text-[11px] text-[#B5A99A] mt-0.5">
                        by {activity.agent.full_name}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-[#B5A99A] shrink-0 mt-0.5">
                    {formatDateTime(activity.created_at)}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
