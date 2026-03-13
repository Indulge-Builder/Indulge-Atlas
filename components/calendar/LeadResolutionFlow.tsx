"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const luxuryEasing = [0.22, 1, 0.36, 1] as const;
import {
  X,
  Check,
  UserPlus,
  FileText,
  Loader2,
  Search,
  Link2,
  Phone,
  MapPin,
} from "lucide-react";
import {
  searchLeadsByName,
  linkTaskToLead,
  saveTaskContextNotes,
} from "@/lib/actions/smart-calendar";
import { LEAD_STATUS_CONFIG } from "@/lib/types/database";
import { getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { LeadMatch } from "@/lib/actions/smart-calendar";
import type { LeadStatus } from "@/lib/types/database";

// ── Step machine ───────────────────────────────────────────

type Step =
  | "searching"
  | "match"
  | "multi-match"
  | "no-match"
  | "linked"
  | "notes"
  | "notes-saved";

// ── Props ──────────────────────────────────────────────────

interface LeadResolutionFlowProps {
  taskId: string;
  subject: string;
  onClose: () => void;
  onOpenAddLead: () => void;
  onRefresh: () => void;
}

// ── Animation presets ──────────────────────────────────────

const STEP_ANIM = {
  initial:    { opacity: 0, y: 10 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -8 },
  transition: { duration: 0.4, ease: luxuryEasing },
};

// ── Dark secondary button ──────────────────────────────────

const SECONDARY_BTN =
  "flex items-center justify-center gap-1.5 text-[12px] font-medium " +
  "text-white/45 border border-white/[0.09] bg-white/[0.06] " +
  "py-2.5 rounded-xl hover:bg-white/[0.10] hover:text-white/70 transition-colors";

// ── Single-match card ──────────────────────────────────────

function SingleMatchCard({
  lead,
  selected,
  onClick,
}: {
  lead:     LeadMatch;
  selected: boolean;
  onClick:  () => void;
}) {
  const cfg = LEAD_STATUS_CONFIG[lead.status as LeadStatus];

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left",
        selected
          ? "border-[#D4AF37]/[0.35] bg-[#D4AF37]/[0.08]"
          : "border-white/[0.08] bg-white/[0.04] hover:border-white/[0.16] hover:bg-white/[0.07]"
      )}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
        style={{ background: "rgba(212,175,55,0.15)", color: "#D4AF37" }}
      >
        {getInitials((lead.first_name + " " + (lead.last_name ?? "")).trim())}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/85 leading-snug truncate">
          {lead.first_name} {lead.last_name ?? ""}
        </p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {lead.phone_number && (
            <span className="flex items-center gap-1 text-[11px] text-white/35">
              <Phone className="w-2.5 h-2.5" />
              {lead.phone_number}
            </span>
          )}
          {lead.city && (
            <span className="flex items-center gap-1 text-[11px] text-white/25">
              <MapPin className="w-2.5 h-2.5" />
              {lead.city}
            </span>
          )}
        </div>
      </div>

      {/* Status badge */}
      {cfg && (
        <span
          className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0"
          style={{ color: cfg.color, background: cfg.bgColor }}
        >
          {cfg.label}
        </span>
      )}

      {/* Selection tick */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.25, ease: luxuryEasing }}
            className="w-5 h-5 rounded-full bg-[#D4AF37] flex items-center justify-center shrink-0"
          >
            <Check className="w-3 h-3 text-[#0D0C0A]" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ── Multi-match card ───────────────────────────────────────
// Clicking immediately links — no separate confirmation step.

function MultiMatchCard({
  lead,
  isLinking,
  isDisabled,
  onClick,
}: {
  lead:       LeadMatch;
  isLinking:  boolean;
  isDisabled: boolean;
  onClick:    () => void;
}) {
  const cfg = LEAD_STATUS_CONFIG[lead.status as LeadStatus];

  return (
    <motion.div
      whileHover={!isDisabled ? { x: -3 } : {}}
      onClick={!isDisabled ? onClick : undefined}
      style={
        isDisabled && !isLinking
          ? { opacity: 0.4, pointerEvents: "none" }
          : {}
      }
      className={cn(
        "flex items-center gap-3.5 p-4 rounded-2xl border transition-colors duration-150",
        isLinking
          ? "border-[#D4AF37]/[0.35] bg-[#D4AF37]/[0.06]"
          : "border-white/[0.07] bg-white/[0.04] hover:border-white/[0.15] cursor-pointer"
      )}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
        style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37" }}
      >
        {getInitials((lead.first_name + " " + (lead.last_name ?? "")).trim())}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-semibold text-white/85 leading-snug truncate"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          {lead.first_name} {lead.last_name ?? ""}
        </p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {lead.phone_number && (
            <span className="flex items-center gap-1 text-[11px] text-white/35 font-mono">
              <Phone className="w-2.5 h-2.5" strokeWidth={1.5} />
              {lead.phone_number}
            </span>
          )}
          {lead.city && (
            <span className="flex items-center gap-1 text-[11px] text-white/25">
              <MapPin className="w-2.5 h-2.5" strokeWidth={1.5} />
              {lead.city}
            </span>
          )}
        </div>
      </div>

      {/* Status badge or linking spinner */}
      {isLinking ? (
        <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin shrink-0" />
      ) : (
        cfg && (
          <span
            className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0"
            style={{ color: cfg.color, background: cfg.bgColor }}
          >
            {cfg.label}
          </span>
        )
      )}

      {/* Arrow hint — visible on hover */}
      {!isLinking && !isDisabled && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          whileHover={{ opacity: 1, x: 0 }}
          className="text-[#D4AF37]/60 text-sm shrink-0 ml-1"
        >
          →
        </motion.span>
      )}
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────

export function LeadResolutionFlow({
  taskId,
  subject,
  onClose,
  onOpenAddLead,
  onRefresh,
}: LeadResolutionFlowProps) {
  const [step, setStep]                   = useState<Step>("searching");
  const [matches, setMatches]             = useState<LeadMatch[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [notes, setNotes]                 = useState("");
  const [isPending, startTransition]      = useTransition();
  const notesRef                          = useRef<HTMLTextAreaElement>(null);

  // ── DB search on mount ─────────────────────────────────
  useEffect(() => {
    searchLeadsByName(subject).then((results) => {
      setMatches(results);
      if (results.length === 0)      setStep("no-match");
      else if (results.length === 1) setStep("match");
      else                           setStep("multi-match");
    });
  }, [subject]);

  // ── Auto-focus notes textarea ──────────────────────────
  useEffect(() => {
    if (step === "notes") setTimeout(() => notesRef.current?.focus(), 100);
  }, [step]);

  // ── Single-match confirm link ──────────────────────────
  function handleLinkLead() {
    if (!selectedLeadId) return;
    startTransition(async () => {
      const result = await linkTaskToLead(taskId, selectedLeadId);
      if (!result.success) {
        toast.error("Couldn't link lead. Please try again.");
        return;
      }
      onRefresh();
      setStep("linked");
    });
  }

  // ── Multi-match immediate link ─────────────────────────
  function handleDirectLink(leadId: string) {
    if (isPending) return;
    setSelectedLeadId(leadId);
    startTransition(async () => {
      const result = await linkTaskToLead(taskId, leadId);
      if (!result.success) {
        toast.error("Couldn't link lead. Please try again.");
        setSelectedLeadId(null);
        return;
      }
      onRefresh();
      setStep("linked");
    });
  }

  function handleSaveNotes() {
    startTransition(async () => {
      const result = await saveTaskContextNotes(taskId, notes);
      if (!result.success) {
        toast.error("Couldn't save notes.");
        return;
      }
      onRefresh();
      setStep("notes-saved");
      setTimeout(onClose, 1600);
    });
  }

  function handleCreateNewLead() {
    onClose();
    onOpenAddLead();
  }

  function backFromNotes() {
    if (matches.length > 1)      setStep("multi-match");
    else if (matches.length === 1) setStep("match");
    else                           setStep("no-match");
  }

  const linkedLead = matches.find((m) => m.id === selectedLeadId);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-50"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.5, ease: luxuryEasing }}
        style={{ willChange: "transform, opacity" }}
        className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
      >
        <div
          className={cn(
            "relative w-full max-w-[480px] overflow-hidden pointer-events-auto",
            "bg-[#0D0C0A] rounded-3xl",
            "border border-white/[0.07]",
            "shadow-[0_32px_80px_rgba(0,0,0,0.7),0_4px_16px_rgba(0,0,0,0.4)]"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Ambient gold glow — top-right corner */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 w-56 h-56
                       rounded-full bg-[#D4AF37]/[0.06] blur-3xl"
          />

          {/* Close button */}
          <div className="relative flex justify-end px-6 pt-6 pb-0">
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full hover:bg-white/[0.07] flex items-center justify-center text-white/25 hover:text-white/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Step content */}
          <div className="relative px-7 pb-7 pt-2 min-h-[260px] flex flex-col">
            <AnimatePresence mode="wait">

              {/* ── SEARCHING ──────────────────────────────── */}
              {step === "searching" && (
                <motion.div
                  key="searching"
                  {...STEP_ANIM}
                  className="flex flex-col items-center justify-center flex-1 gap-4 py-10"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.07] flex items-center justify-center">
                    <Search className="w-5 h-5 text-white/55" />
                  </div>
                  <div className="text-center">
                    <p
                      className="text-base font-semibold text-white/85"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Looking up &ldquo;{subject}&rdquo;
                    </p>
                    <p className="text-xs text-white/35 mt-1">
                      Searching your leads&hellip;
                    </p>
                  </div>
                  <Loader2 className="w-4 h-4 text-white/20 animate-spin" />
                </motion.div>
              )}

              {/* ── MATCH (single) ──────────────────────────── */}
              {step === "match" && (
                <motion.div key="match" {...STEP_ANIM} className="flex flex-col gap-5">
                  <div>
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1.5">
                      Lead Resolution
                    </p>
                    <h3
                      className="text-lg font-semibold text-white/85 leading-snug"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Is this the same person?
                    </h3>
                    <p className="text-xs text-white/40 mt-1">
                      Link this task to a lead, or keep it standalone.
                    </p>
                  </div>

                  {/* Single card */}
                  <div className="space-y-2">
                    {matches.map((lead) => (
                      <SingleMatchCard
                        key={lead.id}
                        lead={lead}
                        selected={selectedLeadId === lead.id}
                        onClick={() =>
                          setSelectedLeadId(
                            selectedLeadId === lead.id ? null : lead.id
                          )
                        }
                      />
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-1">
                    <motion.button
                      whileHover={selectedLeadId ? { scale: 1.01 } : {}}
                      whileTap={selectedLeadId ? { scale: 0.99 } : {}}
                      disabled={!selectedLeadId || isPending}
                      onClick={handleLinkLead}
                      className="flex items-center justify-center gap-2 w-full bg-[#D4AF37] text-[#0D0C0A] text-sm font-semibold py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                    >
                      {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5" strokeWidth={2} />
                          Yes, Link Lead
                        </>
                      )}
                    </motion.button>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleCreateNewLead} className={SECONDARY_BTN}>
                        <UserPlus className="w-3.5 h-3.5" />
                        Create New Lead
                      </button>
                      <button onClick={() => setStep("notes")} className={SECONDARY_BTN}>
                        <FileText className="w-3.5 h-3.5" />
                        Just a Task
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── MULTI-MATCH ────────────────────────────── */}
              {step === "multi-match" && (
                <motion.div
                  key="multi-match"
                  {...STEP_ANIM}
                  className="flex flex-col gap-5"
                >
                  <div>
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1.5">
                      Multiple Matches
                    </p>
                    <h3
                      className="text-lg font-semibold text-white/85 leading-snug"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      We found {matches.length} matches for &ldquo;{subject}&rdquo;
                    </h3>
                    <p className="text-xs text-white/40 mt-1">
                      Tap a contact to instantly link this task to them.
                    </p>
                  </div>

                  {/* Multi-match cards — vertically stacked, animated */}
                  <div className="space-y-2">
                    {matches.map((lead, i) => (
                      <motion.div
                        key={lead.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay:    i * 0.06,
                          duration: 0.35,
                          ease:     [0.16, 1, 0.3, 1],
                        }}
                      >
                        <MultiMatchCard
                          lead={lead}
                          isLinking={isPending && selectedLeadId === lead.id}
                          isDisabled={isPending && selectedLeadId !== lead.id}
                          onClick={() => handleDirectLink(lead.id)}
                        />
                      </motion.div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-white/[0.06]" />

                  {/* Secondary options */}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleCreateNewLead} className={SECONDARY_BTN}>
                      <UserPlus className="w-3.5 h-3.5" />
                      Create New Lead
                    </button>
                    <button onClick={() => setStep("notes")} className={SECONDARY_BTN}>
                      <FileText className="w-3.5 h-3.5" />
                      Just a Task
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── NO MATCH ───────────────────────────────── */}
              {step === "no-match" && (
                <motion.div key="no-match" {...STEP_ANIM} className="flex flex-col gap-5">
                  <div>
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1.5">
                      No Match Found
                    </p>
                    <h3
                      className="text-lg font-semibold text-white/85 leading-snug"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      &ldquo;{subject}&rdquo; isn&rsquo;t in your leads yet
                    </h3>
                    <p className="text-xs text-white/40 mt-1">
                      Add them as a new lead, or keep this as a standalone task.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleCreateNewLead}
                      className="flex items-center justify-center gap-2 w-full bg-[#D4AF37] text-[#0D0C0A] text-sm font-semibold py-3 rounded-xl transition-opacity"
                    >
                      <UserPlus className="w-3.5 h-3.5" strokeWidth={2} />
                      Create New Lead
                    </motion.button>
                    <button onClick={() => setStep("notes")} className={SECONDARY_BTN}>
                      <FileText className="w-3.5 h-3.5" />
                      No, Just a Task
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── LINKED ─────────────────────────────────── */}
              {step === "linked" && (
                <motion.div
                  key="linked"
                  {...STEP_ANIM}
                  className="flex flex-col items-center justify-center flex-1 gap-4 py-10"
                >
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, ease: luxuryEasing }}
                    className="w-16 h-16 rounded-full bg-[#D4AF37] flex items-center justify-center shadow-[0_8px_32px_rgba(212,175,55,0.35)]"
                  >
                    <Check className="w-7 h-7 text-[#0D0C0A] stroke-[2.5]" />
                  </motion.div>

                  <div className="text-center">
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-base font-semibold text-white/85"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Lead Linked
                    </motion.p>
                    {linkedLead && (
                      <motion.p
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="text-xs text-[#D4AF37]/80 mt-1.5 font-medium"
                      >
                        {linkedLead.first_name + " " + (linkedLead.last_name ?? "")} is now connected to this task.
                      </motion.p>
                    )}
                  </div>

                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    onClick={onClose}
                    className="text-xs text-white/25 hover:text-white/55 transition-colors mt-2"
                  >
                    Done
                  </motion.button>
                </motion.div>
              )}

              {/* ── NOTES ──────────────────────────────────── */}
              {step === "notes" && (
                <motion.div key="notes" {...STEP_ANIM} className="flex flex-col gap-5">
                  <div>
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1.5">
                      Context Notes
                    </p>
                    <h3
                      className="text-lg font-semibold text-white/85 leading-snug"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Add context for yourself
                    </h3>
                    <p className="text-xs text-white/40 mt-1">
                      What&apos;s the background on this task?
                    </p>
                  </div>

                  {/* Notes panel */}
                  <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
                    <textarea
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={`E.g. "Spoke with ${subject} about the Monaco charter — follow up on summer slot."`}
                      rows={4}
                      className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/20 border-none outline-none resize-none leading-relaxed"
                    />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={backFromNotes}
                      className="text-xs text-white/25 hover:text-white/55 transition-colors"
                    >
                      ← Back
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={onClose}
                        className="text-xs text-white/25 hover:text-white/55 transition-colors px-3 py-2"
                      >
                        Skip
                      </button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isPending}
                        onClick={handleSaveNotes}
                        className="flex items-center gap-1.5 bg-[#D4AF37] text-[#0D0C0A] text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40 transition-opacity"
                      >
                        {isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            Save Notes
                            <Check className="w-3 h-3" />
                          </>
                        )}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── NOTES SAVED ────────────────────────────── */}
              {step === "notes-saved" && (
                <motion.div
                  key="notes-saved"
                  {...STEP_ANIM}
                  className="flex flex-col items-center justify-center flex-1 gap-4 py-10"
                >
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.45, ease: luxuryEasing }}
                    className="w-14 h-14 rounded-full bg-white/[0.07] flex items-center justify-center"
                  >
                    <FileText className="w-6 h-6 text-white/55" />
                  </motion.div>
                  <div className="text-center">
                    <p
                      className="text-base font-semibold text-white/85"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      Notes saved
                    </p>
                    <p className="text-xs text-white/35 mt-1">
                      Context stored on your task.
                    </p>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  );
}
