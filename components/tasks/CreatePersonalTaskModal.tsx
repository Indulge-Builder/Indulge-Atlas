"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Sparkles, Calendar } from "lucide-react";
import { addDays, endOfDay, format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { cn } from "@/lib/utils";
import { createPersonalTask } from "@/lib/actions/tasks";
import type { TaskPriority } from "@/lib/types/database";

const PRIORITY_PILLS: Array<{
  value: TaskPriority;
  label: string;
  activeClass: string;
  dotClass: string;
}> = [
  { value: "urgent", label: "Critical", activeClass: "bg-[#C0392B] text-white border-[#C0392B]", dotClass: "bg-[#C0392B]" },
  { value: "high",   label: "High",     activeClass: "bg-[#E8824A] text-white border-[#E8824A]", dotClass: "bg-[#E8824A]" },
  { value: "medium", label: "Medium",   activeClass: "bg-[#D4AF37] text-[#1A1A1A] border-[#D4AF37]", dotClass: "bg-[#D4AF37]" },
  { value: "low",    label: "Low",      activeClass: "bg-[#B5A99A] text-white border-[#B5A99A]", dotClass: "bg-[#B5A99A]" },
];

interface CreatePersonalTaskModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreatePersonalTaskModal({ open, onClose }: CreatePersonalTaskModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [showNotes, setShowNotes] = useState(false);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setDueDate(undefined);
    setPriority("medium");
    setShowNotes(false);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    reset();
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, reset]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createPersonalTask({
        title: trimmed,
        description: description.trim() || undefined,
        due_date: dueDate ? dueDate.toISOString() : undefined,
        priority,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to create task.");
      } else {
        toast.success("My task created.");
        await router.refresh();
        handleClose();
      }
    });
  }

  function setDuePreset(daysFromNow: number) {
    const base = new Date();
    setDueDate(endOfDay(addDays(base, daysFromNow)));
  }

  const trimmedTitle = title.trim();
  const dueLabel =
    dueDate &&
    format(dueDate, "d MMM");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border-[#E5E4DF] p-0 shadow-lg">
        <div className="h-0.5 w-full bg-linear-to-r from-[#D4AF37] via-[#E8C84A] to-[#D4AF37]" />

        <div className="px-5 pt-5">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="font-serif text-xl text-[#1A1A1A]">New My Task</DialogTitle>
            <p className="text-[13px] font-normal leading-snug text-[#8A8A6E]">
              Private to you — appears in My Tasks only. No workspace or team setup required.
            </p>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-5 pt-4">
          {/* Compact preview */}
          <div className="flex items-start gap-3 rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/15">
              <Sparkles className="h-4 w-4 text-[#B8860B]" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate font-medium text-[14px] text-[#1A1A1A]">
                {trimmedTitle || "Task title"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B5A99A]">
                  Personal
                </span>
                {dueLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#6B6B6B] ring-1 ring-[#E5E4DF]">
                    <Calendar className="h-3 w-3" aria-hidden />
                    {dueLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          <IndulgeField label="Title" required htmlFor="pt-title">
            <Input
              ref={titleRef}
              id="pt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to get done?"
              className="h-10"
              autoComplete="off"
            />
          </IndulgeField>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
              Due (optional)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Today", days: 0 },
                { label: "Tomorrow", days: 1 },
                { label: "Next week", days: 7 },
              ].map(({ label, days }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setDuePreset(days)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    "border-[#E0DBCF] bg-white text-[#6B6B6B] hover:border-[#D4AF37]/50 hover:text-[#1A1A1A]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <LuxuryDatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="Or pick a specific date & time…"
              className="h-9 text-[13px] rounded-lg border-[#E0DBCF] bg-white hover:border-[#D4AF37]/60"
            />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E] mb-2">
              Priority
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_PILLS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    "flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[11px] font-medium transition-all duration-150",
                    priority === p.value
                      ? p.activeClass
                      : "border-[#E0DBCF] bg-[#FAFAF8] text-[#6B6B6B] hover:border-[#D0C8BE]",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      priority === p.value ? "bg-current opacity-80" : p.dotClass,
                    )}
                  />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {!showNotes ? (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-[12px] font-medium text-[#A88B25] hover:text-[#7A6020] transition-colors"
            >
              + Add notes
            </button>
          ) : (
            <IndulgeField label="Notes" htmlFor="pt-notes">
              <Textarea
                id="pt-notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Context, links, or reminders…"
                className="min-h-[72px] resize-none text-sm"
                maxLength={2000}
              />
            </IndulgeField>
          )}

          <div className="flex justify-end gap-2 border-t border-[#F0EBE3] pt-4">
            <IndulgeButton type="button" variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </IndulgeButton>
            <IndulgeButton
              type="submit"
              variant="gold"
              size="sm"
              loading={isPending}
              disabled={!trimmedTitle}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              Create task
            </IndulgeButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
