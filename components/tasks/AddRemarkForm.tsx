"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSubTaskStatus } from "@/lib/actions/tasks";
import { ATLAS_TASK_STATUS_LABELS, ATLAS_TASK_STATUS_COLORS } from "@/lib/types/database";
import type { AtlasTaskStatus, TaskRemark } from "@/lib/types/database";

const ALL_STATUSES: AtlasTaskStatus[] = [
  "todo", "in_progress", "in_review", "done", "blocked", "error", "cancelled",
];

interface AddRemarkFormProps {
  taskId: string;
  currentStatus: AtlasTaskStatus;
  currentProgress: number;
  onSuccess?: (remark: Partial<TaskRemark>) => void;
}

export function AddRemarkForm({
  taskId,
  currentStatus,
  currentProgress,
  onSuccess,
}: AddRemarkFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newStatus, setNewStatus]   = useState<AtlasTaskStatus>(currentStatus);
  const [remark, setRemark]         = useState("");
  const [progress, setProgress]     = useState(currentProgress);
  const [error, setError]           = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!remark.trim()) {
      setError("Remark is required.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await updateSubTaskStatus({
        task_id:        taskId,
        new_status:     newStatus,
        remark_content: remark.trim(),
        new_progress:   progress,
      });

      if (result.success) {
        toast.success("Update saved");
        onSuccess?.({
          task_id:          taskId,
          content:          remark.trim(),
          state_at_time:    newStatus,
          progress_at_time: progress,
          created_at:       new Date().toISOString(),
        });
        setRemark("");
        // Refresh RSC so the Kanban card status badge reflects the new status
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to save update");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      {/* Status selector */}
      <IndulgeField label="New Status" htmlFor="remark-status">
        <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AtlasTaskStatus)}>
          <SelectTrigger
            id="remark-status"
            className="h-9 text-sm"
            aria-label="Select new status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: ATLAS_TASK_STATUS_COLORS[s] }}
                    aria-hidden
                  />
                  {ATLAS_TASK_STATUS_LABELS[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </IndulgeField>

      {/* Progress slider */}
      <IndulgeField label={`Progress — ${progress}%`} htmlFor="remark-progress">
        <input
          id="remark-progress"
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-zinc-200 cursor-pointer accent-[#D4AF37]"
          aria-label={`Progress: ${progress}%`}
        />
      </IndulgeField>

      {/* Remark textarea */}
      <IndulgeField
        label="Remark"
        htmlFor="remark-content"
        required
        error={error ?? undefined}
      >
        <Textarea
          id="remark-content"
          value={remark}
          onChange={(e) => { setRemark(e.target.value); if (error) setError(null); }}
          placeholder="Describe what was done, what's blocking, or what changed…"
          className="min-h-[80px] resize-none text-sm"
          maxLength={1000}
          required
          aria-required="true"
        />
      </IndulgeField>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-400">{remark.length}/1000</span>
        <IndulgeButton
          type="submit"
          variant="gold"
          size="sm"
          loading={isPending}
          leftIcon={<Send className="h-3.5 w-3.5" />}
        >
          Save Update
        </IndulgeButton>
      </div>
    </form>
  );
}
