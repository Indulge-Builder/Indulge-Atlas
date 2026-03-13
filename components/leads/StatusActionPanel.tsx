"use client";

import { useState, useTransition, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RetryScheduleModal } from "@/components/modals/RetryScheduleModal";
import { LostLeadModal } from "@/components/leads/LostLeadModal";
import { WonDealModal } from "@/components/leads/WonDealModal";
import { updateLeadStatus, addLeadNote } from "@/lib/actions/leads";
import type { LeadStatus } from "@/lib/types/database";

interface StatusActionPanelProps {
  leadId: string;
  leadName: string;
  currentStatus: LeadStatus;
}

export function StatusActionPanel({
  leadId,
  leadName,
  currentStatus,
}: StatusActionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNotePending, startNoteTransition] = useTransition();
  // Optimistic status — updates instantly on click, syncs when server re-renders
  const [displayStatus, setDisplayStatus] = useState<LeadStatus>(currentStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [showLostModal, setShowLostModal]   = useState(false);
  const [showWonModal,  setShowWonModal]    = useState(false);
  const [note, setNote] = useState("");

  // Sync optimistic state when the server re-renders with confirmed data
  useEffect(() => {
    setDisplayStatus(currentStatus);
  }, [currentStatus]);

  function performAction(newStatus: LeadStatus) {
    const previousStatus = displayStatus;
    setDisplayStatus(newStatus); // instant UI update
    setErrorMessage(null);

    startTransition(async () => {
      const result = await updateLeadStatus(leadId, newStatus);

      if (!result.success) {
        setDisplayStatus(previousStatus); // revert on failure
        setErrorMessage(result.error ?? "Something went wrong.");
        return;
      }

      router.refresh(); // background sync — UI already shows the new state
    });
  }

  function handleSaveNote() {
    if (!note.trim()) return;
    const savedNote = note.trim();
    setNote(""); // clear immediately

    startNoteTransition(async () => {
      await addLeadNote(leadId, savedNote);
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
              onClick={() => performAction("in_discussion")}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4 text-[#6B4FBB]" />
              )}
              Answered — Now In Discussion
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-[#D0C8BE]" />
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 justify-start text-[#C0392B] hover:bg-[#FAEAE8] border-[#E5E4DF] hover:border-[#C0392B]/20"
              onClick={() => performAction("trash")}
              disabled={isPending}
            >
              <Trash2 className="w-4 h-4" />
              Mark as Junk
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
              onClick={() => performAction("nurturing")}
              disabled={isPending}
            >
              <Leaf className="w-4 h-4 text-[#8A8A6E]" />
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
                ? "bg-[#F4F4EE] border border-[#8A8A6E]/20"
                : "bg-[#F5F5F5] border border-[#E5E4DF]"
            }`}
          >
            {displayStatus === "won" ? (
              <Trophy className="w-5 h-5 text-[#4A7C59] shrink-0" />
            ) : displayStatus === "nurturing" ? (
              <Leaf className="w-5 h-5 text-[#8A8A6E] shrink-0" />
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
          setDisplayStatus("won"); // instant update
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
