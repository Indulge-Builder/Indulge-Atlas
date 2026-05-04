"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  Sparkles,
  AtSign,
} from "lucide-react";
import { format, isToday as dateFnsIsToday, isThisWeek, isFuture, isSameDay, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { LuxuryCalendar } from "./LuxuryCalendar";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubTaskStatusBadge } from "./SubTaskStatusBadge";
import { TaskPriorityBadge } from "./TaskPriorityBadge";
import { SubTaskModal } from "./SubTaskModal";
import { DailySOPSection } from "./my-tasks/DailySOPSection";
import { PrivacyBadge } from "./shared/PrivacyBadge";
import { PersonalTaskTagControls } from "./PersonalTaskTagControls";
import { visiblePersonalTaskTagsForList } from "@/lib/constants/personalTaskTags";
import {
  completePersonalTask,
  createPersonalTask,
  getDailyPersonalTasks,
  getMyTasks,
  reopenPersonalTask,
  searchProfilesForTasks,
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

type TaskBucket = "overdue" | "today" | "this_week" | "upcoming" | "no_date" | "completed";

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
  overdue:    "Overdue",
  today:      "Due Today",
  this_week:  "Due This Week",
  upcoming:   "Upcoming",
  no_date:    "No Due Date",
  completed:  "Completed",
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
  currentUserId: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onOpenModal: (id: string) => void;
  isCompleting: boolean;
}

function TaskRow({
  task,
  currentUserId,
  onComplete,
  onReopen,
  onOpenModal,
  isCompleting,
}: TaskRowProps) {
  const masterTitle = (task as SubTask & { masterTaskTitle?: string | null }).masterTaskTitle ?? null;
  const isSubtask = (task as SubTask).unified_task_type === "subtask";
  const isPersonal = (task as PersonalTask).unified_task_type === "personal";
  const listTags =
    isPersonal ? visiblePersonalTaskTagsForList((task as PersonalTask).tags) : [];
  const assignees = isPersonal ? ((task as PersonalTask).assigned_to_users ?? []) : [];
  const canMarkComplete = !isPersonal || assignees.includes(currentUserId);
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority as TaskPriority] ?? TASK_PRIORITY_CONFIG.medium;
  const isDone = task.atlas_status === "done" || task.atlas_status === "cancelled";
  const canReopenPersonalDone =
    isPersonal && canMarkComplete && task.atlas_status === "done";

  function handleCompleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDone || !canMarkComplete) return;
    void onComplete(task.id);
  }

  function handleReopenClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canReopenPersonalDone) return;
    void onReopen(task.id);
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors border-b border-[#E5E4DF] last:border-b-0",
        isDone ? "bg-[#FAFAF8]/90 cursor-default" : "hover:bg-[#FAFAF8] cursor-pointer",
      )}
      onClick={() => {
        if (isDone) return;
        if (isSubtask || isPersonal) onOpenModal(task.id);
      }}
      role={!isDone && (isSubtask || isPersonal) ? "button" : undefined}
      tabIndex={!isDone && (isSubtask || isPersonal) ? 0 : undefined}
    >
      {/* Completion — personal assignee only; subtasks use the modal / board */}
      {canReopenPersonalDone ? (
        <button
          type="button"
          onClick={handleReopenClick}
          disabled={isCompleting}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-opacity",
            "text-[#D4AF37]/80 hover:text-[#D4AF37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/40",
            isCompleting && "opacity-60",
          )}
          aria-label="Mark task as not complete"
        >
          {isCompleting ? (
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#D4AF37]" />
          ) : (
            <CheckCircle2 className="h-5 w-5 -m-0.5" />
          )}
        </button>
      ) : isDone ? (
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          aria-hidden
        >
          <CheckCircle2 className="h-5 w-5 text-[#D4AF37]/80 -m-0.5" />
        </div>
      ) : isPersonal && canMarkComplete ? (
        <button
          type="button"
          onClick={handleCompleteClick}
          disabled={isCompleting}
          className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200",
            "border-[#D0C8BE] hover:border-[#D4AF37]",
          )}
          aria-label="Complete task"
        >
          {isCompleting ? (
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#D4AF37]" />
          ) : null}
        </button>
      ) : isPersonal ? (
        <div
          className="w-5 h-5 shrink-0 rounded-full border border-dashed border-[#E5E4DF]"
          title="Assigned to a teammate — they complete this from their list."
          aria-hidden
        />
      ) : (
        <div className="h-5 w-5 shrink-0" aria-hidden />
      )}

      {/* Title + breadcrumb */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[13px] font-medium truncate transition-all",
            isDone ? "text-[#B5A99A] line-through" : "text-[#1A1A1A]",
          )}
        >
          {task.title}
        </p>
        {masterTitle && (
          <p className="text-[11px] text-[#B5A99A] truncate mt-0.5">{masterTitle}</p>
        )}
        {listTags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {listTags.map((tag) => (
              <span
                key={tag}
                className="max-w-[140px] truncate rounded-full bg-[#FBF6E8] px-2 py-0.5 text-[10px] font-medium text-[#1A1A1A] ring-1 ring-[#D4AF37]/30"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Priority dot — muted when done */}
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          isDone ? "opacity-30" : priorityCfg.dotClass,
        )}
        title={priorityCfg.label}
      />

      {/* Due date */}
      {task.due_date && (
        <DateChip isoDate={task.due_date} status={task.atlas_status} />
      )}

      {isPersonal && !isDone && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
          <PrivacyBadge />
        </div>
      )}

      {/* Overflow menu — Edit opens the same modals as row click (subtask / personal) */}
      {!isDone && (isSubtask || isPersonal) && (
        <div
          className="opacity-0 group-hover:opacity-100 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 rounded hover:bg-[#F2F2EE] text-[#B5A99A] hover:text-[#6B6B6B] transition-all"
                aria-label="Task actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => {
                  if (isSubtask || isPersonal) onOpenModal(task.id);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// ── Section group ─────────────────────────────────────────────────────────────

interface SectionGroupProps {
  bucket: TaskBucket;
  tasks: AnyTask[];
  currentUserId: string;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onOpenModal: (id: string) => void;
  completing: string | null;
}

function SectionGroup({
  bucket,
  tasks,
  currentUserId,
  onComplete,
  onReopen,
  onOpenModal,
  completing,
}: SectionGroupProps) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {bucket === "overdue" && <AlertCircle className="w-3.5 h-3.5 text-[#C0392B]" />}
        {bucket === "completed" && <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden />}
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
            currentUserId={currentUserId}
            onComplete={onComplete}
            onReopen={onReopen}
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
  currentUserId: string;
}

function QuickAddForm({ onAdded, currentUserId }: QuickAddFormProps) {
  const [open, setOpen]           = useState(false);
  const [title, setTitle]         = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate]     = useState<Date | undefined>(undefined);
  const [priority, setPriority]   = useState<TaskPriority>("medium");
  const [peer, setPeer]           = useState<{ id: string; full_name: string } | null>(null);
  const [peerOpen, setPeerOpen]   = useState(false);
  const [peerQuery, setPeerQuery] = useState("");
  const [peerHits, setPeerHits]   = useState<{ id: string; full_name: string }[]>([]);
  const [tagsOpen, setTagsOpen]   = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!peerOpen) return;
    const q = peerQuery.trim();
    if (q.length < 2) {
      setPeerHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const rows = await searchProfilesForTasks(q);
        setPeerHits(rows.map((r) => ({ id: r.id, full_name: r.full_name })));
      })();
    }, 220);
    return () => clearTimeout(t);
  }, [peerOpen, peerQuery]);

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
    setPeer(null);
    setPeerQuery("");
    setPeerHits([]);
    setPeerOpen(false);
    setTagsOpen(false);
    setSelectedTags([]);
    setCustomTag("");
  }

  function toggleTag(label: string) {
    setSelectedTags((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
    );
  }

  function addCustomTag() {
    const t = customTag.trim();
    if (!t || selectedTags.includes(t) || selectedTags.length >= 20) return;
    setSelectedTags((p) => [...p, t]);
    setCustomTag("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;
    const assignee =
      peer && peer.id !== currentUserId ? peer.id : undefined;
    setIsSubmitting(true);
    void (async () => {
      try {
        const result = await createPersonalTask({
          title:       trimmed,
          description: description.trim() || undefined,
          due_date:    dueDate ? dueDate.toISOString() : undefined,
          priority,
          assigned_to: assignee,
          tags:        selectedTags.length ? selectedTags : undefined,
        });
        if (!result.success) {
          toast.error(result.error ?? "Failed to create task.");
        } else {
          toast.success(assignee ? "Request sent to teammate." : "Task added.");
          handleClose();
          onAdded();
        }
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  return (
    <div className="pb-5 border-b border-[#E5E4DF]">
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
              <div className="h-0.5 w-full bg-gradient-to-r from-[#D4AF37] via-[#E8C84A] to-[#D4AF37]" />

              <div className="p-4 space-y-4">
                <div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full border-none bg-transparent text-[15px] font-medium text-[#1A1A1A] outline-none placeholder:text-[#8A8A6E]"
                  />
                </div>

                <div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add notes or context…"
                    rows={2}
                    className="w-full resize-none border-none bg-transparent text-[13px] leading-relaxed text-[#1A1A1A] outline-none placeholder:text-[#8A8A6E]"
                  />
                </div>

                <div className="h-px bg-[#F0EBE3]" />

                <div className="flex flex-wrap items-center gap-2">
                  <Popover open={peerOpen} onOpenChange={setPeerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          peer
                            ? "border-[#D4AF37]/50 bg-[#FDF9EE] text-[#1A1A1A]"
                            : "border-[#E0DBCF] bg-[#FAFAF8] text-[#6B6B6B] hover:border-[#D4AF37]/50",
                        )}
                      >
                        <AtSign className="h-3 w-3 shrink-0 text-[#A88B25]" aria-hidden />
                        {peer ? peer.full_name : "Assign: me"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="start">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E] mb-2">
                        Peer (optional)
                      </p>
                  <input
                    value={peerQuery}
                    onChange={(e) => setPeerQuery(e.target.value)}
                    placeholder="Search by name…"
                    className="mb-2 h-8 w-full rounded-lg border border-[#E5E4DF] bg-white px-2 text-[12px] text-[#1A1A1A] placeholder:text-[#8A8A6E] outline-none focus:border-[#D4AF37]"
                  />
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        <button
                          type="button"
                          className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[#1A1A1A] hover:bg-[#F9F9F6]"
                          onClick={() => {
                            setPeer(null);
                            setPeerOpen(false);
                          }}
                        >
                          Me (default)
                        </button>
                        {peerHits.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[#1A1A1A] hover:bg-[#F9F9F6]"
                            onClick={() => {
                              setPeer(p);
                              setPeerOpen(false);
                            }}
                          >
                            {p.full_name}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <PersonalTaskTagControls
                    selectedTags={selectedTags}
                    onToggleTag={toggleTag}
                    customTag={customTag}
                    onCustomTagChange={setCustomTag}
                    onAddCustomTag={addCustomTag}
                    tagsOpen={tagsOpen}
                    onTagsOpenChange={setTagsOpen}
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
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
                    loading={isSubmitting}
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
  dailySopTasks: PersonalTask[];
  subTasks: Array<SubTask & { masterTaskTitle: string | null }>;
  currentUser: {
    id: string;
    full_name: string;
    job_title: string | null;
    role: string;
  };
  onRefresh: () => void;
}

export function MyTasksDashboard({
  personalTasks,
  dailySopTasks,
  subTasks,
  currentUser,
  onRefresh,
}: MyTasksDashboardProps) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [activeModalId, setActiveModalId] = useState<string | null>(null);
  const [localPersonal, setLocalPersonal] = useState<PersonalTask[]>(personalTasks);
  const [localDailySop, setLocalDailySop] = useState<PersonalTask[]>(dailySopTasks);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  /** Keep list in sync when the server passes fresh data (e.g. after creating a task + router.refresh). */
  useEffect(() => {
    setLocalPersonal(personalTasks);
  }, [personalTasks]);

  useEffect(() => {
    setLocalDailySop(dailySopTasks);
  }, [dailySopTasks]);

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

  // If a date is selected in the calendar, filter to tasks due on that date (or completed that day)
  const filteredTasks = useMemo<AnyTask[]>(() => {
    if (!selectedDate) return allTasks;
    return allTasks.filter((t) => {
      if (t.atlas_status === "cancelled") return false;
      if (t.due_date && isSameDay(parseISO(t.due_date), selectedDate)) return true;
      if (t.atlas_status === "done" && t.updated_at) {
        return isSameDay(parseISO(t.updated_at), selectedDate);
      }
      return false;
    });
  }, [allTasks, selectedDate]);

  // Bucket filtered tasks (done/cancelled → Completed; cancelled excluded from list above if we add filter)
  const buckets = useMemo<Record<TaskBucket, AnyTask[]>>(() => {
    const b: Record<TaskBucket, AnyTask[]> = {
      overdue: [], today: [], this_week: [], upcoming: [], no_date: [], completed: [],
    };
    for (const t of filteredTasks) {
      if (t.atlas_status === "cancelled") continue;
      if (t.atlas_status === "done") {
        b.completed.push(t);
        continue;
      }
      b[bucketTask(t)].push(t);
    }
    b.completed.sort((a, b) => {
      const ta = (a.updated_at as string | undefined) ?? "";
      const tb = (b.updated_at as string | undefined) ?? "";
      return tb.localeCompare(ta);
    });
    return b;
  }, [filteredTasks]);

  const pendingInFilter = useMemo(
    () => filteredTasks.filter((t) => t.atlas_status !== "done" && t.atlas_status !== "cancelled"),
    [filteredTasks],
  );
  const hasAnyTasks = filteredTasks.some((t) => t.atlas_status !== "cancelled");
  const hasPendingTasks = pendingInFilter.length > 0;

  async function handleComplete(taskId: string) {
    const isPersonalRow = localPersonal.some((t) => t.id === taskId);
    if (!isPersonalRow) return;

    setCompleting(taskId);
    const result = await completePersonalTask(taskId);
    if (!result.success) {
      toast.error("Failed to complete task.");
    } else {
      const now = new Date().toISOString();
      setLocalPersonal((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, atlas_status: "done" as const, progress: 100, updated_at: now }
            : t,
        ),
      );
    }
    setCompleting(null);
  }

  async function handleReopen(taskId: string) {
    if (!localPersonal.some((t) => t.id === taskId)) return;

    setCompleting(taskId);
    const result = await reopenPersonalTask(taskId);
    if (!result.success) {
      toast.error(result.error ?? "Failed to restore task.");
    } else {
      const now = new Date().toISOString();
      setLocalPersonal((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, atlas_status: "todo" as const, progress: 0, updated_at: now }
            : t,
        ),
      );
    }
    setCompleting(null);
  }

  async function handleRefreshAfterAdd() {
    const [result, dailyRes] = await Promise.all([getMyTasks(), getDailyPersonalTasks()]);
    if (result.success && result.data) {
      setLocalPersonal(result.data.personalTasks);
    }
    if (dailyRes.success && dailyRes.data) {
      setLocalDailySop(dailyRes.data.items);
    }
  }

  const bucketOrder: TaskBucket[] = ["overdue", "today", "this_week", "upcoming", "no_date", "completed"];
  const showTodayClearBanner =
    !selectedDate && hasPendingTasks && buckets.today.length === 0;

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
          <DailySOPSection initialTasks={localDailySop} onParentRefresh={onRefresh} />

          <QuickAddForm onAdded={() => void handleRefreshAfterAdd()} currentUserId={currentUser.id} />

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
                  ? "Nothing on this date. Select another day or show all tasks."
                  : "You have no tasks here yet. Use the quick add above, or pick up work from Group Tasks."}
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
            <>
              {showTodayClearBanner && (
                <div className="rounded-xl border border-[#E5E4DF] bg-white px-5 py-6 text-center shadow-[0_1px_2px_rgba(26,24,20,0.04)]">
                  <Sparkles
                    className="mx-auto mb-3 h-7 w-7 text-[#D4AF37]"
                    aria-hidden
                  />
                  <p className="font-serif text-[17px] font-semibold leading-snug text-[#1A1A1A]">
                    No tasks for today — hurray!
                  </p>
                  <p className="mt-2 text-[13px] text-[#8A8A6E]">
                    Other due dates are listed below.
                  </p>
                </div>
              )}
              {bucketOrder
                .filter((bucket) => !(showTodayClearBanner && bucket === "today"))
                .map((bucket) => (
                  <SectionGroup
                    key={bucket}
                    bucket={bucket}
                    tasks={buckets[bucket]}
                    currentUserId={currentUser.id}
                    onComplete={handleComplete}
                    onReopen={handleReopen}
                    onOpenModal={setActiveModalId}
                    completing={completing}
                  />
                ))}
            </>
          )}
        </div>
      </div>

      {/* Subtask modal */}
      <AnimatePresence>
        {activeModalId && (
          <SubTaskModal
            key={activeModalId}
            taskId={activeModalId}
            onClose={() => setActiveModalId(null)}
            currentUser={{
              id: currentUser.id,
              full_name: currentUser.full_name,
              job_title: currentUser.job_title,
              role: currentUser.role,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
