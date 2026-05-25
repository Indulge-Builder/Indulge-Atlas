"use client";

import { useState, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StickyNote, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { addLeadCallNote, type LeadNote } from "@/lib/actions/leads";
import { useRouter } from "next/navigation";

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  rnr:          { label: "RNR",           color: "#92400E", bg: "#FEF3C7" },
  switched_off: { label: "Switched Off",  color: "#374151", bg: "#F3F4F6" },
  wrong_number: { label: "Wrong Number",  color: "#9F1239", bg: "#FFF1F2" },
  conversing:   { label: "Conversing",    color: "#065F46", bg: "#ECFDF5" },
  other:        { label: "Other",         color: "#44403C", bg: "#F5F5F4" },
};

interface LeadNotesSectionProps {
  leadId: string;
  initialNotes: LeadNote[];
}

export function LeadNotesSection({ leadId, initialNotes }: LeadNotesSectionProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<LeadNote[]>(initialNotes);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);
  const [draftNote, setDraftNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSaveManualNote() {
    if (!draftNote.trim()) return;
    startTransition(async () => {
      const result = await addLeadCallNote(leadId, draftNote.trim(), undefined);
      if (!result.success) {
        toast.error(result.error ?? "Could not save note");
        return;
      }
      setDraftNote("");
      setIsAdding(false);
      toast.success("Note saved");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EFE9]">
        <div className="flex items-center gap-2.5">
          <StickyNote className="h-3.5 w-3.5 text-[#9E9E9E]" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
            Notes
          </span>
          {notes.length > 0 && (
            <span className="rounded-full bg-[#F0EFE9] px-1.5 py-0.5 text-[10px] font-medium text-[#7A6A55]">
              {notes.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[#7A6A55] transition-colors hover:bg-[#F5F4F0]"
        >
          <Plus className="h-3 w-3" />
          Add Note
        </button>
      </div>

      {/* Inline note composer */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-b border-[#F0EFE9]"
          >
            <div className="p-4 space-y-2.5 bg-[#FAFAF8]">
              <textarea
                autoFocus
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Add a note about this lead…"
                rows={3}
                className="w-full resize-none rounded-xl border border-[#E5E4DF] bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-[#1A1A1A] placeholder:text-[#C4BDBB] focus:border-[#D4AF37]/60 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 transition-all"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setIsAdding(false); setDraftNote(""); }}
                  className="rounded-lg px-3 py-1.5 text-[12px] text-[#9E9E9E] hover:text-[#1A1A1A] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveManualNote}
                  disabled={!draftNote.trim() || isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-[#5f5348] px-4 py-1.5 text-[12px] font-medium text-white transition-all hover:bg-[#4a4039] disabled:opacity-40"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save Note
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes list */}
      <div className="divide-y divide-[#F5F4F0]">
        {notes.length === 0 && !isAdding ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[12px] text-[#C4BDBB]">No notes yet. Click "Called" to log your first call.</p>
          </div>
        ) : (
          notes.map((note, i) => (
            <NoteCard key={note.id} note={note} isFirst={i === 0} />
          ))
        )}
      </div>
    </div>
  );
}

function NoteCard({ note, isFirst }: { note: LeadNote; isFirst: boolean }) {
  const outcome = note.call_outcome ? OUTCOME_LABELS[note.call_outcome] : null;
  const timeAgo = formatDistanceToNow(new Date(note.created_at), { addSuffix: true });
  const creatorName = note.creator?.full_name ?? "Unknown";
  const initials = creatorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.div
      initial={isFirst ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      className="group px-5 py-4 transition-colors hover:bg-[#FAFAF8]"
    >
      <div className="flex items-start gap-3">
        {/* Creator avatar */}
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EDE9E4] text-[10px] font-semibold text-[#7A6A55]">
          {initials}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Meta row */}
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[12px] font-medium text-[#1A1A1A] truncate">
                {creatorName}
              </span>
              {outcome && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: outcome.color, background: outcome.bg }}
                >
                  {outcome.label}
                </span>
              )}
            </div>
            <time
              className="shrink-0 text-[11px] text-[#B5A99A]"
              dateTime={note.created_at}
              title={new Date(note.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            >
              {timeAgo}
            </time>
          </div>

          {/* Note text */}
          <p className="text-[13px] leading-relaxed text-[#4A4039] whitespace-pre-wrap break-words">
            {note.content}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
