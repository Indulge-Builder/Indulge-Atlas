"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { LuxuryDatePicker } from "@/components/ui/LuxuryDatePicker";
import { createLeadTask } from "@/lib/actions/tasks";
import { saveLeadFollowUpDrafts } from "@/lib/actions/leads";
import { AGENT_TASK_TYPES } from "@/lib/types/database";
import type { TaskType, UserRole } from "@/lib/types/database";
import { toast } from "sonner";
import { useClientOnly } from "@/lib/hooks/useClientOnly";

const SLOTS = [1, 2, 3] as const;
type FollowSlot = (typeof SLOTS)[number];

const DEBOUNCE_MS = 1500;
const SUCCESS_VISIBLE_MS = 3000;

type SyncStatus = "idle" | "typing" | "saving" | "success";

type NormalizedDrafts = { "1": string; "2": string; "3": string };

function slotLabel(slot: FollowSlot): string {
  return `Follow Up ${slot}`;
}

function tomorrowNineAm(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function fromInitial(initial: Record<FollowSlot, string>): Record<FollowSlot, string> {
  return {
    1: initial[1] ?? "",
    2: initial[2] ?? "",
    3: initial[3] ?? "",
  };
}

/** Matches server persistence: trim per slot (see saveLeadFollowUpDrafts). */
function normalizeDraftsMap(map: Record<FollowSlot, string>): NormalizedDrafts {
  return {
    "1": map[1].trim() || "",
    "2": map[2].trim() || "",
    "3": map[3].trim() || "",
  };
}

function normalizedEquals(a: NormalizedDrafts, b: NormalizedDrafts): boolean {
  return a["1"] === b["1"] && a["2"] === b["2"] && a["3"] === b["3"];
}

function toApiPayload(map: Record<FollowSlot, string>): {
  "1": string;
  "2": string;
  "3": string;
} {
  return { "1": map[1], "2": map[2], "3": map[3] };
}

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

const DEFAULT_TITLES: Record<TaskType, string> = {
  call: "Follow-up call",
  general_follow_up: "Nurture follow-up",
  email: "Send email",
  whatsapp_message: "Send WhatsApp message",
  file_dispatch: "Send document",
  campaign_review: "Campaign review",
  strategy_meeting: "Strategy meeting",
  budget_approval: "Budget approval",
  performance_analysis: "Performance analysis",
};

interface LeadFollowUpAccordionProps {
  leadId: string;
  role: UserRole;
  initialDrafts: Record<FollowSlot, string>;
}

export function LeadFollowUpAccordion({
  leadId,
  role,
  initialDrafts,
}: LeadFollowUpAccordionProps) {
  const router = useRouter();
  const mounted = useClientOnly();
  const initialMap = fromInitial(initialDrafts);

  const [notesBySlot, setNotesBySlot] = useState<Record<FollowSlot, string>>(
    () => initialMap,
  );
  const notesRef = useRef<Record<FollowSlot, string>>(initialMap);
  notesRef.current = notesBySlot;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const mountedRef = useRef(true);
  const leadIdRef = useRef(leadId);

  useEffect(() => {
    leadIdRef.current = leadId;
  }, [leadId]);

  const lastSyncedRef = useRef<NormalizedDrafts>(normalizeDraftsMap(initialMap));

  useEffect(() => {
    const next = fromInitial(initialDrafts);
    setNotesBySlot(next);
    notesRef.current = next;
    lastSyncedRef.current = normalizeDraftsMap(next);
    clearTimeout(debounceRef.current);
    clearTimeout(successTimerRef.current);
    debounceRef.current = undefined;
    successTimerRef.current = undefined;
    setSyncStatus("idle");
  }, [leadId, initialDrafts[1], initialDrafts[2], initialDrafts[3]]);

  const clearDebounce = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
  }, []);

  const scheduleSuccessToIdle = useCallback(() => {
    clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setSyncStatus("idle");
    }, SUCCESS_VISIBLE_MS);
  }, []);

  const flushSaveRef = useRef<
    ((opts: { silent?: boolean }) => Promise<void>) | null
  >(null);

  const flushSave = useCallback(
    async (opts: { silent?: boolean }) => {
      clearDebounce();
      const id = leadIdRef.current;
      const snapshot: Record<FollowSlot, string> = {
        1: notesRef.current[1],
        2: notesRef.current[2],
        3: notesRef.current[3],
      };
      const normalizedNow = normalizeDraftsMap(snapshot);
      if (normalizedEquals(normalizedNow, lastSyncedRef.current)) {
        if (!opts.silent && mountedRef.current) setSyncStatus("idle");
        return;
      }

      if (!opts.silent && mountedRef.current) setSyncStatus("saving");

      let result: Awaited<ReturnType<typeof saveLeadFollowUpDrafts>>;
      try {
        result = await saveLeadFollowUpDrafts(id, toApiPayload(snapshot));
      } catch {
        if (opts.silent) return;
        if (mountedRef.current) {
          toast.error(
            "Could not sync follow-up notes (network or server). Your text is still here — try again.",
          );
          setSyncStatus("typing");
        }
        return;
      }

      if (opts.silent) {
        if (result.success) lastSyncedRef.current = normalizeDraftsMap(snapshot);
        return;
      }

      if (!mountedRef.current) return;

      if (result.success) {
        lastSyncedRef.current = normalizeDraftsMap(snapshot);
        const stillDirty = !normalizedEquals(
          normalizeDraftsMap(notesRef.current),
          lastSyncedRef.current,
        );
        if (stillDirty) {
          setSyncStatus("typing");
          debounceRef.current = setTimeout(() => {
            void flushSaveRef.current?.({});
          }, DEBOUNCE_MS);
        } else {
          setSyncStatus("success");
          scheduleSuccessToIdle();
        }
      } else {
        toast.error(result.error ?? "Couldn't save follow-up notes");
        setSyncStatus("typing");
      }
    },
    [clearDebounce, scheduleSuccessToIdle],
  );

  flushSaveRef.current = flushSave;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearDebounce();
      clearTimeout(successTimerRef.current);
      void flushSaveRef.current?.({ silent: true });
    };
  }, [clearDebounce]);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<FollowSlot | null>(null);
  const [dueAt, setDueAt] = useState<Date>(() => tomorrowNineAm());
  const [taskType, setTaskType] = useState<TaskType>("call");
  const [taskTitle, setTaskTitle] = useState(DEFAULT_TITLES.call);
  /** Task-only notes — never merged with cadence summaries */
  const [taskNotes, setTaskNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTaskTitle(DEFAULT_TITLES[taskType]);
  }, [taskType]);

  const availableTypes: TaskType[] =
    role === "agent"
      ? [...AGENT_TASK_TYPES]
      : ([
          ...AGENT_TASK_TYPES,
          "campaign_review",
          "strategy_meeting",
          "budget_approval",
          "performance_analysis",
        ] as TaskType[]);

  function handleSlotChange(slot: FollowSlot, text: string) {
    const next: Record<FollowSlot, string> = {
      ...notesRef.current,
      [slot]: text,
    };
    notesRef.current = next;
    setNotesBySlot(next);
    clearDebounce();
    clearTimeout(successTimerRef.current);

    if (normalizedEquals(normalizeDraftsMap(next), lastSyncedRef.current)) {
      setSyncStatus("idle");
      return;
    }

    setSyncStatus("typing");
    debounceRef.current = setTimeout(() => {
      void flushSaveRef.current?.({});
    }, DEBOUNCE_MS);
  }

  function handleDraftBlur() {
    void flushSaveRef.current?.({});
  }

  function openSchedule(slot: FollowSlot) {
    setActiveSlot(slot);
    setDueAt(tomorrowNineAm());
    setTaskType("call");
    setTaskTitle(DEFAULT_TITLES.call);
    setTaskNotes("");
    setScheduleOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      setActiveSlot(null);
      setTaskNotes("");
      setTaskTitle(DEFAULT_TITLES.call);
      setTaskType("call");
    }
    setScheduleOpen(open);
  }

  async function submitSchedule() {
    if (!activeSlot) return;
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) {
      toast.error("Add a task title");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createLeadTask({
        leadId,
        title: trimmedTitle,
        dueAt,
        type: taskType,
        notes: taskNotes.trim() || null,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not create task");
        return;
      }
      toast.success("Task scheduled");
      handleDialogOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-stone-200 bg-white p-4 transition-shadow duration-200">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Follow-up cadence
            </p>
          </div>
        </div>

        <Accordion type="single" collapsible className="w-full rounded-lg border border-stone-200">
          {SLOTS.map((slot) => (
            <AccordionItem key={slot} value={`fu-${slot}`} className="border-stone-200 px-3">
              <AccordionTrigger className="text-sm">{slotLabel(slot)}</AccordionTrigger>
              <AccordionContent>
                <Textarea
                  placeholder="Conversation summary for this touchpoint…"
                  value={notesBySlot[slot]}
                  onChange={(e) => handleSlotChange(slot, e.target.value)}
                  onBlur={handleDraftBlur}
                  rows={1}
                  className="max-h-48 min-h-[5.5rem] resize-none overflow-y-auto border-0 bg-stone-50/80 px-3 py-2.5 text-sm leading-relaxed text-stone-800 shadow-none ring-1 ring-stone-200/80 transition-shadow duration-200 [field-sizing:content] placeholder:text-stone-400 focus-visible:ring-stone-300"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2.5 h-8 border-stone-200 text-xs text-stone-700 hover:bg-stone-50"
                  onClick={() => openSchedule(slot)}
                >
                  Create Task
                </Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {syncStatus !== "idle" && (
          <div
            className="mt-1 flex justify-end px-0.5"
            aria-live="polite"
          >
            {syncStatus === "typing" && (
              <span className="text-stone-400 text-xs italic">
                Unsaved changes...
              </span>
            )}
            {syncStatus === "saving" && (
              <span className="text-stone-500 text-xs animate-pulse">Saving...</span>
            )}
            {syncStatus === "success" && (
              <span className="text-stone-400 text-xs animate-in fade-in duration-300">
                Saved just now
              </span>
            )}
          </div>
        )}
      </div>

      <Dialog open={scheduleOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-md border-stone-200 shadow-lg">
          <DialogHeader>
            <DialogTitle
              className="text-[#1A1A1A] text-base font-semibold"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              Schedule task
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-xs leading-relaxed">
              {activeSlot ? (
                <>
                  From <span className="font-medium text-stone-700">{slotLabel(activeSlot)}</span>
                  {" — "}
                  your cadence summary stays on the lead. Set the real task below.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Task title
              </Label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g. Follow-up 2 call, Send deck on WhatsApp…"
                className="h-10 border-stone-200 bg-white text-sm"
              />
            </div>

            {mounted ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  Type
                </Label>
                <Select
                  value={taskType}
                  onValueChange={(v) => setTaskType(v as TaskType)}
                >
                  <SelectTrigger className="h-10 border-stone-200 bg-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-stone-200">
                    {availableTypes.map((t) => (
                      <SelectItem key={t} value={t} className="text-sm">
                        {TASK_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Due date &amp; time
              </Label>
              <LuxuryDatePicker
                value={dueAt}
                onChange={(d) => d && setDueAt(d)}
                placeholder="Pick date & time…"
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                Task notes <span className="font-normal normal-case text-stone-400">(optional)</span>
              </Label>
              <Textarea
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                rows={3}
                placeholder="Only for this task — e.g. ask Priya before calling back…"
                className="resize-none border-stone-200 bg-stone-50/50 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-stone-200"
              onClick={() => handleDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#1A1A1A] text-white hover:bg-[#2A2A2A]"
              disabled={submitting}
              onClick={() => void submitSchedule()}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Scheduling…
                </span>
              ) : (
                "Schedule task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
