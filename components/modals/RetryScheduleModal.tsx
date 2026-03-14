"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { markAttemptedAndScheduleRetry } from "@/lib/actions/leads";
import { toast } from "sonner";

interface RetryScheduleModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  onSuccess?: () => void;
}

export function RetryScheduleModal({
  open,
  onClose,
  leadId,
  leadName,
  onSuccess,
}: RetryScheduleModalProps) {
  const [dateTime, setDateTime] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSchedule() {
    if (!dateTime) {
      setError("Please select a date and time.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await markAttemptedAndScheduleRetry(leadId, dateTime);

    if (!result.success) {
      setError(result.error ?? "Failed to schedule retry.");
      setLoading(false);
      return;
    }

    if (result.attemptCount === 3) {
      toast.info(
        "3 attempts reached. Consider moving this lead to Nurturing (Cold) to keep your pipeline clean.",
        { duration: 5000 }
      );
    }

    setLoading(false);
    onSuccess ? onSuccess() : onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule Retry Call</DialogTitle>
          <DialogDescription>
            No answer for{" "}
            <span className="font-medium text-[#1A1A1A]">{leadName}</span>.
            When would you like to follow up?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Retry date & time</Label>
            <LuxuryDatePicker
              value={dateTime}
              onChange={setDateTime}
              placeholder="Pick retry date & time…"
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-[#C0392B] bg-[#FAEAE8] rounded-lg px-3 py-2"
            >
              {error}
            </motion.p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="gold"
            onClick={handleSchedule}
            disabled={loading || !dateTime}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scheduling…
              </>
            ) : (
              "Schedule Retry"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
