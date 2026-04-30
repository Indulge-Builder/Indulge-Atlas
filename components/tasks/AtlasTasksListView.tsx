"use client";

import { useState, useMemo, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Search,
  Eye,
  X,
  SlidersHorizontal,
  Calendar,
  Check,
  Trash2,
  LayoutGrid,
} from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { cn, getInitials } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { MemberAvatarStack } from "./MemberAvatarStack";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import Link from "next/link";
import { SubTaskModal } from "./SubTaskModal";
import { AddSubTaskInline } from "./AddSubTaskInline";
import { IndulgeButton } from "@/components/ui/indulge-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteMasterTask } from "@/lib/actions/tasks";
import { useMasterTasksIndexRealtime } from "@/lib/hooks/useTaskRealtime";
import { ATLAS_TASK_STATUS_LABELS, ATLAS_TASK_STATUS_VALUES } from "@/lib/types/database";
import type {
  MasterTask,
  SubTask,
  TaskGroup,
  AtlasTaskStatus,
  TaskPriority,
} from "@/lib/types/database";
import * as LucideIcons from "lucide-react";
import {
  AtlasTasksCompletionOverview,
  type AtlasTasksData,
} from "./AtlasTasksCompletionOverview";

const IST = "Asia/Kolkata";

function formatDateIST(iso: string): string {
  return format(toZonedTime(new Date(iso), IST), "d MMM");
}

function isOverdue(isoDate: string | null, status: AtlasTaskStatus): boolean {
  if (!isoDate) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(isoDate) < new Date();
}

function isToday(isoDate: string): boolean {
  const d = toZonedTime(new Date(isoDate), IST);
  const now = toZonedTime(new Date(), IST);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function getIcon(iconKey: string | null | undefined): React.ComponentType<{ className?: string; style?: React.CSSProperties }> | null {
  if (!iconKey) return null;
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>;
  return icons[iconKey] ?? null;
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const ALL_PRIORITIES: TaskPriority[] = ["critical", "urgent", "high", "medium", "low"];

interface Filters {
  search:       string;
  statuses:     AtlasTaskStatus[];
  priorities:   TaskPriority[];
  assignee:     string;
  showArchived: boolean;
}

interface TeamMemberOption { id: string; full_name: string; }

// ── Reusable multi-select dropdown ────────────────────────────────────────────

interface MultiSelectOption { value: string; label: string; }

interface MultiSelectDropdownProps {
  label:     string;
  options:   MultiSelectOption[];
  selected:  string[];
  onChange:  (vals: string[]) => void;
}

function MultiSelectDropdown({ label, options, selected, onChange }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allSelected = selected.length === options.length;
  const someSelected = selected.length > 0 && !allSelected;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggleAll() {
    onChange(allSelected ? [] : options.map((o) => o.value));
  }

  function toggleOne(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const displayLabel = selected.length === 0
    ? label
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? label
      : `${label} · ${selected.length}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "h-9 flex items-center gap-2 px-3 rounded-lg border text-[13px] font-medium transition-all select-none",
          selected.length > 0
            ? "border-[#D4AF37] bg-[#D4AF37]/08 text-[#A88B25]"
            : "border-[#E5E4DF] bg-[#F9F9F6] text-[#6B6B6B] hover:border-[#D0C8BE]",
        )}
      >
        {displayLabel}
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-xl border border-[#E5E4DF] bg-white shadow-[0_4px_20px_-4px_rgb(0_0_0/0.12)] overflow-hidden"
          >
            {/* Select all row */}
            <button
              type="button"
              onClick={toggleAll}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F9F9F6] transition-colors border-b border-[#E5E4DF]"
            >
              <span
                className={cn(
                  "w-4 h-4 rounded flex items-center justify-center border-2 shrink-0 transition-all",
                  allSelected
                    ? "bg-[#D4AF37] border-[#D4AF37]"
                    : someSelected
                      ? "bg-[#D4AF37]/20 border-[#D4AF37]"
                      : "border-[#D0C8BE]",
                )}
              >
                {allSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                {someSelected && <span className="w-1.5 h-0.5 bg-[#D4AF37] rounded-full" />}
              </span>
              <span className="text-[12px] font-semibold text-[#1A1A1A]">Select all</span>
            </button>

            {/* Individual options */}
            <div className="py-1 max-h-[220px] overflow-y-auto">
              {options.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleOne(opt.value)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#F9F9F6] transition-colors"
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded flex items-center justify-center border-2 shrink-0 transition-all duration-100",
                        checked
                          ? "bg-[#D4AF37] border-[#D4AF37]"
                          : "border-[#D0C8BE] hover:border-[#D4AF37]",
                      )}
                    >
                      {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="text-[13px] text-[#1A1A1A] text-left">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Single-select dropdown (assignee) ─────────────────────────────────────────

interface SingleSelectDropdownProps {
  label:    string;
  options:  MultiSelectOption[];
  value:    string;
  onChange: (val: string) => void;
}

function SingleSelectDropdown({ label, options, value, onChange }: SingleSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentLabel = options.find((o) => o.value === value)?.label;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "h-9 flex items-center gap-2 px-3 rounded-lg border text-[13px] font-medium transition-all select-none",
          value
            ? "border-[#D4AF37] bg-[#D4AF37]/08 text-[#A88B25]"
            : "border-[#E5E4DF] bg-[#F9F9F6] text-[#6B6B6B] hover:border-[#D0C8BE]",
        )}
      >
        {currentLabel ?? label}
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute top-full left-0 mt-1.5 z-50 min-w-[160px] rounded-xl border border-[#E5E4DF] bg-white shadow-[0_4px_20px_-4px_rgb(0_0_0/0.12)] overflow-hidden py-1"
          >
            {/* Clear option */}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#F9F9F6] transition-colors border-b border-[#E5E4DF] mb-1"
              >
                <X className="w-3.5 h-3.5 text-[#B5A99A]" />
                <span className="text-[12px] text-[#8A8A6E]">Clear</span>
              </button>
            )}
            {options.map((opt) => {
              const isActive = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#F9F9F6] transition-colors"
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                      isActive ? "border-[#D4AF37] bg-[#D4AF37]" : "border-[#D0C8BE]",
                    )}
                  >
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="text-[13px] text-[#1A1A1A] text-left truncate">{opt.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters:     Filters;
  onChange:    (f: Filters) => void;
  teamMembers: TeamMemberOption[];
}

function FilterBar({ filters, onChange, teamMembers }: FilterBarProps) {
  const isActive =
    filters.search ||
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.assignee ||
    filters.showArchived;

  const statusOptions: MultiSelectOption[] = ATLAS_TASK_STATUS_VALUES.map((s) => ({
    value: s,
    label: ATLAS_TASK_STATUS_LABELS[s],
  }));

  const priorityOptions: MultiSelectOption[] = ALL_PRIORITIES.map((p) => ({
    value: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
  }));

  const assigneeOptions: MultiSelectOption[] = teamMembers.map((m) => ({
    value: m.id,
    label: m.full_name,
  }));

  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-[#E5E4DF] px-6 py-3 flex flex-wrap items-center gap-2.5">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B5A99A]" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search tasks…"
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E5E4DF] bg-[#F9F9F6] text-[13px] text-[#1A1A1A] placeholder:text-[#B5A99A] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-colors"
        />
      </div>

      {/* Status multi-select */}
      <MultiSelectDropdown
        label="Status"
        options={statusOptions}
        selected={filters.statuses}
        onChange={(vals) => onChange({ ...filters, statuses: vals as AtlasTaskStatus[] })}
      />

      {/* Priority multi-select */}
      <MultiSelectDropdown
        label="Priority"
        options={priorityOptions}
        selected={filters.priorities}
        onChange={(vals) => onChange({ ...filters, priorities: vals as TaskPriority[] })}
      />

      {/* Assignee single-select */}
      {teamMembers.length > 0 && (
        <SingleSelectDropdown
          label="Assignee"
          options={assigneeOptions}
          value={filters.assignee}
          onChange={(val) => onChange({ ...filters, assignee: val })}
        />
      )}

      {/* Archived toggle */}
      <label className="flex items-center gap-1.5 text-[12px] text-[#6B6B6B] cursor-pointer select-none">
        <span
          className={cn(
            "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
            filters.showArchived
              ? "bg-[#D4AF37] border-[#D4AF37]"
              : "border-[#D0C8BE]",
          )}
          onClick={() => onChange({ ...filters, showArchived: !filters.showArchived })}
        >
          {filters.showArchived && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
        </span>
        Archived
      </label>

      {/* Clear filters */}
      {isActive && (
        <button
          type="button"
          onClick={() => onChange({ search: "", statuses: [], priorities: [], assignee: "", showArchived: false })}
          className="flex items-center gap-1 text-[12px] text-[#8A8A6E] hover:text-[#C0392B] transition-colors ml-auto"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

// ── Date chip ──────────────────────────────────────────────────────────────────

function DateChip({ isoDate, status }: { isoDate: string | null; status: AtlasTaskStatus }) {
  if (!isoDate) return null;
  const overdue = isOverdue(isoDate, status);
  const today   = isToday(isoDate);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5",
        overdue ? "bg-[#C0392B]/10 text-[#C0392B]"
          : today ? "bg-[#D4AF37]/10 text-[#A88B25]"
          : "bg-[#F2F2EE] text-[#6B6B6B]",
      )}
    >
      <Calendar className="w-3 h-3" />
      {formatDateIST(isoDate)}
    </span>
  );
}

// ── Subtask row inside an expanded accordion ───────────────────────────────────

interface SubtaskRowProps {
  task: SubTask;
  onOpenModal: (id: string) => void;
}

function SubtaskRow({ task, onOpenModal }: SubtaskRowProps) {
  const firstProfile = (task.assigned_to_profiles ?? [])[0];
  const assigneeInitials = firstProfile?.full_name
    ? getInitials(firstProfile.full_name)
    : "—";
  const atlasStatus = (task.atlas_status ?? "todo") as AtlasTaskStatus;

  return (
    <div
      className="group flex items-center gap-3 px-5 py-2.5 hover:bg-[#F9F9F6] transition-colors cursor-pointer border-b border-[#E5E4DF] last:border-b-0"
      onClick={() => onOpenModal(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenModal(task.id); }}
    >
      {/* Status */}
      <SubTaskStatusBadge status={atlasStatus} size="sm" />

      {/* Title */}
      <span className="flex-1 text-[13px] text-[#1A1A1A] min-w-0 truncate">
        {task.title}
      </span>

      {/* Assignee avatar */}
      <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[9px] font-bold text-[#A88B25] shrink-0">
        {assigneeInitials}
      </div>

      {/* Priority */}
      <TaskPriorityBadge priority={task.priority ?? "medium"} size="sm" />

      {/* Due date */}
      <DateChip isoDate={task.due_date} status={atlasStatus} />

      {/* View button (hover reveal) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenModal(task.id); }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-[#D4AF37]/10 text-[#A88B25] hover:bg-[#D4AF37]/20 transition-all ml-1"
        aria-label={`View ${task.title}`}
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Master task accordion row ─────────────────────────────────────────────────

interface MasterTaskRowProps {
  masterTask: MasterTask;
  taskGroups: Array<TaskGroup & { tasks: SubTask[] }>;
  currentUserId: string;
  onOpenModal: (id: string) => void;
  canSelectMaster?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onSubtasksChanged?: () => void;
}

function MasterTaskRow({
  masterTask,
  taskGroups,
  currentUserId: _currentUserId,
  onOpenModal,
  canSelectMaster = false,
  isSelected = false,
  onToggleSelect,
  onSubtasksChanged,
}: MasterTaskRowProps) {
  const [open, setOpen] = useState(false);
  const accentColor = masterTask.cover_color ?? "#D4AF37";
  const Icon = getIcon(masterTask.icon_key);

  const allSubtasks: SubTask[] = taskGroups.flatMap((g) => g.tasks);
  /** Prefer counts from loaded subtask rows so the bar matches list + status (detail fetch omits aggregates unless enriched). */
  const total =
    allSubtasks.length > 0
      ? allSubtasks.length
      : (masterTask.subtask_count ?? 0);
  const done =
    allSubtasks.length > 0
      ? allSubtasks.filter((t) => t.atlas_status === "done").length
      : (masterTask.completed_subtask_count ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const firstBoardColumn = [...taskGroups].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  )[0];
  const defaultGroupId = firstBoardColumn?.id ?? null;

  const avatarStackMembers = (masterTask.members ?? []).map((m) => ({
    id:        m.user_id,
    full_name: m.profile?.full_name ?? "Member",
    job_title: m.profile?.job_title ?? null,
  }));

  return (
    <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "xs", overflow: "visible" }), "overflow-hidden")}>
      {/* Header row — optional selection + expand */}
      <div className="flex items-stretch min-w-0">
        {canSelectMaster && onToggleSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className="shrink-0 flex items-center justify-center w-11 border-r border-[#E5E4DF] hover:bg-[#FAFAF8] transition-colors"
            aria-label={isSelected ? "Deselect master task" : "Select master task"}
            role="checkbox"
            aria-checked={isSelected}
          >
            <span
              className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                isSelected
                  ? "bg-[#D4AF37] border-[#D4AF37]"
                  : "border-[#D0C8BE]",
              )}
            >
              {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
            </span>
          </button>
        )}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${masterTask.title}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-workspace-link]")) return;
            setOpen((p) => !p);
          }}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).closest("[data-workspace-link]")) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((p) => !p);
            }
          }}
          className="flex flex-1 min-w-0 cursor-pointer items-center gap-3 px-5 py-4 text-left outline-none transition-colors hover:bg-[#FAFAF8] focus-visible:bg-[#FAFAF8] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4AF37]/35"
        >
        {/* Chevron */}
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className={cn("w-4 h-4 shrink-0 text-[#B5A99A] rotate-[-90deg]", open && "rotate-0")} />
        </motion.div>

        {/* Icon */}
        <div
          className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          {Icon ? (
            <Icon className="w-4 h-4" style={{ color: accentColor }} />
          ) : (
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
          )}
        </div>

        {/* Title + workspace */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <span className="min-w-0 flex-1 truncate font-serif text-[15px] font-semibold text-[#1A1A1A]">
            {masterTask.title}
          </span>
          <Link
            data-workspace-link
            href={`/tasks/${masterTask.id}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open workspace: ${masterTask.title}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 sm:px-3",
              "border-[#D4AF37]/45 bg-gradient-to-b from-[#FCFAF4] to-[#F3ECD8]",
              "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8B7320]",
              "shadow-[0_1px_2px_rgb(0_0_0/0.05)]",
              "transition-all duration-200",
              "hover:border-[#D4AF37] hover:shadow-[0_4px_14px_-4px_rgb(212_175_55/0.45)] hover:text-[#6B5A18]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/45",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5 opacity-90" aria-hidden />
            <span>Workspace</span>
          </Link>
        </div>

        {/* Avatars */}
        {avatarStackMembers.length > 0 && (
          <MemberAvatarStack members={avatarStackMembers} max={4} size="sm" />
        )}

        {/* Progress bar + pct */}
        <div className="flex items-center gap-2 w-32 shrink-0">
          <div className="flex-1 h-1.5 rounded-full bg-[#E5E4DF] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#D4AF37] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-[#6B6B6B] tabular-nums font-medium w-9 text-right">{pct}%</span>
        </div>

        {/* Subtask count */}
        <span className="text-[12px] text-[#8A8A6E] shrink-0 w-16 text-right">
          {done}/{total} done
        </span>

        {/* Due date */}
        {masterTask.due_date && (
          <DateChip isoDate={masterTask.due_date} status={masterTask.atlas_status} />
        )}
        </div>
      </div>

      {/* Expanded subtask list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="subtasks"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#E5E4DF] bg-[#FAFAF8]">
              {allSubtasks.length === 0 ? (
                <p className="px-5 pt-4 pb-2 text-[12px] text-[#B5A99A] italic">
                  No subtasks yet.
                </p>
              ) : (
                allSubtasks.map((st) => (
                  <SubtaskRow key={st.id} task={st} onOpenModal={onOpenModal} />
                ))
              )}

              {defaultGroupId ? (
                <div className="px-5 pb-3 pt-2 border-t border-[#E5E4DF]/70">
                  {taskGroups.length > 1 && firstBoardColumn && (
                    <p className="text-[11px] text-[#B5A99A] mb-2">
                      New tasks are added to{" "}
                      <span className="font-medium text-[#8A8A6E]">
                        {firstBoardColumn.title}
                      </span>
                      {" "}(first group). Change status from the task sheet as work moves forward.
                    </p>
                  )}
                  <AddSubTaskInline
                    masterTaskId={masterTask.id}
                    groupId={defaultGroupId}
                    members={masterTask.members ?? []}
                    onCreated={() => onSubtasksChanged?.()}
                  />
                </div>
              ) : (
                <div className="px-5 pb-4 pt-2 border-t border-[#E5E4DF]/70">
                  <p className="text-[12px] text-[#8A8A6E] mb-2">
                    Add at least one task group in the workspace to create subtasks from this list.
                  </p>
                  <Link
                    href={`/tasks/${masterTask.id}`}
                    className="text-[13px] font-medium text-[#A88B25] underline hover:text-[#8B7320]"
                  >
                    Open workspace →
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Department group header ────────────────────────────────────────────────────

function DeptHeader({ department }: { department: string }) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8A8A6E]">
        {department.charAt(0).toUpperCase() + department.slice(1)}
      </span>
      <div className="flex-1 h-px bg-[#E5E4DF]" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AtlasTasksListViewProps {
  tasks: AtlasTasksData[];
  currentUser: {
    id: string;
    full_name: string;
    job_title: string | null;
    role: string;
    department: string | null;
  };
}

export function AtlasTasksListView({
  tasks,
  currentUser,
}: AtlasTasksListViewProps) {
  const router = useRouter();
  const masterIdsForRealtime = useMemo(() => tasks.map((t) => t.masterTask.id), [tasks]);
  useMasterTasksIndexRealtime(masterIdsForRealtime);

  const [isBulkDeleting, startBulkDelete] = useTransition();
  const canDeleteMaster = ["admin", "founder"].includes(currentUser.role);

  const [filters, setFilters] = useState<Filters>({
    search:       "",
    statuses:     [],
    priorities:   [],
    assignee:     "",
    showArchived: false,
  });
  const [activeModalId, setActiveModalId] = useState<string | null>(null);
  const [selectedMasterIds, setSelectedMasterIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  function toggleMasterSelect(id: string) {
    setSelectedMasterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function clearMasterSelection() {
    setSelectedMasterIds([]);
  }

  function selectAllFilteredVisible(ids: string[]) {
    setSelectedMasterIds(ids);
  }

  function runBulkDelete() {
    startBulkDelete(async () => {
      const ids = [...selectedMasterIds];
      let failed = 0;
      for (const id of ids) {
        const r = await deleteMasterTask(id);
        if (!r.success) failed++;
      }
      if (failed === 0) {
        toast.success(
          ids.length === 1
            ? "Master task deleted"
            : `Deleted ${ids.length} master tasks`,
        );
      } else {
        toast.error(
          failed === ids.length
            ? "Could not delete selected tasks"
            : `${ids.length - failed} deleted; ${failed} failed`,
        );
      }
      setBulkDeleteOpen(false);
      setSelectedMasterIds([]);
      router.refresh();
    });
  }

  const selectedTitlesOrdered = useMemo(() => {
    const byId = new Map(
      tasks.map(({ masterTask }) => [masterTask.id, masterTask.title] as const),
    );
    return selectedMasterIds.map((id) => byId.get(id) ?? id);
  }, [tasks, selectedMasterIds]);

  // Derive team members for assignee filter from all subtasks
  const teamMembers = useMemo<TeamMemberOption[]>(() => {
    const map = new Map<string, string>();
    for (const { taskGroups } of tasks) {
      for (const g of taskGroups) {
        for (const st of g.tasks) {
          const profiles = (st as SubTask & { assigned_to_profiles?: { id: string; full_name: string }[] }).assigned_to_profiles ?? [];
          for (const p of profiles) map.set(p.id, p.full_name);
        }
      }
    }
    return [...map.entries()].map(([id, full_name]) => ({ id, full_name }));
  }, [tasks]);

  // Client-side filtering
  const filtered = useMemo<AtlasTasksData[]>(() => {
    const q = filters.search.toLowerCase();
    return (tasks as AtlasTasksData[])
      .filter(({ masterTask }) => {
        if (!filters.showArchived && masterTask.archived_at) return false;
        if (filters.showArchived && !masterTask.archived_at) return false;
        return true;
      })
      .map(({ masterTask, taskGroups }) => {
        const filteredGroups = taskGroups.map((g) => ({
          ...g,
          tasks: (g.tasks as SubTask[]).filter((st) => {
            if (q && !st.title.toLowerCase().includes(q) && !masterTask.title.toLowerCase().includes(q)) return false;
            const stAtlas = (st.atlas_status ?? "todo") as AtlasTaskStatus;
            if (filters.statuses.length > 0 && !filters.statuses.includes(stAtlas)) return false;
            if (filters.priorities.length > 0 && !filters.priorities.includes(st.priority as TaskPriority)) return false;
            if (filters.assignee && !(st.assigned_to_users as string[])?.includes(filters.assignee)) return false;
            return true;
          }) as SubTask[],
        }));
        return { masterTask, taskGroups: filteredGroups };
      })
      .filter(({ masterTask, taskGroups }) => {
        if (q && !masterTask.title.toLowerCase().includes(q)) {
          return taskGroups.some((g) => g.tasks.length > 0);
        }
        return true;
      });
  }, [tasks, filters]);

  // Group by department if privileged
  const isPrivileged = ["admin", "founder", "manager"].includes(currentUser.role);
  const grouped = useMemo(() => {
    if (!isPrivileged) return null;
    const map = new Map<string, AtlasTasksData[]>();
    for (const item of filtered) {
      const dept = item.masterTask.department ?? "general";
      const arr = map.get(dept) ?? [];
      arr.push(item);
      map.set(dept, arr);
    }
    return map;
  }, [filtered, isPrivileged]);

  const renderList = (items: AtlasTasksData[]) =>
    items.map(({ masterTask, taskGroups }) => (
      <MasterTaskRow
        key={masterTask.id}
        masterTask={masterTask}
        taskGroups={taskGroups}
        currentUserId={currentUser.id}
        onOpenModal={setActiveModalId}
        canSelectMaster={canDeleteMaster}
        isSelected={selectedMasterIds.includes(masterTask.id)}
        onToggleSelect={() => toggleMasterSelect(masterTask.id)}
        onSubtasksChanged={() => router.refresh()}
      />
    ));

  const filteredMasterIds = useMemo(
    () => filtered.map((f) => f.masterTask.id),
    [filtered],
  );

  return (
    <div className="flex flex-col min-h-0">
      <AtlasTasksCompletionOverview tasks={tasks} />
      <FilterBar filters={filters} onChange={setFilters} teamMembers={teamMembers} />

      {canDeleteMaster && selectedMasterIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 border-b border-[#E5E4DF] bg-[#F2F2EE]/80 shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#1A1A1A]">
            <span className="font-medium">
              {selectedMasterIds.length} selected
            </span>
            <button
              type="button"
              onClick={() => selectAllFilteredVisible(filteredMasterIds)}
              className="text-[12px] text-[#A88B25] underline hover:text-[#8B7320]"
            >
              Select all visible
            </button>
            <button
              type="button"
              onClick={clearMasterSelection}
              className="text-[12px] text-[#8A8A6E] hover:text-[#1A1A1A]"
            >
              Clear
            </button>
          </div>
          <IndulgeButton
            variant="outline"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            Delete
          </IndulgeButton>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <SlidersHorizontal className="w-8 h-8 text-[#D0C8BE] mb-3" />
            <p className="text-[14px] text-[#8A8A6E]">No tasks match your filters.</p>
            <button
              type="button"
              onClick={() => setFilters({ search: "", statuses: [], priorities: [], assignee: "", showArchived: false })}
              className="mt-2 text-[13px] text-[#D4AF37] underline"
            >
              Clear filters
            </button>
          </div>
        ) : grouped ? (
          [...grouped.entries()].map(([dept, items]) => (
            <div key={dept}>
              <DeptHeader department={dept} />
              <div className="space-y-2">{renderList(items)}</div>
            </div>
          ))
        ) : (
          renderList(filtered)
        )}
      </div>

      {/* Subtask modal */}
      <AnimatePresence>
        {activeModalId && (
          <SubTaskModal
            key={activeModalId}
            taskId={activeModalId}
            onClose={() => setActiveModalId(null)}
            currentUser={{
              id:        currentUser.id,
              full_name: currentUser.full_name,
              job_title: currentUser.job_title,
            }}
          />
        )}
      </AnimatePresence>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedMasterIds.length === 1 ? "master task" : `${selectedMasterIds.length} master tasks`}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This permanently removes the selected task
                  {selectedMasterIds.length > 1 ? "s" : ""}, including all groups and subtasks.
                  This cannot be undone.
                </p>
                <ul className="list-disc pl-4 max-h-32 overflow-y-auto text-[#1A1A1A] text-[13px] space-y-0.5">
                  {selectedTitlesOrdered.slice(0, 8).map((title, i) => (
                    <li key={`${selectedMasterIds[i]}-${i}`} className="truncate">
                      {title}
                    </li>
                  ))}
                </ul>
                {selectedMasterIds.length > 8 && (
                  <p className="text-[12px] text-[#8A8A6E]">
                    …and {selectedMasterIds.length - 8} more
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <IndulgeButton
              variant="outline"
              size="sm"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={isBulkDeleting}
            >
              Cancel
            </IndulgeButton>
            <IndulgeButton
              variant="gold"
              size="sm"
              loading={isBulkDeleting}
              onClick={runBulkDelete}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Delete permanently
            </IndulgeButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
