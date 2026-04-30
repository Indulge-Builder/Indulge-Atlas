"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { deleteSubTask, updateSubTask } from "@/lib/actions/tasks";
import { atlasStatusSchema } from "@/lib/schemas/tasks";
import type { AtlasTaskStatus, PersonalTask } from "@/lib/types/database";
import {
  ATLAS_TASK_STATUS_COLORS,
  ATLAS_TASK_STATUS_LABELS,
  ATLAS_TASK_STATUS_VALUES,
  isPrivilegedRole,
} from "@/lib/types/database";

const personalEditSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  atlas_status: atlasStatusSchema,
  due_date: z.date().nullable(),
});

type PersonalEditValues = z.infer<typeof personalEditSchema>;

interface PersonalTaskModalProps {
  task: PersonalTask | null;
  onClose: () => void;
  onUpdated?: () => void;
  userRole: string;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8A8A6E] mb-2">
      {children}
    </p>
  );
}

export function PersonalTaskModal({
  task,
  onClose,
  onUpdated,
  userRole,
}: PersonalTaskModalProps) {
  const router = useRouter();
  const open = task !== null;

  const form = useForm<PersonalEditValues>({
    resolver: zodResolver(personalEditSchema),
    defaultValues: {
      title: "",
      description: "",
      atlas_status: "todo",
      due_date: null,
    },
  });

  useEffect(() => {
    if (!task) return;
    form.reset({
      title: task.title,
      description: task.notes ?? "",
      atlas_status: task.atlas_status,
      due_date: task.due_date ? new Date(task.due_date) : null,
    });
  }, [task, form]);

  async function onSubmit(values: PersonalEditValues) {
    if (!task) return;
    const result = await updateSubTask(task.id, {
      title: values.title,
      description: values.description || null,
      atlas_status: values.atlas_status,
      due_date: values.due_date ? values.due_date.toISOString() : null,
    });
    if (!result.success) {
      toast.error(result.error ?? "Could not save");
      return;
    }
    toast.success("Task updated");
    onUpdated?.();
    router.refresh();
    onClose();
  }

  async function handleDelete() {
    if (!task) return;
    const result = await deleteSubTask(task.id);
    if (!result.success) {
      toast.error(result.error ?? "Could not delete");
      return;
    }
    toast.success("Task deleted");
    onUpdated?.();
    router.refresh();
    onClose();
  }

  const showDelete = isPrivilegedRole(userRole);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "[&>button]:hidden max-h-[min(92vh,840px)] gap-0 overflow-y-auto border-[#E5E4DF] bg-white p-0 shadow-lg",
          "max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[95vh] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-2xl max-md:rounded-b-none",
        )}
      >
        {task && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3 border-b border-[#E5E4DF] px-5 py-3">
              <DialogTitle className="min-w-0 flex-1 truncate pr-1 font-serif text-lg font-semibold leading-snug tracking-tight text-[#1A1A1A]">
                Personal task
              </DialogTitle>
              <div className="flex shrink-0 items-center justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#B5A99A] transition-colors hover:bg-[#F2F2EE] hover:text-[#1A1A1A]"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5 px-5 pb-5 pt-5"
            >
              <IndulgeField
                label="Title"
                required
                htmlFor="pt-edit-title"
                error={form.formState.errors.title?.message}
              >
                <Input
                  id="pt-edit-title"
                  {...form.register("title")}
                  placeholder="What needs to be done?"
                  className="h-10"
                  error={!!form.formState.errors.title}
                />
              </IndulgeField>

              <div>
                <SectionLabel>Status</SectionLabel>
                <Controller
                  control={form.control}
                  name="atlas_status"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-1.5">
                      {ATLAS_TASK_STATUS_VALUES.map((st) => {
                        const active = field.value === st;
                        const accent = ATLAS_TASK_STATUS_COLORS[st];
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => field.onChange(st)}
                            className={cn(
                              "rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-all",
                              active
                                ? "bg-white shadow-sm"
                                : "border-[#E5E4DF] bg-[#FAFAF8] text-[#6B6B6B] hover:border-[#D0C8BE]",
                            )}
                            style={
                              active
                                ? {
                                    borderColor: accent,
                                    color: "#1A1A1A",
                                    boxShadow: `inset 0 0 0 1px ${accent}`,
                                  }
                                : undefined
                            }
                          >
                            {ATLAS_TASK_STATUS_LABELS[st]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>

              <IndulgeField label="Due date" htmlFor="pt-due" error={form.formState.errors.due_date?.message}>
                <Controller
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <LuxuryDatePicker
                      value={field.value ?? undefined}
                      onChange={(d) => field.onChange(d ?? null)}
                      placeholder="Pick date & time (optional)"
                      className="h-10 rounded-lg border-[#E0DBCF] bg-[#FAFAF8] text-[#1A1A1A] hover:border-[#D4AF37]/60"
                    />
                  )}
                />
              </IndulgeField>

              <IndulgeField label="Notes" htmlFor="pt-notes" error={form.formState.errors.description?.message}>
                <Textarea
                  id="pt-notes"
                  {...form.register("description")}
                  rows={4}
                  placeholder="Context, links, or reminders…"
                  className="min-h-[96px] resize-none text-sm"
                  maxLength={2000}
                />
              </IndulgeField>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E4DF] pt-5">
                {showDelete ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="text-[13px] font-medium text-[#C0392B]/90 transition-colors hover:text-[#C0392B]"
                  >
                    Delete task
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <IndulgeButton type="button" variant="outline" size="sm" onClick={onClose}>
                    Cancel
                  </IndulgeButton>
                  <IndulgeButton
                    type="submit"
                    variant="gold"
                    size="sm"
                    loading={form.formState.isSubmitting}
                  >
                    Save changes
                  </IndulgeButton>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
