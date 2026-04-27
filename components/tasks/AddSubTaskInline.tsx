"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Input } from "@/components/ui/input";
import { createSubTask } from "@/lib/actions/tasks";

interface AddSubTaskInlineProps {
  masterTaskId: string;
  groupId: string;
  onCreated?: (id: string) => void;
}

export function AddSubTaskInline({
  masterTaskId,
  groupId,
  onCreated,
}: AddSubTaskInlineProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    startTransition(async () => {
      const result = await createSubTask({
        master_task_id: masterTaskId,
        group_id:       groupId,
        title:          title.trim(),
      });

      if (result.success && result.data) {
        toast.success("Task created");
        onCreated?.(result.data.id);
        setTitle("");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to create task");
      }
    });
  }

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
        className="h-8 text-sm flex-1"
        maxLength={255}
        aria-label="New task title"
        required
      />
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
        onClick={() => { setOpen(false); setTitle(""); }}
        className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:text-zinc-600"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
