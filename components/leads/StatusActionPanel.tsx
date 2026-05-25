"use client";

import { useState, useTransition, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  Trophy,
  XCircle,
  Leaf,
  Trash2,
  Loader2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  MessageCircle,
  Mail,
  CalendarDays,
} from "lucide-react";
import { CalledModal } from "@/components/leads/CalledModal";
import { updateLeadStatus } from "@/lib/actions/leads";
import { toast } from "sonner";
import type { LeadStatus, UserRole } from "@/lib/types/database";

// Heavy modals: load only when user opens them
const LostLeadModal = dynamic(
  () => import("@/components/leads/LostLeadModal").then((m) => ({ default: m.LostLeadModal })),
  { ssr: false },
);
const TrashLeadModal = dynamic(
  () => import("@/components/leads/TrashLeadModal").then((m) => ({ default: m.TrashLeadModal })),
  { ssr: false },
);
const NurtureModal = dynamic(
  () => import("@/components/leads/NurtureModal").then((m) => ({ default: m.NurtureModal })),
  { ssr: false },
);
const WonDealModal = dynamic(
  () => import("@/components/leads/WonDealModal").then((m) => ({ default: m.WonDealModal })),
  { ssr: false },
);

export interface NextLeadTask {
  title: string;
  task_type: string;
  due_date: string;
}

interface StatusActionPanelProps {
  leadId: string;
  leadName: string;
  currentStatus: LeadStatus;
  attemptCount?: number;
  viewerRole: UserRole;
  nextTask?: NextLeadTask | null;
}

export function StatusActionPanel({
  leadId,
  leadName,
  currentStatus,
  attemptCount = 0,
  viewerRole,
  nextTask,
}: StatusActionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayStatus, setDisplayStatus] = useState<LeadStatus>(currentStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCalledModal, setShowCalledModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [showWonModal, setShowWonModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showNurtureModal, setShowNurtureModal] = useState(false);
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
          "3 attempts reached. Consider moving this lead to Nurturing.",
          { duration: 5000 },
        );
      }

      router.refresh();
    });
  }

  const isTerminal =
    displayStatus === "won" ||
    displayStatus === "lost" ||
    displayStatus === "nurturing" ||
    displayStatus === "trash";

  return (
    <div className="space-y-3">
      {/* Error feedback */}
      <AnimatePresence mode="wait">
        {errorMessage && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-[#C0392B]/20 bg-[#FAEAE8] p-3 text-sm text-[#C0392B]"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Called Button — the primary CTA, always visible ── */}
      <div className="rounded-2xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
        {/* Subtle gold top border */}
        <div
          className="h-0.5 w-full"
          style={{ background: "linear-gradient(90deg, transparent 0%, #D4AF37 40%, #D4AF37 60%, transparent 100%)" }}
        />
        <div className="p-4 space-y-3">
          <button
            onClick={() => setShowCalledModal(true)}
            disabled={isPending}
            className="
              group relative w-full overflow-hidden rounded-xl
              bg-[#5f5348] px-5 py-3.5
              text-sm font-semibold text-white
              shadow-[0_4px_14px_0_rgb(95_83_72/0.35)]
              transition-all duration-200
              hover:bg-[#4a4039] hover:shadow-[0_6px_20px_0_rgb(95_83_72/0.4)]
              active:scale-[0.98]
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2.5
            "
          >
            {/* shimmer effect */}
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <Phone className="h-4.5 w-4.5 relative z-10" />
            <span className="relative z-10 tracking-wide">Called</span>
            {attemptCount > 0 && (
              <span className="relative z-10 ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-normal">
                {attemptCount}×
              </span>
            )}
          </button>

          {/* Next scheduled task indicator */}
          {nextTask && <NextTaskBadge task={nextTask} />}
        </div>
      </div>

      {/* ── Status-gated action buttons ── */}
      {!isTerminal && (
        <div className="rounded-2xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] p-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E] mb-3">
            Actions
          </p>

          {/* "new" status — only Called button shown above; no extra actions */}

          {/* "attempted" status */}
          {displayStatus === "attempted" && (
            <>
              <ActionButton
                icon={<TrendingUp className="h-4 w-4 text-indigo-500" />}
                label="Level Up"
                sublabel="Move to In Discussion"
                onClick={() => performAction("in_discussion")}
                disabled={isPending}
                trailing={<ArrowRight className="h-3.5 w-3.5 text-[#D0C8BE]" />}
              />
              <JunkButton
                onConfirm={(note) => {
                  startTransition(async () => {
                    const result = await updateLeadStatus(leadId, "trash");
                    if (!result.success) { toast.error(result.error ?? "Failed"); return; }
                    if (note.trim()) {
                      const { addLeadCallNote } = await import("@/lib/actions/leads");
                      await addLeadCallNote(leadId, note.trim());
                    }
                    setDisplayStatus("trash");
                    router.refresh();
                  });
                }}
                disabled={isPending}
              />
            </>
          )}

          {/* "connected" and "in_discussion" — progressive actions */}
          {(displayStatus === "connected" || displayStatus === "in_discussion") && (
            <>
              {displayStatus === "connected" && (
                <ActionButton
                  icon={<TrendingUp className="h-4 w-4 text-indigo-500" />}
                  label="Level Up"
                  sublabel="Move to In Discussion"
                  onClick={() => performAction("in_discussion")}
                  disabled={isPending}
                  trailing={<ArrowRight className="h-3.5 w-3.5 text-[#D0C8BE]" />}
                />
              )}
              {displayStatus === "in_discussion" && (
                <ActionButton
                  icon={<Trophy className="h-4 w-4 text-[#4A7C59]" />}
                  label="Won It"
                  sublabel="Finalize membership"
                  onClick={() => setShowWonModal(true)}
                  disabled={isPending}
                  highlight
                  trailing={<ArrowRight className="h-3.5 w-3.5" />}
                />
              )}
              <ActionButton
                icon={<Leaf className="h-4 w-4 text-cyan-600" />}
                label="Nurturing"
                sublabel="Set 3-month reminder"
                onClick={() => setShowNurtureModal(true)}
                disabled={isPending}
              />
              <ActionButton
                icon={<XCircle className="h-4 w-4 text-[#C0392B]" />}
                label="Kill Deal"
                sublabel="Mark as lost"
                onClick={() => setShowLostModal(true)}
                disabled={isPending}
                danger
              />
            </>
          )}
        </div>
      )}

      {/* Terminal status display */}
      {isTerminal && (
        <div className="rounded-2xl border border-[#E5E4DF] bg-white p-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
            Lead Status
          </p>
          <div
            className={`flex items-center gap-3 rounded-xl p-3 ${
              displayStatus === "won"
                ? "bg-[#EBF4EF] border border-[#4A7C59]/20"
                : displayStatus === "nurturing"
                ? "bg-cyan-50 border border-cyan-700/15"
                : "bg-[#F5F5F5] border border-[#E5E4DF]"
            }`}
          >
            {displayStatus === "won" ? (
              <Trophy className="h-5 w-5 text-[#4A7C59] shrink-0" />
            ) : displayStatus === "nurturing" ? (
              <Leaf className="h-5 w-5 text-cyan-700 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-[#9E9E9E] shrink-0" />
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
              <p className="mt-0.5 text-[11px] text-[#9E9E9E]">
                {displayStatus === "nurturing"
                  ? "Check My Tasks for the follow-up reminder."
                  : "This lead is no longer in the active pipeline."}
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Modals */}
      <CalledModal
        open={showCalledModal}
        onClose={() => setShowCalledModal(false)}
        leadId={leadId}
        onSuccess={() => {
          setShowCalledModal(false);
          router.refresh();
        }}
      />
      <LostLeadModal
        open={showLostModal}
        onClose={() => setShowLostModal(false)}
        leadId={leadId}
        onSuccess={() => {
          setShowLostModal(false);
          setDisplayStatus("lost");
          router.refresh();
        }}
      />
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

// ── Sub-components ────────────────────────────────────────────────────────────

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  highlight?: boolean;
  danger?: boolean;
}

function ActionButton({
  icon,
  label,
  sublabel,
  onClick,
  disabled,
  trailing,
  highlight,
  danger,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5
        text-left transition-all duration-150 group
        disabled:opacity-40 disabled:cursor-not-allowed
        ${highlight
          ? "border-[#4A7C59]/25 bg-[#EBF4EF]/60 hover:bg-[#EBF4EF] hover:border-[#4A7C59]/40"
          : danger
          ? "border-[#C0392B]/15 hover:bg-[#FAEAE8] hover:border-[#C0392B]/25"
          : "border-[#E5E4DF] hover:bg-[#FAFAF8] hover:border-[#D4D0CA]"
        }
      `}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[13px] font-medium ${danger ? "text-[#C0392B]" : highlight ? "text-[#2D5A3D]" : "text-[#1A1A1A]"}`}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-[11px] text-[#9E9E9E] mt-0.5">{sublabel}</span>
        )}
      </span>
      {trailing && (
        <span className="shrink-0 text-[#D0C8BE] group-hover:translate-x-0.5 transition-transform">
          {trailing}
        </span>
      )}
    </button>
  );
}

// Junk button with inline note before confirming
function JunkButton({
  onConfirm,
  disabled,
}: {
  onConfirm: (note: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="rounded-xl border border-[#E5E4DF] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        disabled={disabled}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#FAFAF8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trash2 className="h-4 w-4 text-[#9E9E9E] shrink-0" />
        <span className="flex-1 text-left">
          <span className="block text-[13px] font-medium text-[#9E9E9E]">Junk</span>
          <span className="block text-[11px] text-[#C4BDBB] mt-0.5">Mark as junk lead</span>
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-t border-[#F0EFE9] bg-[#FAFAF8]"
          >
            <div className="p-3 space-y-2">
              <p className="text-[10px] text-[#9E9E9E]">
                Reason for junking <span className="text-[#C0392B]">*</span>
              </p>
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why is this lead junk?"
                rows={2}
                className="w-full resize-none rounded-lg border border-[#E5E4DF] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#1A1A1A] placeholder:text-[#C4BDBB] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 transition-all"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setExpanded(false); setNote(""); }}
                  className="flex-1 rounded-lg py-1.5 text-[12px] text-[#9E9E9E] hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { if (!note.trim()) return; onConfirm(note); setExpanded(false); setNote(""); }}
                  disabled={!note.trim() || disabled}
                  className="flex-1 rounded-lg bg-[#C0392B] py-1.5 text-[12px] font-medium text-white hover:bg-[#A93226] disabled:opacity-40 transition-colors"
                >
                  Confirm Junk
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Next task badge ───────────────────────────────────────────────────────────

const NEXT_TASK_ICONS: Record<string, React.FC<{ className?: string }>> = {
  call:             Phone,
  whatsapp_message: MessageCircle,
  email:            Mail,
};

function NextTaskBadge({ task }: { task: NextLeadTask }) {
  const Icon = NEXT_TASK_ICONS[task.task_type] ?? CalendarDays;
  const due = new Date(task.due_date);
  const now = Date.now();
  const diffMs = due.getTime() - now;
  const isOverdue = diffMs < 0;

  let timeLabel: string;
  const absDiff = Math.abs(diffMs);
  const mins = Math.floor(absDiff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)        timeLabel = `${days}d`;
  else if (hours > 0)  timeLabel = `${hours}h`;
  else if (mins > 0)   timeLabel = `${mins}m`;
  else                 timeLabel = "now";

  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] border ${
      isOverdue
        ? "bg-[#FAEAE8] border-[#C0392B]/20 text-[#C0392B]"
        : "bg-[#F5F4F0] border-[#E5E4DF] text-[#7A6A55]"
    }`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="flex-1 truncate font-medium">{task.title}</span>
      <span className={`shrink-0 font-semibold tabular-nums ${isOverdue ? "text-[#C0392B]" : "text-[#9E9E9E]"}`}>
        {isOverdue ? `−${timeLabel}` : `in ${timeLabel}`}
      </span>
    </div>
  );
}
