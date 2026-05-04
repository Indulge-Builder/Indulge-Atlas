"use client";

import Link from "next/link";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { MemberAvatarStack } from "./MemberAvatarStack";
import type { MasterTask } from "@/lib/types/database";
import * as LucideIcons from "lucide-react";

const IST = "Asia/Kolkata";

interface MasterTaskCardProps {
  task: MasterTask;
}

function getIcon(iconKey: string | null | undefined) {
  if (!iconKey) return null;
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>;
  const Icon = icons[iconKey];
  return Icon ?? null;
}

export function MasterTaskCard({ task }: MasterTaskCardProps) {
  const accentColor = task.cover_color ?? "#D4AF37";
  const Icon = getIcon(task.icon_key);
  const total     = task.subtask_count ?? 0;
  const done      = task.completed_subtask_count ?? 0;
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0;
  const members = (task.members ?? []).map((m) => ({
    id:        m.user_id,
    full_name: m.profile?.full_name ?? "Member",
    job_title: m.profile?.job_title ?? null,
  }));

  const isOverdue =
    task.due_date &&
    task.atlas_status !== "done" &&
    task.atlas_status !== "cancelled" &&
    new Date(task.due_date) < new Date();

  const dueDateLabel = task.due_date
    ? format(toZonedTime(new Date(task.due_date), IST), "d MMM yyyy")
    : null;

  // Circular progress ring
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <Link
      href={`/tasks/${task.id}`}
      aria-label={`Open task: ${task.title}`}
      className="block outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-2xl"
    >
      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "hidden" }),
          "group relative cursor-pointer transition-all duration-200",
          "hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.14)]",
        )}
        style={{}}
      >
        {/* Gold glow on hover */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ boxShadow: `0 0 0 1px ${accentColor}40` }}
          aria-hidden
        />

        <div className="p-4">
          {/* Top row */}
          <div className="flex items-start gap-2.5 mb-2.5">
            {Icon && (
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${accentColor}18` }}
                aria-hidden
              >
                <Icon className="h-4 w-4" style={{ color: accentColor }} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="font-serif text-base font-semibold text-zinc-900 truncate leading-tight">
                {task.title}
              </h3>
              {task.department && (
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
                  {task.department}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-[13px] text-zinc-500 leading-relaxed mb-3 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Bottom row */}
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              {members.length > 0 && (
                <MemberAvatarStack members={members} max={4} size="xs" />
              )}

              {total > 0 && (
                <span className="text-[10px] text-zinc-400 font-medium">
                  {done}/{total} tasks
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {dueDateLabel && (
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded",
                    isOverdue
                      ? "bg-red-500/10 text-red-600"
                      : "bg-zinc-100 text-zinc-500",
                  )}
                >
                  {dueDateLabel}
                </span>
              )}

              {/* Circular progress ring */}
              <div className="relative h-8 w-8" aria-label={`${pct}% complete`}>
                <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90" aria-hidden>
                  <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="none"
                    stroke="#E5E4DF"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="none"
                    stroke={accentColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-700"
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-[8px] font-bold"
                  style={{ color: accentColor }}
                >
                  {pct}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
