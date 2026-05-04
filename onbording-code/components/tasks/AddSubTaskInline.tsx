"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X, UserPlus, Check } from "lucide-react";
import { motion } from "framer-motion";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createSubTask } from "@/lib/actions/tasks";
import { getInitials, cn } from "@/lib/utils";
import type { MasterTaskMember } from "@/lib/types/database";

interface AddSubTaskInlineProps {
  masterTaskId: string;
  groupId: string;
  members?: MasterTaskMember[];
  onCreated?: (id: string) => void;
}

export function AddSubTaskInline({
  masterTaskId,
  groupId,
  members,
  onCreated,
}: AddSubTaskInlineProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const memberRows = members ?? [];
  const showAssigneePicker = memberRows.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    startTransition(async () => {
      const result = await createSubTask({
        master_task_id: masterTaskId,
        group_id:       groupId,
        title:          title.trim(),
        assigned_to:    selectedAssignee ?? undefined,
      });

      if (result.success && result.data) {
        toast.success("Task created");
        onCreated?.(result.data.id);
        setTitle("");
        setSelectedAssignee(null);
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to create task");
      }
    });
  }

  const selectedMember = selectedAssignee
    ? memberRows.find((m) => m.user_id === selectedAssignee)
    : undefined;
  const selectedName =
    (selectedMember?.profile as { full_name?: string } | null | undefined)?.full_name ?? "";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"
        aria-label="Add a task"
      >
        <Plus className="h-3.5 w-3.5" />
        Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task name…"
        className="h-8 text-sm flex-1 min-w-0"
        maxLength={255}
        aria-label="New task title"
        required
      />
      {showAssigneePicker && (
        <TooltipProvider delayDuration={200}>
          <Popover open={assignPopoverOpen} onOpenChange={setAssignPopoverOpen}>
            <Tooltip>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E5E4DF] bg-white text-zinc-400 transition-colors hover:text-zinc-600 hover:border-zinc-300",
                      selectedAssignee && "ring-2 ring-[#D4AF37] ring-offset-1 ring-offset-[#FAFAF8]",
                    )}
                    aria-label={selectedAssignee ? `Assignee: ${selectedName}` : "Choose assignee"}
                  >
                    {selectedAssignee ? (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-[#D4AF37]/15 text-[9px] font-bold text-[#A88B25]">
                        {getInitials(selectedName || "M")}
                      </span>
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
              </PopoverTrigger>
              <TooltipContent side="top">Assign to someone</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="end"
              className="w-64 p-0 overflow-hidden rounded-xl border border-[#E5E4DF] shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-[120ms]"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="max-h-[240px] overflow-y-auto py-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssignee(null);
                    setAssignPopoverOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#6B6B6B] hover:bg-[#F9F9F6] transition-colors border-b border-[#E5E4DF]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[#D0C8BE] text-[10px] font-medium">
                    —
                  </span>
                  <span className="font-medium">No assignee</span>
                  {!selectedAssignee && (
                    <Check className="ml-auto h-4 w-4 text-[#D4AF37]" aria-hidden />
                  )}
                </button>
                {memberRows.map((m) => {
                  const name = m.profile?.full_name ?? "Member";
                  const titleText = m.profile?.job_title ?? null;
                  const isSel = selectedAssignee === m.user_id;
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => {
                        setSelectedAssignee(m.user_id);
                        setAssignPopoverOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F9F9F6] transition-colors"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[9px] font-bold text-[#A88B25]">
                        {getInitials(name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#1A1A1A] truncate">{name}</p>
                        {titleText && (
                          <p className="text-[10px] text-[#8A8A6E] truncate">{titleText}</p>
                        )}
                      </div>
                      {isSel && <Check className="h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden />}
                    </button>
                  );
                })}
              </motion.div>
            </PopoverContent>
          </Popover>
        </TooltipProvider>
      )}
      <IndulgeButton
        type="submit"
        size="sm"
        variant="gold"
        loading={isPending}
        className="h-8 px-3"
        aria-label="Save task"
      >
        <Plus className="h-3.5 w-3.5" />
      </IndulgeButton>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setTitle("");
          setSelectedAssignee(null);
        }}
        className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:text-zinc-600"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
