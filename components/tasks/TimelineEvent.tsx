"use client";

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Settings2 } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { ATLAS_SYSTEM_AUTHOR_ID, ELIA_AUTHOR_ID } from "@/lib/types/database";
import type { TaskRemark } from "@/lib/types/database";

const IST = "Asia/Kolkata";

// ── Avatar helpers ────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface HumanAvatarProps {
  name: string;
  size?: "sm" | "md";
}

function HumanAvatar({ name, size = "md" }: HumanAvatarProps) {
  const dim = size === "sm" ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-xs";
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-[#D4AF37]/20 text-[#A88B25] font-semibold shrink-0 select-none",
        dim,
      )}
      aria-hidden
    >
      {getInitials(name)}
    </div>
  );
}

function EliaOrb() {
  return (
    <div className="w-8 h-8 rounded-full shrink-0 relative overflow-hidden" aria-label="Elia AI">
      <div
        className="absolute inset-0 rounded-full animate-spin"
        style={{
          background: "conic-gradient(from 0deg, #7C3AED, #D4AF37, #7C3AED)",
          animationDuration: "3s",
        }}
      />
      <div className="absolute inset-[2px] rounded-full bg-white/90 flex items-center justify-center">
        <span className="text-[9px] font-bold tracking-tight text-purple-600">E</span>
      </div>
    </div>
  );
}

function SystemIcon() {
  return (
    <div className="w-6 h-6 rounded-full bg-[#F2F2EE] flex items-center justify-center shrink-0" aria-hidden>
      <Settings2 className="w-3 h-3 text-[#8A8A6E]" />
    </div>
  );
}

// ── Timestamp with tooltip ────────────────────────────────────────────────────

interface TimestampProps {
  isoString: string;
}

function Timestamp({ isoString }: TimestampProps) {
  const { relative, absolute } = useMemo(() => {
    const zonedDate = toZonedTime(new Date(isoString), IST);
    const rel = formatDistanceToNow(zonedDate, { addSuffix: true });
    const abs = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(isoString));
    return { relative: rel, absolute: abs };
  }, [isoString]);

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="text-[11px] text-[#B5A99A] cursor-default shrink-0">{relative}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-[200] rounded-lg bg-[#1A1814] px-3 py-1.5 text-[11px] text-white shadow-lg"
            sideOffset={4}
          >
            {absolute} IST
            <Tooltip.Arrow className="fill-[#1A1814]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ── Status transition indicator ───────────────────────────────────────────────

function StatusTransition({
  from,
  to,
}: {
  from: TaskRemark["state_at_time"];
  to: TaskRemark["state_at_time"];
}) {
  if (!from || !to || from === to) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      <SubTaskStatusBadge status={from} size="sm" />
      <span className="text-[#B5A99A] text-xs">→</span>
      <SubTaskStatusBadge status={to} size="sm" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface TimelineEventProps {
  remark: TaskRemark;
  isNew?: boolean;
  className?: string;
}

export function TimelineEvent({ remark, isNew = false, className }: TimelineEventProps) {
  const source = remark.source ?? "agent";
  const isSystem = source === "system" || remark.author_id === ATLAS_SYSTEM_AUTHOR_ID;
  const isElia   = source === "elia"   || remark.author_id === ELIA_AUTHOR_ID;
  const authorName = remark.author?.full_name ?? "Team Member";
  const authorTitle = remark.author?.job_title;

  // ── System log entry (Type 2) ─────────────────────────────────────────────
  if (isSystem) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 py-2 px-1 group",
          isNew && "animate-in fade-in slide-in-from-top-2 duration-300",
          className,
        )}
      >
        <SystemIcon />
        <p className="text-[12px] text-[#8A8A6E] italic leading-relaxed pt-0.5 flex-1 min-w-0">
          {remark.content}
        </p>
        <Timestamp isoString={remark.created_at} />
      </div>
    );
  }

  // ── Elia AI entry (Type 3) ────────────────────────────────────────────────
  if (isElia) {
    return (
      <div
        className={cn(
          "rounded-xl p-4 relative",
          surfaceCardVariants({ tone: "glass", elevation: "xs" }),
          "border border-purple-200/40",
          isNew && "animate-in fade-in slide-in-from-top-2 duration-300",
          className,
        )}
        style={{
          background:
            "linear-gradient(135deg, rgba(124,58,237,0.04) 0%, rgba(212,175,55,0.04) 100%)",
        }}
      >
        {/* Gradient border effect */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            padding: "1px",
            background: "linear-gradient(135deg, #7C3AED30, #D4AF3730)",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <EliaOrb />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1A1A1A] leading-tight">Elia</p>
              <p className="text-[11px] text-purple-500 leading-tight">AI Agent</p>
            </div>
          </div>
          <Timestamp isoString={remark.created_at} />
        </div>
        <p className="text-[13px] text-[#1A1A1A] leading-relaxed">{remark.content}</p>
        {remark.previous_status && remark.state_at_time && remark.previous_status !== remark.state_at_time && (
          <StatusTransition from={remark.previous_status} to={remark.state_at_time} />
        )}
      </div>
    );
  }

  // ── Human agent update (Type 1) ───────────────────────────────────────────
  return (
    <div
      className={cn(
        "rounded-xl p-4 relative border-l-2 border-l-[#D4AF37]",
        surfaceCardVariants({ tone: "subtle", elevation: "xs" }),
        isNew && "animate-in fade-in slide-in-from-top-2 duration-300",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <HumanAvatar name={authorName} />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#1A1A1A] leading-tight truncate">
              {authorName}
            </p>
            {authorTitle && (
              <p className="text-[11px] text-[#8A8A6E] leading-tight truncate">{authorTitle}</p>
            )}
          </div>
        </div>
        <Timestamp isoString={remark.created_at} />
      </div>

      <p className="text-[13px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">
        {remark.content}
      </p>

      {/* Status transition indicator */}
      {remark.previous_status && remark.state_at_time && remark.previous_status !== remark.state_at_time && (
        <StatusTransition from={remark.previous_status} to={remark.state_at_time} />
      )}

      {/* Progress delta */}
      {remark.progress_at_time !== null && remark.progress_at_time !== undefined && (
        <div className="mt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37]/10 px-2 py-0.5 text-[11px] text-[#A88B25] font-medium">
            Progress: {remark.progress_at_time}%
          </span>
        </div>
      )}
    </div>
  );
}
