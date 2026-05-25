"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Input } from "@/components/ui/input";
import { upsertAgentShift } from "@/lib/actions/agentAssignment";
import type { AgentWithRoutingStatus } from "@/lib/types/agentAssignment";

interface ShiftEditModalProps {
  agent: AgentWithRoutingStatus;
  onClose: () => void;
  onSaved: () => void;
}

export function ShiftEditModal({ agent, onClose, onSaved }: ShiftEditModalProps) {
  // Shift times stored as "HH:MM:SS" in DB — slice to "HH:MM" for the input
  const [shiftStart, setShiftStart] = useState(agent.shift_start?.slice(0, 5) ?? "");
  const [shiftEnd, setShiftEnd] = useState(agent.shift_end?.slice(0, 5) ?? "");
  const [noCap, setNoCap] = useState(agent.daily_cap === null);
  const [dailyCap, setDailyCap] = useState(agent.daily_cap?.toString() ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setIsPending(true);

    const result = await upsertAgentShift({
      userId: agent.id,
      domain: agent.domain,
      shift_start: shiftStart || null,
      shift_end: shiftEnd || null,
      daily_cap: noCap ? null : dailyCap ? parseInt(dailyCap, 10) : null,
    });

    setIsPending(false);

    if (result.success) {
      onSaved();
      onClose();
    } else {
      setError(result.error ?? "Failed to save");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1A1814]">Edit shift — {agent.full_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Shift window */}
          <div className="grid grid-cols-2 gap-3">
            <IndulgeField label="Shift start (IST)">
              <Input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
              />
            </IndulgeField>
            <IndulgeField label="Shift end (IST)">
              <Input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
              />
            </IndulgeField>
          </div>
          <p className="text-xs text-[#B5A99A] -mt-2">
            Leave both empty to make the agent always available.
          </p>

          {/* Daily cap */}
          <div>
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={noCap}
                onChange={(e) => setNoCap(e.target.checked)}
                className="rounded border-[#E5E4DF] accent-brand-gold"
              />
              <span className="text-sm text-[#4A3F35]">No daily cap</span>
            </label>

            {!noCap && (
              <IndulgeField label="Max leads per day">
                <Input
                  type="number"
                  min={1}
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  placeholder="e.g. 10"
                />
              </IndulgeField>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
        </div>

        <DialogFooter>
          <IndulgeButton variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </IndulgeButton>
          <IndulgeButton variant="gold" loading={isPending} onClick={handleSave}>
            Save changes
          </IndulgeButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
