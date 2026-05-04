"use client";

import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { createTask } from "@/lib/actions/tasks";
import type { UserRole, TaskType } from "@/lib/types/database";
import { AGENT_TASK_TYPES, ALL_TASK_TYPES } from "@/lib/types/database";

// ── Types ──────────────────────────────────────────────────

type LeadOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  status: string;
};

// ── Task type labels ───────────────────────────────────────

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call: "Follow-up Call",
  general_follow_up: "Nurture Follow-up",
  email: "Email",
  whatsapp_message: "WhatsApp Message",
  file_dispatch: "Send Document",
  campaign_review: "Campaign Review",
  strategy_meeting: "Strategy Meeting",
  budget_approval: "Budget Approval",
  performance_analysis: "Performance Analysis",
};

const TASK_DEFAULT_TITLES: Record<TaskType, string> = {
  call: "Follow-up call",
  general_follow_up: "Nurture follow-up",
  email: "Send email",
  whatsapp_message: "Send WhatsApp message",
  file_dispatch: "Send document",
  campaign_review: "Campaign performance review",
  strategy_meeting: "Strategy meeting",
  budget_approval: "Budget approval",
  performance_analysis: "Performance analysis",
};

// ── Zod schema (role-aware factory) ───────────────────────

function buildSchema(_role: UserRole) {
  return z.object({
    lead_id: z.string().optional().nullable(),
    type: z.enum(ALL_TASK_TYPES as [TaskType, ...TaskType[]]),
    title: z.string().min(2, "Title is required"),
    due_date: z.string().min(1, "Due date & time is required"),
    notes: z.string().optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

// ── Sub-components ─────────────────────────────────────────

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-widest">
      {children}
      {required && <span className="text-[#C0392B] ml-0.5">*</span>}
    </Label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
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

// ── Main component ─────────────────────────────────────────

interface AddTaskModalProps {
  role: UserRole;
  leads: LeadOption[];
  defaultDate?: Date;
  onSuccess?: () => void;
}

export function AddTaskModal({
  role,
  leads,
  defaultDate,
  onSuccess,
}: AddTaskModalProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = buildSchema(role);
  const availableTypes = role === "agent" ? AGENT_TASK_TYPES : ALL_TASK_TYPES;

  const defaultDueAt = defaultDate
    ? format(defaultDate, "yyyy-MM-dd'T'09:00")
    : format(new Date(), "yyyy-MM-dd'T'09:00");

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: availableTypes[0] as TaskType,
      title: TASK_DEFAULT_TITLES[availableTypes[0] as TaskType],
      due_date: defaultDueAt,
      lead_id: undefined,
      notes: "",
    },
  });

  // Auto-fill title when task type changes
  const watchedType = watch("type");
  useEffect(() => {
    if (watchedType) {
      setValue("title", TASK_DEFAULT_TITLES[watchedType as TaskType], {
        shouldDirty: false,
      });
    }
  }, [watchedType, setValue]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await createTask({
        leadId: values.lead_id ?? null,
        title: values.title,
        dueAt: new Date(values.due_date),
        type: values.type as TaskType,
        notes: values.notes?.trim() || null,
      });
      if (!result.success) {
        setServerError(result.error ?? "Failed to create task");
      } else {
        reset();
        setOpen(false);
        onSuccess?.();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    setServerError(null);
    setOpen(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#2A2A2A] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </motion.button>
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-[#EAEAEA] p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <DialogTitle
                  className="text-[#1A1A1A] text-lg font-semibold"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  New Task
                </DialogTitle>
                <DialogDescription className="text-[#9E9E9E] text-xs mt-0.5">
                  {(role === "manager" || role === "admin" || role === "founder")
                    ? "Create a strategic or lead-linked task"
                    : "Schedule a follow-up action for a lead"}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  className="p-1.5 rounded-lg text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-[#F4F4F0] transition-colors"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </DialogClose>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Task Type */}
              <div className="space-y-1.5">
                <FieldLabel required>Task Type</FieldLabel>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-10 text-sm bg-[#FAFAF8] border-[#E8E8E0] focus:ring-1 focus:ring-[#D4AF37]/40 rounded-xl">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#E8E8E0]">
                        {/* Agent task types */}
                        {AGENT_TASK_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-sm">
                            {TASK_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                        {/* Manager task types — only shown for manager/admin */}
                        {role !== "agent" && (
                          <>
                            <div className="mx-2 my-1.5 h-px bg-[#F0F0EC]" />
                            <p className="px-2 py-1 text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest">
                              Strategic
                            </p>
                            {[
                              "campaign_review",
                              "strategy_meeting",
                              "budget_approval",
                              "performance_analysis",
                            ].map((t) => (
                              <SelectItem key={t} value={t} className="text-sm">
                                {TASK_TYPE_LABELS[t as TaskType]}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.type?.message} />
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <FieldLabel required>Title</FieldLabel>
                <Input
                  {...register("title")}
                  placeholder="Task title"
                  className="h-10 text-sm bg-[#FAFAF8] border-[#E8E8E0] focus-visible:ring-1 focus-visible:ring-[#D4AF37]/40 rounded-xl"
                />
                <FieldError message={errors.title?.message} />
              </div>

              {/* Description / Notes */}
              <div className="space-y-1.5">
                <FieldLabel>Description</FieldLabel>
                <textarea
                  {...register("notes")}
                  placeholder="Add context, notes, or reminders…"
                  rows={3}
                  className={cn(
                    "w-full px-3 py-2.5 text-sm rounded-xl border border-[#E8E8E0] bg-[#FAFAF8] resize-none",
                    "text-[#1A1A1A] placeholder:text-[#9E9E9E]",
                    "focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40",
                  )}
                />
              </div>

              {/* Lead Link */}
              <div className="space-y-1.5">
                <FieldLabel>Linked Lead</FieldLabel>
                <Controller
                  name="lead_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) =>
                        field.onChange(v === "__none__" ? undefined : v)
                      }
                    >
                      <SelectTrigger className="h-10 text-sm bg-[#FAFAF8] border-[#E8E8E0] focus:ring-1 focus:ring-[#D4AF37]/40 rounded-xl">
                        <SelectValue placeholder="Select a lead…" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#E8E8E0] max-h-52">
                        <SelectItem
                          value="__none__"
                          className="text-sm text-[#9E9E9E]"
                        >
                          None (General Task)
                        </SelectItem>
                        {leads.map((l) => (
                          <SelectItem
                            key={l.id}
                            value={l.id}
                            className="text-sm"
                          >
                            <span className="font-medium">
                              {l.first_name} {l.last_name ?? ""}
                            </span>
                            <span className="text-[#9E9E9E] ml-1.5">
                              {l.phone_number}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.lead_id?.message} />
              </div>

              {/* Due date & time */}
              <div className="space-y-1.5">
                <FieldLabel required>Due Date & Time</FieldLabel>
                <Controller
                  name="due_date"
                  control={control}
                  render={({ field }) => (
                    <LuxuryDatePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) =>
                        field.onChange(date ? date.toISOString() : "")
                      }
                      placeholder="Pick date & time…"
                      disabled={(d) =>
                        d < new Date(new Date().setHours(0, 0, 0, 0))
                      }
                    />
                  )}
                />
                <FieldError message={errors.due_date?.message} />
              </div>

              {/* Server error */}
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

              {/* Footer */}
              <div className="flex gap-3 pt-2">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10 rounded-xl border-[#E8E8E0] text-[#4A4A4A] hover:bg-[#F4F4F0] text-sm"
                  >
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
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </span>
                  ) : (
                    "Create Task"
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
