"use client";

import { useState, useTransition, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneOff,
  MessageCircle,
  Trophy,
  XCircle,
  Leaf,
  Trash2,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const RetryScheduleModal = dynamic(
  () => import("@/components/modals/RetryScheduleModal").then((m) => ({ default: m.RetryScheduleModal })),
  { ssr: false }
);
import { updateLeadStatus, addLeadNote } from "@/lib/actions/leads";

// Heavy modals: load only when user opens them (reduces initial bundle)
const LostLeadModal = dynamic(
  () => import("@/components/leads/LostLeadModal").then((m) => ({ default: m.LostLeadModal })),
  { ssr: false }
);
const TrashLeadModal = dynamic(
  () => import("@/components/leads/TrashLeadModal").then((m) => ({ default: m.TrashLeadModal })),
  { ssr: false }
);
const NurtureModal = dynamic(
  () => import("@/components/leads/NurtureModal").then((m) => ({ default: m.NurtureModal })),
  { ssr: false }
);
const WonDealModal = dynamic(
  () => import("@/components/leads/WonDealModal").then((m) => ({ default: m.WonDealModal })),
  { ssr: false }
);

import { toast } from "sonner";
import { useClientOnly } from "@/lib/hooks/useClientOnly";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadFollowUpAccordion } from "@/components/leads/LeadFollowUpAccordion";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_ORDER } from "@/lib/types/database";
import type { LeadStatus, UserRole } from "@/lib/types/database";

type FollowUpDraftSlot = 1 | 2 | 3;

interface StatusActionPanelProps {
  leadId: string;
  leadName: string;
  currentStatus: LeadStatus;
  attemptCount?: number;
  viewerRole: UserRole;
  initialFollowUpDrafts: Record<FollowUpDraftSlot, string>;
}

export function StatusActionPanel({
  leadId,
  leadName,
  currentStatus,
  attemptCount = 0,
  viewerRole,
  initialFollowUpDrafts,
}: StatusActionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNotePending, startNoteTransition] = useTransition();
  const [displayStatus, setDisplayStatus] = useState<LeadStatus>(currentStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [showWonModal, setShowWonModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showNurtureModal, setShowNurtureModal] = useState(false);
  const [note, setNote] = useState("");
  const mounted = useClientOnly();
  const canManualStatusChange =
    viewerRole === "admin" || viewerRole === "founder" || viewerRole === "manager";

  useEffect(() => {
    setDisplayStatus(currentStatus);
  }, [currentStatus]);

  function performAction(newStatus: LeadStatus) {
    const previousStatus = displayStatus;
    setDisplayStatus(newStatus);
    setErrorMessage(null);

    startTransition(async () => {
      const result = await updateLeadStatus(leadId, newStatus);

      if (!result.success) {
        setDisplayStatus(previousStatus);
        setErrorMessage(result.error ?? "Something went wrong.");
        return;
      }

      if (newStatus === "attempted" && result.attemptCount === 3) {
        toast.info(
          "3 attempts reached. Consider moving this lead to Nurturing (Cold) to keep your pipeline clean.",
          { duration: 5000 }
        );
      }

      router.refresh();
    });
  }

  function handleStatusDropdownChange(value: string) {
    const newStatus = value as LeadStatus;
    if (newStatus === "trash") {
      setShowTrashModal(true);
      return;
    }
    if (newStatus === "lost") {
      setShowLostModal(true);
      return;
    }
    if (newStatus === "nurturing") {
      setShowNurtureModal(true);
      return;
    }
    performAction(newStatus);
  }

  function handleSaveNote() {
    if (!note.trim()) return;
    const savedNote = note.trim();

    startNoteTransition(async () => {
      const result = await addLeadNote(leadId, savedNote);
      if (!result.success) {
        toast.error(result.error ?? "Could not save note");
        return;
      }
      setNote("");
      toast.success("Note saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Error feedback */}
      <AnimatePresence mode="wait">
        {errorMessage && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 bg-[#FAEAE8] border border-[#C0392B]/20 rounded-lg text-sm text-[#C0392B]"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Read-only status for finance / other viewers — agents use main card + journey; scout/admin use dropdown */}
      {!canManualStatusChange && viewerRole !== "agent" && (
        <div className="rounded-xl border border-stone-200 bg-linear-to-b from-stone-50/90 to-white p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Lead status
          </p>
          <div className="flex justify-center py-1">
            <LeadStatusBadge
              status={displayStatus}
              size="md"
              className="border border-stone-200/80 px-4 py-1.5 text-[13px] shadow-none ring-0"
            />
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-500">
            Progress this lead using the workflow actions below.
          </p>
        </div>
      )}

      <LeadFollowUpAccordion
        leadId={leadId}
        role={viewerRole}
        initialDrafts={initialFollowUpDrafts}
      />

      {/* Actions by status — uses optimistic displayStatus for instant feedback */}
      {displayStatus === "new" && (
        <ActionSection title="Contact Attempt">
          <p className="text-xs text-[#9E9E9E] mb-3">
            Open this lead to attempt first contact. Record the outcome below.
          </p>
          <Button
            variant="default"
            className="w-full gap-2"
            onClick={() => performAction("attempted")}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
            Mark as Attempted
          </Button>
        </ActionSection>
      )}

      {displayStatus === "attempted" && (
        <ActionSection title="Call Outcome">
          <p className="text-xs text-[#9E9E9E] mb-3">
            What happened when you tried to reach this lead?
          </p>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full gap-2 justify-start"
              onClick={() => setShowRetryModal(true)}
              disabled={isPending}
            >
              <PhoneOff className="w-4 h-4 text-[#C5830A]" />
              Didn't Answer — Schedule Retry
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start"
              onClick={() => performAction("connected")}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 text-indigo-500" />
              )}
              Answered — Connected
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-[#D0C8BE]" />
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start"
              onClick={() => performAction("in_discussion")}
              disabled={isPending}
            >
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              In Discussion
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-[#D0C8BE]" />
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start text-[#C0392B] hover:bg-[#FAEAE8] border-[#E5E4DF] hover:border-[#C0392B]/20"
              onClick={() => setShowTrashModal(true)}
              disabled={isPending}
            >
              <Trash2 className="w-4 h-4" />
              Mark as Trash
            </Button>
          </div>
        </ActionSection>
      )}

      {displayStatus === "connected" && (
        <ActionSection title="Discussion Outcome">
          <p className="text-xs text-[#9E9E9E] mb-3">
            How is this conversation progressing?
          </p>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full gap-2 justify-start"
              onClick={() => performAction("in_discussion")}
              disabled={isPending}
            >
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              Move to In Discussion
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-[#D0C8BE]" />
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start"
              onClick={() => setShowNurtureModal(true)}
              disabled={isPending}
            >
              <Leaf className="w-4 h-4 text-cyan-600" />
              Nurturing — Set 3-Month Reminder
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start text-[#C0392B] hover:bg-[#FAEAE8] border-[#E5E4DF] hover:border-[#C0392B]/20"
              onClick={() => setShowLostModal(true)}
              disabled={isPending}
            >
              <XCircle className="w-4 h-4" />
              Mark as Lost
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start text-zinc-500 hover:bg-zinc-100 border-[#E5E4DF]"
              onClick={() => setShowTrashModal(true)}
              disabled={isPending}
            >
              <Trash2 className="w-4 h-4" />
              Mark as Trash
            </Button>
          </div>
        </ActionSection>
      )}

      {displayStatus === "in_discussion" && (
        <ActionSection title="Discussion Outcome">
          <p className="text-xs text-[#9E9E9E] mb-3">
            How is this conversation progressing?
          </p>
          <div className="space-y-2">
            <Button
              variant="success"
              className="w-full gap-2 justify-start"
              onClick={() => setShowWonModal(true)}
              disabled={isPending}
            >
              <Trophy className="w-4 h-4" />
              Mark as Won — Finalize Membership
              <ArrowRight className="w-3.5 h-3.5 ml-auto" />
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start"
              onClick={() => setShowNurtureModal(true)}
              disabled={isPending}
            >
              <Leaf className="w-4 h-4 text-cyan-600" />
              Nurturing — Set 3-Month Reminder
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start text-[#C0392B] hover:bg-[#FAEAE8] border-[#E5E4DF] hover:border-[#C0392B]/20"
              onClick={() => setShowLostModal(true)}
              disabled={isPending}
            >
              <XCircle className="w-4 h-4" />
              Mark as Lost
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start text-zinc-500 hover:bg-zinc-100 border-[#E5E4DF]"
              onClick={() => setShowTrashModal(true)}
              disabled={isPending}
            >
              <Trash2 className="w-4 h-4" />
              Mark as Trash
            </Button>
          </div>
        </ActionSection>
      )}

      {(displayStatus === "won" ||
        displayStatus === "lost" ||
        displayStatus === "nurturing" ||
        displayStatus === "trash") && (
        <ActionSection title="Lead Status">
          <div
            className={`flex items-center gap-3 p-3 rounded-lg ${
              displayStatus === "won"
                ? "bg-[#EBF4EF] border border-[#4A7C59]/20"
                : displayStatus === "nurturing"
                ? "bg-cyan-50/90 border border-cyan-700/15"
                : "bg-[#F5F5F5] border border-[#E5E4DF]"
            }`}
          >
            {displayStatus === "won" ? (
              <Trophy className="w-5 h-5 text-[#4A7C59] shrink-0" />
            ) : displayStatus === "nurturing" ? (
              <Leaf className="w-5 h-5 text-cyan-700 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-[#9E9E9E] shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium text-[#1A1A1A]">
                {displayStatus === "won"
                  ? "Lead converted & sent to Finance"
                  : displayStatus === "nurturing"
                  ? "3-month nurture reminder is active"
                  : displayStatus === "trash"
                  ? "Marked as junk"
                  : "Lead marked as lost"}
              </p>
              <p className="text-xs text-[#9E9E9E] mt-0.5">
                {displayStatus === "nurturing"
                  ? "Check My Tasks for the follow-up reminder."
                  : "This lead is no longer in the active pipeline."}
              </p>
            </div>
          </div>
        </ActionSection>
      )}

      {/* Notes section — always visible */}
      <ActionSection title="Marketing Notes">
        <Textarea
          placeholder="Record conversation details, objections, preferences…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <Button
          variant="gold"
          size="sm"
          className="mt-2 gap-1.5"
          onClick={handleSaveNote}
          disabled={isNotePending || !note.trim()}
        >
          {isNotePending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : null}
          Save Note
        </Button>
      </ActionSection>

      {/* Status dropdown — scout/admin only; intercepts trash/lost/nurturing */}
      {canManualStatusChange && (
        <ActionSection title="Change Status">
          {mounted ? (
            <Select
              value={displayStatus}
              onValueChange={handleStatusDropdownChange}
              disabled={isPending}
            >
              <SelectTrigger className="w-full bg-white border-[#E5E4DF]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_CONFIG[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-9 w-full items-center justify-between rounded-md border border-[#E5E4DF] bg-white px-3 py-2 text-sm text-[#1A1A1A]">
              <span>{LEAD_STATUS_CONFIG[displayStatus].label}</span>
            </div>
          )}
        </ActionSection>
      )}

      {/* Retry modal */}
      <RetryScheduleModal
        open={showRetryModal}
        onClose={() => setShowRetryModal(false)}
        leadId={leadId}
        leadName={leadName}
        onSuccess={() => {
          setShowRetryModal(false);
          router.refresh();
        }}
      />

      {/* Lost lead analysis modal */}
      <LostLeadModal
        open={showLostModal}
        onClose={() => setShowLostModal(false)}
        leadId={leadId}
        onSuccess={() => {
          setShowLostModal(false);
          setDisplayStatus("lost"); // instant update
          router.refresh();
        }}
      />

      {/* Won deal revenue modal */}
      <WonDealModal
        open={showWonModal}
        onClose={() => setShowWonModal(false)}
        leadId={leadId}
        leadName={leadName}
        onSuccess={() => {
          setShowWonModal(false);
          setDisplayStatus("won");
          router.refresh();
        }}
      />

      {/* Trash modal */}
      <TrashLeadModal
        open={showTrashModal}
        onClose={() => setShowTrashModal(false)}
        leadId={leadId}
        onSuccess={() => {
          setShowTrashModal(false);
          setDisplayStatus("trash");
          router.refresh();
        }}
      />

      {/* Nurture modal */}
      <NurtureModal
        open={showNurtureModal}
        onClose={() => setShowNurtureModal(false)}
        leadId={leadId}
        onSuccess={() => {
          setShowNurtureModal(false);
          setDisplayStatus("nurturing");
          router.refresh();
        }}
      />
    </div>
  );
}

function ActionSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E4DF] p-4">
      <p className="text-[11px] font-semibold text-[#9E9E9E] uppercase tracking-wider mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}
