"use client";

import {
  useState,
  useMemo,
  useTransition,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowRight,
  Phone,
  RefreshCw,
  MessageCircle,
  FileText,
  Users,
  Loader2,
  Sparkles,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { parseSmartInput, TASK_TYPE_LABELS } from "@/lib/parse-smart-task";
import { createSmartTask } from "@/lib/actions/smart-calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TaskType } from "@/lib/types/database";

// ── Icon map ───────────────────────────────────────────────

const TASK_ICONS: Partial<Record<TaskType, React.ElementType>> = {
  call: Phone,
  general_follow_up: RefreshCw,
  whatsapp_message: MessageCircle,
  file_dispatch: FileText,
  strategy_meeting: Users,
  budget_approval: Users,
  campaign_review: FileText,
  performance_analysis: FileText,
};

// ── Quick Action suggestions ──────────────────────────────
// Each pill pre-fills the input and moves the cursor to the end
// so the agent can immediately type the name and time.

const QUICK_ACTIONS = [
  {
    label: "Follow up with…",
    prefix: "Follow up with ",
    Icon: RefreshCw,
  },
  {
    label: "Send WhatsApp to…",
    prefix: "Send WhatsApp details to ",
    Icon: MessageCircle,
  },
  {
    label: "Call…",
    prefix: "Call ",
    Icon: Phone,
  },
] as const;

// ── Props ──────────────────────────────────────────────────

interface SmartTaskModalProps {
  date: Date;
  onClose: () => void;
  onTaskCreated: (taskId: string, subject: string | null) => void;
}

// ── Component ──────────────────────────────────────────────

export function SmartTaskModal({
  date,
  onClose,
  onTaskCreated,
}: SmartTaskModalProps) {
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Live NLP preview — updates as user types
  const parsed = useMemo(
    () => (input.trim().length > 2 ? parseSmartInput(input, date) : null),
    [input, date],
  );

  const TypeIcon = parsed ? (TASK_ICONS[parsed.type] ?? RefreshCw) : null;

  // ── Quick action pill handler ────────────────────────────
  // Pre-fills the input with the action prefix and positions the
  // cursor at the very end so the user can type right away.

  const applyQuickAction = useCallback((prefix: string) => {
    setInput(prefix);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prefix.length, prefix.length);
    });
  }, []);

  // ── Submit ───────────────────────────────────────────────

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!parsed?.title || isPending) return;

    startTransition(async () => {
      // chrono parses in local timezone; toISOString() converts to UTC for Supabase timestamptz
      const result = await createSmartTask({
        title: parsed.title,
        dueAt: parsed.dueAt.toISOString(),
        type: parsed.type,
      });

      if (!result.success || !result.taskId) {
        toast.error("Couldn't create task. Please try again.");
        return;
      }

      // Pass the clean first-name token (leadQuery) so the LeadResolutionFlow
      // searches the DB with a precise single word, not a noisy full phrase.
      onTaskCreated(result.taskId, parsed.leadQuery);
    });
  }

  // ── Time label for the preview card ─────────────────────
  const timeLabel = parsed
    ? parsed.hasExplicitTime
      ? format(parsed.dueAt, "h:mm a")
      : "10:00 AM (default)"
    : null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-[4px] z-50"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: "transform, opacity" }}
        className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
      >
        <div
          className={cn(
            "relative w-full max-w-[520px] overflow-hidden pointer-events-auto",
            "bg-[#0D0C0A] rounded-3xl",
            "border border-white/[0.07]",
            "shadow-[0_32px_80px_rgba(0,0,0,0.7),0_4px_16px_rgba(0,0,0,0.4)]",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Ambient gold glow — top-right corner */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 w-64 h-64
                       rounded-full bg-[#D4AF37]/[0.06] blur-3xl"
          />

          {/* ── Header ────────────────────────────────────── */}
          <div className="relative px-8 pt-8 pb-0">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded-md bg-white/[0.08] flex items-center justify-center">
                    <Sparkles className="w-2.5 h-2.5 text-[#D4AF37]" />
                  </div>
                  <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest">
                    Smart Entry
                  </p>
                </div>
                <h2
                  className="text-[22px] font-semibold text-white/85 leading-tight"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {format(date, "EEEE, d MMMM")}
                </h2>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-white/[0.07] flex items-center justify-center text-white/25 hover:text-white/60 transition-colors mt-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/[0.06] mt-6" />
          </div>

          {/* ── Body ──────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="relative px-8 py-6">
            {/* Primary input */}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="What needs to happen?"
              className="w-full text-[20px] text-white/90 placeholder:text-white/18 bg-transparent border-none outline-none leading-relaxed font-light tracking-[-0.01em]"
              autoComplete="off"
              spellCheck={false}
            />

            {/* ── Quick Action pills ─────────────────────── */}
            {/* Always visible — clicking pre-fills the input and
                places the cursor at the end for immediate typing.   */}
            <AnimatePresence initial={false}>
              {!input && (
                <motion.div
                  key="pills"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-4"
                >
                  <p className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.22em] mb-2.5">
                    Quick Actions
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none [&::-webkit-scrollbar]:hidden">
                    {QUICK_ACTIONS.map(({ label, prefix, Icon }) => (
                      <motion.button
                        key={prefix}
                        type="button"
                        whileHover={{ scale: 1.03, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        onClick={() => applyQuickAction(prefix)}
                        className={cn(
                          "flex items-center gap-1.5 shrink-0",
                          "px-3 py-1.5 rounded-full",
                          "bg-white/[0.06] border border-white/[0.09]",
                          "text-[11px] font-medium text-white/40",
                          "hover:bg-[#D4AF37]/[0.09] hover:border-[#D4AF37]/[0.22] hover:text-[#D4AF37]/75",
                          "transition-colors duration-150 cursor-pointer",
                        )}
                      >
                        <Icon className="w-3 h-3 shrink-0" strokeWidth={2} />
                        {label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Live preview card ─────────────────────── */}
            <AnimatePresence>
              {parsed && parsed.title && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 6, height: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-5 bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4">
                    <p className="text-[9px] font-semibold text-white/25 uppercase tracking-widest mb-3">
                      Understood as
                    </p>
                    <div className="flex items-center gap-3">
                      {TypeIcon && (
                        <div className="w-9 h-9 rounded-xl bg-white/[0.08] flex items-center justify-center shrink-0">
                          <TypeIcon className="w-4 h-4 text-white/70" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-white/85 truncate leading-snug">
                          {parsed.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {/* Task type badge */}
                          <span className="text-[10px] text-[#4A7C59] bg-[#4A7C59]/15 px-2 py-0.5 rounded-full font-medium">
                            {TASK_TYPE_LABELS[parsed.type] ?? parsed.type}
                          </span>

                          {/* Date */}
                          <span className="text-[11px] text-white/35">
                            {format(parsed.dueAt, "d MMM yyyy")}
                          </span>

                          {/* Time — gold when user specified it, muted when default */}
                          <span
                            className={cn(
                              "flex items-center gap-0.5 text-[11px] font-medium",
                              parsed.hasExplicitTime
                                ? "text-[#D4AF37]"
                                : "text-white/25",
                            )}
                          >
                            <Clock className="w-2.5 h-2.5" strokeWidth={2} />
                            {timeLabel}
                          </span>

                          {/* Subject */}
                          {parsed.subject && (
                            <>
                              <span className="text-white/20 text-[11px]">
                                ·
                              </span>
                              <span className="text-[11px] text-white/55 font-medium">
                                {parsed.subject}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Footer ────────────────────────────────── */}
            <div className="flex items-center justify-between mt-6 pt-5 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-white/25 hover:text-white/55 transition-colors"
              >
                Cancel
              </button>

              <motion.button
                type="submit"
                disabled={!parsed?.title || isPending}
                whileHover={parsed?.title && !isPending ? { scale: 1.02 } : {}}
                whileTap={parsed?.title && !isPending ? { scale: 0.98 } : {}}
                className={cn(
                  "flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl",
                  "bg-[#D4AF37] text-[#0D0C0A]",
                  "disabled:opacity-25 disabled:cursor-not-allowed",
                  "transition-opacity",
                )}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating…</span>
                  </>
                ) : (
                  <>
                    <span>Create Task</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </motion.button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
