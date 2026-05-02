"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateTaskProgress } from "@/lib/actions/projects";
import { ATLAS_SUBTASK_UPDATE_MAX_CHARS } from "@/lib/schemas/tasks";
import { toast } from "sonner";

interface UpdateProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  currentProgress: number;
  onSuccess?: (newProgress: number) => void;
}

const SNAP_POINTS = [0, 25, 50, 75, 100];

function CircleProgress({ value }: { value: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (value / 100) * circumference;
  const color =
    value === 100
      ? "#10B981"
      : value >= 75
        ? "#6EE7B7"
        : value >= 50
          ? "#F59E0B"
          : "#D4AF37";

  return (
    <svg width={80} height={80} viewBox="0 0 80 80" className="-rotate-90">
      <circle
        cx={40}
        cy={40}
        r={radius}
        fill="none"
        stroke="#F0F0ED"
        strokeWidth={8}
      />
      <circle
        cx={40}
        cy={40}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeDasharray={`${strokeDash} ${circumference}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.3s ease" }}
      />
      <text
        x={40}
        y={44}
        textAnchor="middle"
        className="rotate-90"
        style={{
          transform: "rotate(90deg)",
          transformOrigin: "40px 40px",
          fontSize: "14px",
          fontWeight: 700,
          fill: "#1A1A1A",
        }}
      >
        {value}%
      </text>
    </svg>
  );
}

export function UpdateProgressModal({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  currentProgress,
  onSuccess,
}: UpdateProgressModalProps) {
  const [progress, setProgress] = useState(currentProgress);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const snap = (v: number) => {
    const closest = SNAP_POINTS.reduce((a, b) =>
      Math.abs(b - v) < Math.abs(a - v) ? b : a,
    );
    const dist = Math.abs(closest - v);
    return dist <= 8 ? closest : v;
  };

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = Number(e.target.value);
    setProgress(snap(raw));
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await updateTaskProgress(taskId, progress, note || undefined);
      if (result.success) {
        toast.success(
          progress === 100 ? "Task marked complete!" : `Progress updated to ${progress}%`,
        );
        onSuccess?.(progress);
        onOpenChange(false);
        setNote("");
      } else {
        toast.error(result.error ?? "Failed to update progress");
      }
    });
  }

  const isComplete = progress === 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Progress</DialogTitle>
          <p className="text-sm text-[#6B6B6B] mt-1 line-clamp-2">{taskTitle}</p>
        </DialogHeader>

        {/* Progress ring */}
        <div className="flex flex-col items-center gap-4 py-4">
          <CircleProgress value={progress} />

          {/* Slider */}
          <div className="w-full px-1">
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={handleSliderChange}
              className="w-full accent-[#D4AF37] cursor-pointer"
              aria-label="Progress percentage"
            />
            {/* Snap point markers */}
            <div className="flex justify-between mt-1 px-0.5">
              {SNAP_POINTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProgress(p)}
                  className={cn(
                    "text-[10px] font-medium px-1 py-0.5 rounded transition-colors",
                    progress === p
                      ? "text-[#D4AF37] font-bold"
                      : "text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {isComplete && (
            <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 text-center w-full">
              This will mark the task as <strong>complete</strong>.
            </p>
          )}
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-medium text-zinc-500 mb-1 block">
            What did you accomplish? <span className="font-normal">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            maxLength={ATLAS_SUBTASK_UPDATE_MAX_CHARS}
            className="w-full text-sm px-3 py-2 rounded-xl border border-[#E5E4DF] bg-white resize-none focus:outline-none focus:ring-1 focus:ring-[#D4AF37] focus:border-[#D4AF37] placeholder:text-zinc-400"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant={isComplete ? "success" : "gold"}
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || progress === currentProgress}
          >
            {isPending
              ? "Updating…"
              : isComplete
                ? "Mark Complete"
                : "Update Progress"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
