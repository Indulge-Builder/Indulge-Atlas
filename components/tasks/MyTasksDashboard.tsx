"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  MoreHorizontal,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { format, isToday as dateFnsIsToday, isThisWeek, isFuture, isSameDay, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { LuxuryCalendar } from "./LuxuryCalendar";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { SubTaskModal } from "./SubTaskModal";
import {
  completePersonalTask,
  createPersonalTask,
  getMyTasks,
} from "@/lib/actions/tasks";
import { TASK_PRIORITY_CONFIG } from "@/lib/types/database";
import type { PersonalTask, SubTask, AtlasTaskStatus } from "@/lib/types/database";
import type { TaskPriority } from "@/lib/types/database";

const IST = "Asia/Kolkata";

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDateIST(iso: string): string {
  return format(toZonedTime(new Date(iso), IST), "d MMM");
}

function isOverdue(isoDate: string | null, status: AtlasTaskStatus): boolean {
  if (!isoDate) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(isoDate) < new Date();
}

function isTodayIST(iso: string): boolean {
  return dateFnsIsToday(toZonedTime(new Date(iso), IST));
}

function isThisWeekIST(iso: string): boolean {
  return isThisWeek(toZonedTime(new Date(iso), IST), { weekStartsOn: 1 });
}

function isUpcomingIST(iso: string): boolean {
  return isFuture(toZonedTime(new Date(iso), IST)) && !isThisWeekIST(iso);
}

// ── Task grouping ─────────────────────────────────────────────────────────────

type TaskBucket = "overdue" | "today" | "this_week" | "upcoming" | "no_date";

type AnyTask = (PersonalTask | (SubTask & { masterTaskTitle?: string | null })) & {
  atlas_status: AtlasTaskStatus;
};

function bucketTask(task: AnyTask): TaskBucket {
  if (!task.due_date) return "no_date";
  if (isOverdue(task.due_date, task.atlas_status)) return "overdue";
  if (isTodayIST(task.due_date)) return "today";
  if (isThisWeekIST(task.due_date)) return "this_week";
  if (isUpcomingIST(task.due_date)) return "upcoming";
  return "no_date";
}

const BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue:   "Overdue",
  today:     "Due Today",
  this_week: "Due This Week",
  upcoming:  "Upcoming",
  no_date:   "No Due Date",
};

// ── Date chip ──────────────────────────────────────────────────────────────────

function DateChip({ isoDate, status }: { isoDate: string; status: AtlasTaskStatus }) {
  const overdue = isOverdue(isoDate, status);
  const today   = isTodayIST(isoDate);
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

// ── Task row ───────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: AnyTask;
  onComplete: (id: string) => void;
  onOpenModal: (id: string) => void;
  isCompleting: boolean;
}

function TaskRow({ task, onComplete, onOpenModal, isCompleting }: TaskRowProps) {
  const [done, setDone] = useState(false);
  const masterTitle = (task as SubTask & { masterTaskTitle?: string | null }).masterTaskTitle ?? null;
  const isSubtask = (task as SubTask).unified_task_type === "subtask";
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority as TaskPriority] ?? TASK_PRIORITY_CONFIG.medium;

  function handleComplete(e: React.MouseEvent) {
    e.stopPropagation();
    setDone(true);
    setTimeout(() => onComplete(task.id), 600);
  }

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          initial={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="group flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF8] transition-colors cursor-pointer border-b border-[#E5E4DF] last:border-b-0"
          onClick={() => isSubtask ? onOpenModal(task.id) : undefined}
          role={isSubtask ? "button" : undefined}
          tabIndex={isSubtask ? 0 : undefined}
        >
          {/* Completion checkbox */}
          <button
            type="button"
            onClick={handleComplete}
            disabled={isCompleting}
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200",
              "border-[#D0C8BE] hover:border-[#D4AF37]",
            )}
            aria-label="Complete task"
          >
            <AnimatePresence>
              {done && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <CheckCircle2 className="w-5 h-5 text-[#D4AF37] -m-0.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          {/* Title + breadcrumb */}
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-[13px] font-medium text-[#1A1A1A] truncate transition-all",
                done && "line-through text-[#B5A99A]",
              )}
            >
              {task.title}
            </p>
            {masterTitle && (
              <p className="text-[11px] text-[#B5A99A] truncate mt-0.5">{masterTitle}</p>
            )}
          </div>

          {/* Priority dot */}
          <span
            className={cn("w-2 h-2 rounded-full shrink-0", priorityCfg.dotClass)}
            title={priorityCfg.label}
          />

          {/* Due date */}
          {task.due_date && (
            <DateChip isoDate={task.due_date} status={task.atlas_status} />
          )}

          {/* Overflow menu */}
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#F2F2EE] text-[#B5A99A] transition-all shrink-0"
            aria-label="Task actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Section group ─────────────────────────────────────────────────────────────

interface SectionGroupProps {
  bucket: TaskBucket;
  tasks: AnyTask[];
  onComplete: (id: string) => void;
  onOpenModal: (id: string) => void;
  completing: string | null;
}

function SectionGroup({ bucket, tasks, onComplete, onOpenModal, completing }: SectionGroupProps) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {bucket === "overdue" && <AlertCircle className="w-3.5 h-3.5 text-[#C0392B]" />}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8A8A6E]">
          {BUCKET_LABELS[bucket]}
        </span>
        <span className="text-[10px] font-medium bg-[#E5E4DF] text-[#6B6B6B] rounded-full px-1.5 py-0.5">
          {tasks.length}
        </span>
        <div className="flex-1 h-px bg-[#E5E4DF]" />
      </div>
      <div className="rounded-xl border border-[#E5E4DF] bg-white overflow-hidden">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onComplete={onComplete}
            onOpenModal={onOpenModal}
            isCompleting={completing === t.id}
          />
        ))}
      </div>
    </div>
  );
}

// ── Priority pills config ─────────────────────────────────────────────────────

const PRIORITY_PILLS: Array<{
  value: TaskPriority;
  label: string;
  activeClass: string;
  dotClass: string;
}> = [
  { value: "urgent", label: "Critical", activeClass: "bg-[#C0392B] text-white border-[#C0392B]",       dotClass: "bg-[#C0392B]" },
  { value: "high",   label: "High",     activeClass: "bg-[#E8824A] text-white border-[#E8824A]",       dotClass: "bg-[#E8824A]" },
  { value: "medium", label: "Medium",   activeClass: "bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]",  dotClass: "bg-[#D4AF37]" },
  { value: "low",    label: "Low",      activeClass: "bg-[#B5A99A] text-white border-[#B5A99A]",       dotClass: "bg-[#B5A99A]" },
];

// ── Quick add inline form ─────────────────────────────────────────────────────

interface QuickAddFormProps {
  onAdded: () => void;
}

function QuickAddForm({ onAdded }: QuickAddFormProps) {
  const [open, setOpen]           = useState(false);
  const [title, setTitle]         = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate]     = useState<Date | undefined>(undefined);
  const [priority, setPriority]   = useState<TaskPriority>("medium");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function handleClose() {
    setOpen(false);
    setTitle("");
    setDescription("");
    setDueDate(undefined);
    setPriority("medium");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createPersonalTask({
        title:       trimmed,
        description: description.trim() || undefined,
        due_date:    dueDate ? dueDate.toISOString() : undefined,
        priority,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to create task.");
      } else {
        toast.success("Task added.");
        handleClose();
        onAdded();
      }
    });
  }

  return (
    <div className="mt-2 border-t border-[#E5E4DF] pt-4">
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={handleOpen}
            className="group flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border border-dashed border-[#D9D4CC] hover:border-[#D4AF37] hover:bg-[#FDFCF8] transition-all duration-200"
          >
            <div className="w-5 h-5 rounded-full border-2 border-[#D0C8BE] group-hover:border-[#D4AF37] flex items-center justify-center transition-colors shrink-0">
              <Plus className="w-3 h-3 text-[#B5A99A] group-hover:text-[#D4AF37] transition-colors" />
            </div>
            <span className="text-[13px] text-[#B5A99A] group-hover:text-[#8A8A6E] transition-colors">
              Add a task for today…
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <form
              onSubmit={handleSubmit}
              onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
              className="rounded-xl border border-[#E0DBCF] bg-white shadow-sm overflow-hidden"
            >
              {/* Gold accent bar */}
              <div className="h-0.5 w-full bg-gradient-to-r from-[#D4AF37] via-[#E8C84A] to-[#D4AF37]" />

              <div className="p-4 space-y-4">
                {/* Title */}
                <div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full bg-transparent text-[15px] font-medium text-[#1A1A1A] placeholder:text-[#C8BFB5] outline-none border-none"
                  />
                </div>

                {/* Description */}
                <div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add notes or context…"
                    rows={2}
                    className="w-full bg-transparent text-[13px] text-[#5A5A5A] placeholder:text-[#C8BFB5] outline-none border-none resize-none leading-relaxed"
                  />
                </div>

                {/* Divider */}
                <div className="h-px bg-[#F0EBE3]" />

                {/* Due date + Priority row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  {/* Due date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest mb-1.5">
                      Due Date
                    </p>
                    <LuxuryDatePicker
                      value={dueDate}
                      onChange={setDueDate}
                      placeholder="Pick a date & time…"
                      className="h-9 text-[13px] rounded-lg border-[#E0DBCF] bg-[#FAFAF8] hover:border-[#D4AF37]/60"
                    />
                  </div>

                  {/* Priority pills */}
                  <div className="sm:w-auto">
                    <p className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest mb-1.5">
                      Priority
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {PRIORITY_PILLS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPriority(p.value)}
                          className={cn(
                            "flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-all duration-150",
                            priority === p.value
                              ? p.activeClass
                              : "border-[#E0DBCF] bg-[#FAFAF8] text-[#6B6B6B] hover:border-[#D0C8BE]",
                          )}
                        >
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            priority === p.value ? "bg-current opacity-80" : p.dotClass,
                          )} />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-[12px] text-[#B5A99A] hover:text-[#6B6B6B] transition-colors"
                  >
                    Discard
                  </button>
                  <IndulgeButton
                    type="submit"
                    variant="gold"
                    size="sm"
                    loading={isPending}
                    disabled={!title.trim()}
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Add Task
                  </IndulgeButton>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface MyTasksDashboardProps {
  personalTasks: PersonalTask[];
  subTasks: Array<SubTask & { masterTaskTitle: string | null }>;
  currentUser: {
    id: string;
    full_name: string;
    job_title: string | null;
  };
  onRefresh: () => void;
}

export function MyTasksDashboard({
  personalTasks,
  subTasks,
  currentUser,
  onRefresh,
}: MyTasksDashboardProps) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [activeModalId, setActiveModalId] = useState<string | null>(null);
  const [localPersonal, setLocalPersonal] = useState<PersonalTask[]>(personalTasks);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Merge all tasks into one list
  const allTasks = useMemo<AnyTask[]>(() => {
    const personal = localPersonal.map((t) => ({ ...t, unified_task_type: "personal" as const }));
    return [...personal, ...subTasks];
  }, [localPersonal, subTasks]);

  // Separate due dates for calendar dot indicators
  const taskDates = useMemo<Date[]>(() =>
    localPersonal
      .filter((t) => t.due_date && t.atlas_status !== "done" && t.atlas_status !== "cancelled")
      .map((t) => parseISO(t.due_date!)),
  [localPersonal]);

  const atlasTaskDates = useMemo<Date[]>(() =>
    subTasks
      .filter((t) => t.due_date && t.atlas_status !== "done" && t.atlas_status !== "cancelled")
      .map((t) => parseISO(t.due_date!)),
  [subTasks]);

  // If a date is selected in the calendar, filter to tasks due on that date
  const filteredTasks = useMemo<AnyTask[]>(() => {
    if (!selectedDate) return allTasks;
    return allTasks.filter(
      (t) => t.due_date && isSameDay(parseISO(t.due_date), selectedDate),
    );
  }, [allTasks, selectedDate]);

  // Bucket filtered tasks
  const buckets = useMemo<Record<TaskBucket, AnyTask[]>>(() => {
    const b: Record<TaskBucket, AnyTask[]> = {
      overdue: [], today: [], this_week: [], upcoming: [], no_date: [],
    };
    for (const t of filteredTasks) {
      if (t.atlas_status === "done" || t.atlas_status === "cancelled") continue;
      b[bucketTask(t)].push(t);
    }
    return b;
  }, [filteredTasks]);

  const totalActive = Object.values(buckets).flat().length;

  async function handleComplete(taskId: string) {
    setCompleting(taskId);
    const result = await completePersonalTask(taskId);
    if (!result.success) {
      toast.error("Failed to complete task.");
    } else {
      setLocalPersonal((prev) => prev.filter((t) => t.id !== taskId));
    }
    setCompleting(null);
  }

  async function handleRefreshAfterAdd() {
    const result = await getMyTasks();
    if (result.success && result.data) {
      setLocalPersonal(result.data);
    }
  }

  const bucketOrder: TaskBucket[] = ["overdue", "today", "this_week", "upcoming", "no_date"];
  const hasAnyTasks = totalActive > 0;

  return (
    <div className="h-full flex min-h-0 gap-0">
      {/* ── Calendar sidebar ────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col gap-4 w-[260px] shrink-0 px-4 py-5 border-r border-[#E5E4DF]">
        <LuxuryCalendar
          selectedDate={selectedDate ?? new Date()}
          taskDates={taskDates}
          atlasTaskDates={atlasTaskDates}
          onSelectDate={(d) => setSelectedDate((prev) => (prev && isSameDay(prev, d) ? null : d))}
        />

        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/30"
          >
            <span className="text-[11px] font-medium text-[#A88B25]">
              {format(selectedDate, "d MMM yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-[#A88B25] hover:text-[#7A6020] transition-colors"
              aria-label="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </aside>

      {/* ── Task list ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selectedDate && (
          <div className="px-6 pt-4 pb-0">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="text-[12px] font-medium text-[#8A8A6E]">
                Showing tasks for{" "}
                <span className="text-[#1A1A1A]">{format(selectedDate, "EEEE, d MMMM")}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-[11px] text-[#B5A99A] hover:text-[#1A1A1A] transition-colors ml-auto"
              >
                Show all
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
          {!hasAnyTasks ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <h3 className="font-serif text-[18px] font-semibold text-[#1A1A1A] mb-2">
                {selectedDate ? "No tasks on this day" : "All clear"}
              </h3>
              <p className="text-[13px] text-[#8A8A6E] max-w-xs">
                {selectedDate
                  ? "Nothing due on this date. Select another day or show all tasks."
                  : "You have no pending tasks. Add something below or pick up work from Atlas Tasks."}
              </p>
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="mt-3 text-[13px] text-[#D4AF37] hover:underline font-medium"
                >
                  Show all tasks
                </button>
              )}
            </div>
          ) : (
            bucketOrder.map((bucket) => (
              <SectionGroup
                key={bucket}
                bucket={bucket}
                tasks={buckets[bucket]}
                onComplete={handleComplete}
                onOpenModal={setActiveModalId}
                completing={completing}
              />
            ))
          )}

          {/* Quick add form */}
          <QuickAddForm onAdded={handleRefreshAfterAdd} />
        </div>
      </div>

      {/* Subtask modal */}
      <AnimatePresence>
        {activeModalId && (
          <SubTaskModal
            key={activeModalId}
            taskId={activeModalId}
            onClose={() => setActiveModalId(null)}
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

