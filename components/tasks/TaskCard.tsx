"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  Repeat2,
  MessageCircle,
  FileText,
  BarChart3,
  Users,
  BadgeDollarSign,
  TrendingUp,
  ExternalLink,
  Trash2,
  Clock,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { formatLocalTime } from "@/lib/utils/date-format";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TaskWithLead, TaskType, UserRole } from "@/lib/types/database";

// ── Task type display config ───────────────────────────────

const TASK_CONFIG: Record<
  TaskType,
  {
    label: string;
    Icon: React.FC<{ className?: string }>;
    color: string;
    bgColor: string;
    isManagerTask: boolean;
  }
> = {
  call: {
    label: "Follow-up Call",
    Icon: Phone,
    color: "#2C6FAC",
    bgColor: "#E8F0FA",
    isManagerTask: false,
  },
  general_follow_up: {
    label: "Nurture Follow-up",
    Icon: Repeat2,
    color: "#8A8A6E",
    bgColor: "#F4F4EE",
    isManagerTask: false,
  },
  whatsapp_message: {
    label: "WhatsApp",
    Icon: MessageCircle,
    color: "#25D366",
    bgColor: "#E8F8ED",
    isManagerTask: false,
  },
  file_dispatch: {
    label: "Send Document",
    Icon: FileText,
    color: "#6B4FBB",
    bgColor: "#F0EBFF",
    isManagerTask: false,
  },
  campaign_review: {
    label: "Campaign Review",
    Icon: BarChart3,
    color: "#D4AF37",
    bgColor: "#FBF4E0",
    isManagerTask: true,
  },
  strategy_meeting: {
    label: "Strategy Meeting",
    Icon: Users,
    color: "#C5830A",
    bgColor: "#FEF3D0",
    isManagerTask: true,
  },
  budget_approval: {
    label: "Budget Approval",
    Icon: BadgeDollarSign,
    color: "#4A7C59",
    bgColor: "#EBF4EF",
    isManagerTask: true,
  },
  performance_analysis: {
    label: "Performance Analysis",
    Icon: TrendingUp,
    color: "#7C5ABB",
    bgColor: "#F2EEFF",
    isManagerTask: true,
  },
  email: {
    label: "Email",
    Icon: FileText,
    color: "#2C6FAC",
    bgColor: "#E8F0FA",
    isManagerTask: false,
  },
};

// ── Luxury SVG Checkbox ────────────────────────────────────

interface LuxuryCheckboxProps {
  checked: boolean;
  completing?: boolean;
  onClick: () => void;
  color: string;
}

function LuxuryCheckbox({
  checked,
  completing,
  onClick,
  color,
}: LuxuryCheckboxProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={checked && !completing}
      whileHover={!checked ? { scale: 1.08 } : {}}
      whileTap={!checked ? { scale: 0.94 } : {}}
      className="shrink-0 w-5 h-5 focus:outline-none"
      aria-label={checked ? "Task completed" : "Mark task complete"}
    >
      <svg viewBox="0 0 20 20" fill="none" className="w-full h-full">
        <rect
          x="1.5"
          y="1.5"
          width="17"
          height="17"
          rx="5"
          stroke={checked || completing ? color : "#D0CEC8"}
          strokeWidth="1.5"
          fill={checked || completing ? color : "transparent"}
          className="transition-all duration-200"
        />
        {(checked || completing) && (
          <motion.path
            d="M6 10l3 3 5-5"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        )}
      </svg>
    </motion.button>
  );
}

// ── TaskCard ───────────────────────────────────────────────

interface TaskCardProps {
  task: TaskWithLead;
  role: UserRole;
  onComplete: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (task: TaskWithLead) => void;
  isCompleting?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function TaskCard({
  task,
  role,
  onComplete,
  onDelete,
  onEdit,
  isCompleting = false,
  isExpanded = false,
  onToggleExpand,
}: TaskCardProps) {
  const config = TASK_CONFIG[task.task_type];
  const isDone = task.status === "completed" || isCompleting;

  const timeLabel = formatLocalTime(task.due_date);

  const whatsappHref = task.lead?.phone_number
    ? `https://wa.me/${task.lead.phone_number.replace(/\D/g, "")}`
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDone ? 0.52 : 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.25 } }}
      transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
      className={cn(
        "group relative bg-white rounded-2xl border transition-all duration-200",
        isDone
          ? "border-[#EAEAEA] grayscale"
          : "border-[#EAEAEA] hover:border-[#D4D0C8] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
        onToggleExpand && "cursor-pointer"
      )}
      onClick={onToggleExpand}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ background: isDone ? "#D0CEC8" : config.color }}
      />

      <div className="pl-5 pr-4 py-4">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <span onClick={(e) => e.stopPropagation()}>
            <LuxuryCheckbox
              checked={task.status === "completed"}
              completing={isCompleting}
              onClick={() => task.status !== "completed" && onComplete(task.id)}
              color={config.color}
            />
          </span>

          <div className="flex-1 min-w-0">
            {/* Task type badge + time */}
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: isDone ? "#F4F4F0" : config.bgColor,
                  color: isDone ? "#9E9E9E" : config.color,
                }}
              >
                <config.Icon className="w-2.5 h-2.5" />
                {config.label}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[#9E9E9E]">
                <Clock className="w-2.5 h-2.5" />
                {timeLabel}
              </span>
            </div>

            {/* Title */}
            <p
              className={cn(
                "text-sm font-medium leading-snug text-[#1A1A1A] transition-all duration-300",
                isDone && "line-through text-[#9E9E9E]"
              )}
            >
              {task.title}
            </p>

            {/* Lead info — agent tasks */}
            {task.lead && !config.isManagerTask && (
              <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                  <span className="text-xs text-[#4A4A4A] font-medium">
                    {task.lead.first_name} {task.lead.last_name ?? ""}
                  </span>
                </div>
                <span className="text-xs text-[#9E9E9E]">
                  {task.lead.phone_number}
                </span>
              </div>
            )}

            {/* Manager task — no lead context required */}
            {config.isManagerTask && !task.lead && (
              <p className="mt-1.5 text-[11px] text-[#9E9E9E]">
                Strategic task · no lead attached
              </p>
            )}

            {/* Manager task linked to a lead (optional) */}
            {config.isManagerTask && task.lead && (
              <div className="mt-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#C5830A]" />
                <span className="text-xs text-[#4A4A4A]">
                  {task.lead.first_name} {task.lead.last_name ?? ""}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons (visible on hover) */}
          {!isDone && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEdit && (
                <motion.button
                  initial={{ opacity: 0 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  className="p-1.5 rounded-lg text-[#C0C0B8] hover:text-[#D4AF37] hover:bg-[#FBF4E0]"
                  title="Edit task"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </motion.button>
              )}
              {onDelete && (
                <motion.button
                  initial={{ opacity: 0 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task.id);
                  }}
                  className="p-1.5 rounded-lg text-[#C0C0B8] hover:text-[#C0392B] hover:bg-[#FAEAE8]"
                  title="Delete task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </div>
          )}
        </div>

        {/* Action buttons — only for non-completed agent tasks */}
        {!isDone && (
          <div
            className="mt-3 flex items-center gap-2 pl-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* View Lead */}
            {task.lead && (
              <Link href={`/leads/${task.lead.id}`} passHref>
                <motion.span
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4F4F0] text-[#4A4A4A] text-xs font-medium hover:bg-[#EAEAE0] transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  View Lead
                </motion.span>
              </Link>
            )}

            {/* WhatsApp quick action */}
            {task.task_type === "whatsapp_message" && whatsappHref && (
              <motion.a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E8F8ED] text-[#25D366] text-xs font-semibold hover:bg-[#D0F0DA] transition-colors"
              >
                <MessageCircle className="w-3 h-3" />
                WhatsApp
              </motion.a>
            )}

            {/* Campaign link for manager review tasks */}
            {task.task_type === "campaign_review" && (
              <Link href="/manager/campaigns" passHref>
                <motion.span
                  whileHover={{ scale: 1.02 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FBF4E0] text-[#D4AF37] text-xs font-medium hover:bg-[#F5EAC8] transition-colors cursor-pointer"
                >
                  <BarChart3 className="w-3 h-3" />
                  View Campaigns
                </motion.span>
              </Link>
            )}
          </div>
        )}

        {/* Expanded section — notes + live countdown */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-black/[0.05] space-y-3">
                {task.notes?.trim() && (
                  <p className="text-sm text-[#9E9E9E] leading-relaxed whitespace-pre-wrap">
                    {task.notes.trim()}
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-[11px] text-[#B5A99A]">
                  <Clock className="w-3 h-3" />
                  <span>{format(new Date(task.due_date), "MMM d, yyyy 'at' h:mm a")}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
