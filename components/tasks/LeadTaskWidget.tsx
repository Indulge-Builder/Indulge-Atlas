"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  CalendarDays,
  Phone,
  MessageCircle,
  Mail,
  FileText,
  Repeat,
} from "lucide-react";
import { format } from "date-fns";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { cn } from "@/lib/utils";
import { createLeadTask, completeLeadTask } from "@/lib/actions/tasks";
import { dispatchTaskAlertAfterCompleteOrDelete } from "@/lib/task-alert-refresh";
import { AGENT_TASK_TYPES } from "@/lib/types/database";
import type { TaskType, TaskWithLead, TaskStatus, UserRole } from "@/lib/types/database";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { formatLocalDateTime } from "@/lib/utils/date-format";
import { useClientOnly } from "@/lib/hooks/useClientOnly";

const FollowUpModal = dynamic(
  () =>
    import("@/components/tasks/FollowUpModal").then((mod) => ({
      default: mod.FollowUpModal,
    })),
  { ssr: false },
);

// ── Task type labels & icons ───────────────────────────────

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call:                 "Follow-up Call",
  general_follow_up:    "Nurture Follow-up",
  email:                "Email",
  whatsapp_message:     "WhatsApp Message",
  file_dispatch:        "Send Document",
  campaign_review:      "Campaign Review",
  strategy_meeting:     "Strategy Meeting",
  budget_approval:      "Budget Approval",
  performance_analysis: "Performance Analysis",
};

const TASK_ICONS: Record<TaskType, React.FC<{ className?: string }>> = {
  call:                 Phone,
  general_follow_up:    Repeat,
  email:                Mail,
  whatsapp_message:     MessageCircle,
  file_dispatch:        FileText,
  campaign_review:      CalendarDays,
  strategy_meeting:     CalendarDays,
  budget_approval:      CalendarDays,
  performance_analysis: CalendarDays,
};

const STATUS_STYLES: Record<TaskStatus, { icon: React.FC<{ className?: string }>; cls: string }> = {
  pending:   { icon: Clock,         cls: "text-amber-500" },
  completed: { icon: CheckCircle2,  cls: "text-emerald-500" },
  overdue:   { icon: AlertCircle,   cls: "text-red-500" },
};

// ── Quick-add schema ───────────────────────────────────────

const taskSchema = z.object({
  task_type: z.enum(AGENT_TASK_TYPES as [TaskType, ...TaskType[]]),
  title:     z.string().min(2, "Title is required"),
  due_date:  z.date(),
  notes:     z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

const DEFAULT_TITLES: Record<TaskType, string> = {
  call:                 "Follow-up call",
  general_follow_up:    "Nurture follow-up",
  email:                "Send email",
  whatsapp_message:     "Send WhatsApp message",
  file_dispatch:        "Send document",
  campaign_review:      "Campaign review",
  strategy_meeting:     "Strategy meeting",
  budget_approval:      "Budget approval",
  performance_analysis: "Performance analysis",
};

// ── Quick-add modal (lead_id is hardcoded, hidden from UI) ─

function QuickAddModal({
  leadId,
  role,
  onSuccess,
}: {
  leadId: string;
  role: UserRole;
  onSuccess: (task: TaskWithLead) => void;
}) {
  const mounted = useClientOnly();
  const [open, setOpen]             = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const availableTypes = role === "agent" ? AGENT_TASK_TYPES : [
    ...AGENT_TASK_TYPES,
    "campaign_review", "strategy_meeting", "budget_approval", "performance_analysis",
  ] as TaskType[];

  const defaultDue = new Date();
  defaultDue.setHours(9, 0, 0, 0);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      task_type: "call",
      title:     DEFAULT_TITLES["call"],
      due_date:  defaultDue,
      notes:     "",
    },
  });

  const watchedType = watch("task_type");
  useEffect(() => {
    if (watchedType) setValue("title", DEFAULT_TITLES[watchedType as TaskType], { shouldDirty: false });
  }, [watchedType, setValue]);

  async function onSubmit(values: TaskFormValues) {
    setSubmitting(true);
    setServerError(null);
    const result = await createLeadTask({
      leadId,
      title:  values.title,
      dueAt:  values.due_date,
      type:   values.task_type as TaskType,
      notes:  values.notes?.trim() || null,
    });
    setSubmitting(false);

    if (!result.success) {
      setServerError(result.error ?? "Failed to create task");
      return;
    }

    toast.success("Task scheduled.");

    // Build an optimistic task so the list updates instantly
    const now = new Date().toISOString();
    const optimisticTask: TaskWithLead = {
      id:                `optimistic-${Date.now()}`,
      lead_id:           leadId,
      assigned_to_users: [],
      created_by:       null,
      title:            values.title,
      task_type:        values.task_type as TaskType,
      status:           "pending",
      due_date:         values.due_date.toISOString(),
      notes:            values.notes?.trim() || null,
      progress_updates: [],
      follow_up_step:   1,
      follow_up_history: [],
      created_at:       now,
      updated_at:       now,
      lead:             null,
      assigned_to_profiles: [],
    };

    reset({
      task_type: "call",
      title:     DEFAULT_TITLES["call"],
      due_date:  new Date(new Date().setHours(9, 0, 0, 0)),
      notes:     "",
    });
    setOpen(false);
    onSuccess(optimisticTask);
  }

  if (!mounted) {
    return (
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-xs font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        Schedule Task
      </button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          const today = new Date();
          today.setHours(9, 0, 0, 0);
          reset({
            task_type: "call",
            title:     DEFAULT_TITLES["call"],
            due_date:  today,
            notes:     "",
          });
        }
        setServerError(null);
        setOpen(v);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-xs font-medium hover:bg-[#2A2A2A] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Schedule Task
        </motion.button>
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "transform, opacity" }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-[#EAEAEA] p-6"
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <DialogTitle
                  className="text-[#1A1A1A] text-base font-semibold"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Schedule a Task
                </DialogTitle>
                <DialogDescription className="text-[#9E9E9E] text-xs mt-0.5">
                  Linked to this lead automatically
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button className="p-1.5 rounded-lg text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-[#F4F4F0] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </DialogClose>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Task type */}
              <div className="space-y-1.5">
                <FieldLabel required>Type</FieldLabel>
                <Controller
                  name="task_type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={selectCx}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#E8E8E0]">
                        {availableTypes.map((t) => (
                          <SelectItem key={t} value={t} className="text-sm">
                            {TASK_TYPE_LABELS[t as TaskType]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.task_type && <FieldError message={errors.task_type.message} />}
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <FieldLabel required>Title</FieldLabel>
                <Input
                  {...register("title")}
                  placeholder="Task title"
                  className={inputCx}
                />
                {errors.title && <FieldError message={errors.title.message} />}
              </div>

              {/* Due date */}
              <div className="space-y-1.5">
                <FieldLabel required>Due Date & Time</FieldLabel>
                <Controller
                  name="due_date"
                  control={control}
                  render={({ field }) => (
                    <LuxuryDatePicker
                      value={field.value}
                      onChange={(date) => field.onChange(date)}
                      placeholder="Pick date & time…"
                      disabled={(d) =>
                        d < new Date(new Date().setHours(0, 0, 0, 0))
                      }
                    />
                  )}
                />
                {errors.due_date && <FieldError message={errors.due_date.message} />}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <FieldLabel>Notes</FieldLabel>
                <textarea
                  {...register("notes")}
                  rows={2}
                  placeholder="Additional context…"
                  className={cn(
                    "w-full px-3 py-2.5 text-sm rounded-xl border border-[#E8E8E0] bg-[#FAFAF8] resize-none",
                    "text-[#1A1A1A] placeholder:text-[#9E9E9E]",
                    "focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40"
                  )}
                />
              </div>

              <AnimatePresence>
                {serverError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-[#C0392B] bg-[#FAEAE8] px-3 py-2 rounded-lg"
                  >
                    {serverError}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="flex gap-3 pt-1">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="flex-1 h-10 rounded-xl border-[#E8E8E0] text-[#4A4A4A] text-sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-10 rounded-xl bg-[#1A1A1A] text-white hover:bg-[#2A2A2A] text-sm font-medium"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Scheduling…
                    </span>
                  ) : (
                    "Schedule Task"
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

// ── Follow-up task types (3-Strike Engine) ──────────────────
const FOLLOW_UP_TASK_TYPES: TaskType[] = ["call", "general_follow_up"];

function isFollowUpTask(task: TaskWithLead): boolean {
  return FOLLOW_UP_TASK_TYPES.includes(task.task_type as TaskType);
}

// ── Task row ────────────────────────────────────────────────

function TaskRow({
  task,
  onComplete,
  role,
}: {
  task: TaskWithLead;
  onComplete?: (id: string) => void;
  role: UserRole;
}) {
  const [completing, setCompleting] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const router = useRouter();

  const TypeIcon = TASK_ICONS[task.task_type as TaskType] ?? CalendarDays;
  const statusStyle = STATUS_STYLES[task.status as TaskStatus] ?? STATUS_STYLES.pending;
  const StatusIcon = statusStyle.icon;
  const isFollowUp = isFollowUpTask(task);

  async function handleComplete(e?: React.MouseEvent) {
    if (isFollowUp && task.status === "pending") {
      e?.stopPropagation();
      setFollowUpOpen(true);
      return;
    }
    setCompleting(true);
    onComplete?.(task.id);
    const result = await completeLeadTask(task.id);
    setCompleting(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not complete task.");
      return;
    }
    toast.success("Task marked as done.");
    dispatchTaskAlertAfterCompleteOrDelete({
      status: task.status,
      due_date: task.due_date,
    });
    router.refresh();
  }

  function handleFollowUpSuccess() {
    router.refresh(); // Refetch to get updated task (completed or rescheduled)
  }

  const rowContent = (
    <div className="flex items-start gap-3 py-3 border-b border-[#F2F2EE] last:border-0 group">
      {/* Type icon */}
      <div className="w-7 h-7 rounded-lg bg-[#F4F4F0] flex items-center justify-center shrink-0 mt-0.5">
        <TypeIcon className="w-3.5 h-3.5 text-[#8A8A6E]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium text-[#1A1A1A] leading-snug",
            task.status === "completed" && "line-through text-[#B5A99A]"
          )}
        >
          {task.title}
        </p>
        {(() => {
          const history = (task as { follow_up_history?: { note?: string }[] }).follow_up_history;
          const latestNote =
            Array.isArray(history) && history.length > 0
              ? history[history.length - 1]?.note
              : null;
          if (latestNote) {
            return (
              <p className="text-xs text-stone-400 line-clamp-1 italic mt-0.5">
                {latestNote}
              </p>
            );
          }
          if (task.notes) {
            return (
              <p className="text-xs text-[#9E9E9E] mt-0.5 truncate">{task.notes}</p>
            );
          }
          return null;
        })()}
        <div className="flex items-center gap-2 mt-0.5">
          <StatusIcon className={cn("w-3 h-3 shrink-0", statusStyle.cls)} />
          <span className="text-xs text-[#B5A99A]">
            {formatLocalDateTime(task.due_date)}
          </span>
        </div>
      </div>

      {/* Complete / Log follow-up button */}
      {task.status === "pending" && (
        <button
          onClick={(e) => handleComplete(e)}
          disabled={completing}
          className={cn(
            "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold",
            isFollowUp
              ? "text-indigo-600 hover:bg-indigo-50 border border-indigo-200"
              : "text-emerald-600 hover:bg-emerald-50 border border-emerald-200"
          )}
        >
          {completing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isFollowUp ? (
            "Log"
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3" />
              Done
            </>
          )}
        </button>
      )}
    </div>
  );

  const canOpenModal = isFollowUp && (task.status === "pending" || role === "manager" || role === "admin" || role === "founder");
  return (
    <>
      {canOpenModal ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFollowUpOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setFollowUpOpen(true)}
          className="cursor-pointer hover:bg-[#FAFAF8]/50 -mx-2 px-2 rounded-lg transition-colors"
        >
          {rowContent}
        </div>
      ) : (
        rowContent
      )}
      {isFollowUp && (
        <FollowUpModal
          open={followUpOpen}
          onClose={() => setFollowUpOpen(false)}
          task={task}
          onSuccess={handleFollowUpSuccess}
          userRole={role}
        />
      )}
    </>
  );
}

// ── Main widget ────────────────────────────────────────────

interface LeadTaskWidgetProps {
  leadId:    string;
  role:      UserRole;
  initialTasks: TaskWithLead[];
}

export function LeadTaskWidget({ leadId, role, initialTasks }: LeadTaskWidgetProps) {
  const [tasks, setTasks] = useState<TaskWithLead[]>(initialTasks);
  const router = useRouter();

  // Sync local state when the server re-renders with confirmed data
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  function onTaskAdded(optimisticTask: TaskWithLead) {
    setTasks((prev) => [optimisticTask, ...prev]); // show instantly
    router.refresh(); // sync in background
  }

  function onTaskCompleted(taskId: string) {
    setTasks((prev) =>
      prev.map((t) => t.id === taskId ? { ...t, status: "completed" as TaskStatus } : t)
    );
  }

  const pending = useMemo(
    () => tasks.filter((t) => t.status === "pending"),
    [tasks],
  );
  const completed = useMemo(
    () => tasks.filter((t) => t.status === "completed"),
    [tasks],
  );

  return (
    <div className="bg-white rounded-xl border border-[#E5E4DF] overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F2EE]">
        <div>
          <p
            className="text-sm font-semibold text-[#1A1A1A]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Scheduled Tasks
          </p>
          <p className="text-[11px] text-[#B5A99A] mt-0.5">
            {pending.length} pending · {completed.length} completed
          </p>
        </div>
        <QuickAddModal leadId={leadId} role={role} onSuccess={onTaskAdded} />
      </div>

      {/* Task list */}
      <div className="px-6">
        {tasks.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-center">
            <div className="w-9 h-9 rounded-xl bg-[#F4F4F0] flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-[#C8C4BC]" />
            </div>
            <p className="text-sm text-[#B5A99A]">No tasks yet</p>
            <p className="text-xs text-[#D0C8BE]">Schedule the first follow-up above</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {/* Pending tasks first */}
            {pending.map((task, i) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <TaskRow task={task} onComplete={onTaskCompleted} role={role} />
              </motion.div>
            ))}

            {/* Completed tasks — collapsed by default */}
            {completed.length > 0 && (
              <details className="group/done pb-3">
                <summary className="cursor-pointer text-[11px] font-semibold text-[#B5A99A] uppercase tracking-wider py-3 list-none hover:text-[#8A8A6E] transition-colors select-none">
                  {completed.length} completed task{completed.length !== 1 ? "s" : ""}
                </summary>
                <div className="opacity-60">
                  {completed.map((task) => (
                    <TaskRow key={task.id} task={task} role={role} />
                  ))}
                </div>
              </details>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ── Micro helpers ──────────────────────────────────────────

const inputCx = cn(
  "h-10 text-sm bg-[#FAFAF8] border-[#E8E8E0]",
  "focus-visible:ring-1 focus-visible:ring-[#D4AF37]/40 rounded-xl"
);

const selectCx = cn(
  "h-10 text-sm bg-[#FAFAF8] border-[#E8E8E0]",
  "focus:ring-1 focus:ring-[#D4AF37]/40 rounded-xl"
);

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-widest">
      {children}
      {required && <span className="text-[#C0392B] ml-0.5">*</span>}
    </Label>
  );
}

function FieldError({ message }: { message?: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-[11px] text-[#C0392B] mt-1"
    >
      {message}
    </motion.p>
  );
}
