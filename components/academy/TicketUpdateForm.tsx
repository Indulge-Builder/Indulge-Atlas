"use client";

/**
 * TicketUpdateForm — the Freshdesk Update panel.
 *
 * This is the second half of the request, and the half that actually completes
 * it. The conversation is scored on its own, but no progress is awarded until
 * the write-up here is accepted by the reviewer (see
 * `lib/academy/ticketReview.ts` and migration 131).
 *
 * Three states:
 *   editing  — the intern fills the ticket; structural errors surface inline
 *   returned — the reviewer sent it back with concrete fixes; fields stay open
 *   accepted — locked, with the quality score and per-dimension breakdown
 *
 * The failure state is deliberately not styled as an error. Being sent back is
 * the normal path on a first attempt, and it is where the learning is.
 */

import { useMemo, useState, useTransition, type JSX } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { submitTicketUpdate } from "@/lib/actions/academy";
import {
  MIN_INTERNAL_NOTES,
  MIN_RESOLUTION_SUMMARY,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TAG_LABEL,
  isTerminalStatus,
  validateTicketUpdate,
  type TicketUpdateInput,
} from "@/lib/academy/ticket";
import { TICKET_REVIEW_DIMENSIONS } from "@/lib/academy/ticketReview";
import {
  ACADEMY_TICKET_PRIORITIES,
  ACADEMY_TICKET_STATUSES,
  ACADEMY_TICKET_TAGS,
} from "@/lib/types/database";
import type {
  AcademyTicketPriority,
  AcademyTicketStatus,
  AcademyTicketTag,
  AcademyTicketVerdict,
  TrainingTicketUpdate,
} from "@/lib/types/database";

// ── Field primitives ─────────────────────────────────────────────────────────

/**
 * Label + hint above a control.
 *
 * `htmlFor` is required, not optional: without it the <label> is an orphan and
 * the control falls back to its placeholder for an accessible name — or, for
 * <select> and <input type=number>, has no name at all. Radix autofocuses the
 * first tabbable when the Sheet opens, so an unnamed first field is the very
 * first thing a screen-reader user lands on.
 *
 * The hint (character counter) is wired through aria-describedby so it is
 * announced as help text rather than being invisible to assistive tech.
 */
function FieldShell({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-chat-ink"
        >
          {label}
        </label>
        {hint ? (
          <span id={`${id}-hint`} className="shrink-0 text-[11px] text-chat-ink-muted">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const textareaClass =
  "w-full resize-y rounded-lg border border-chat-divider bg-surface px-3 py-2 text-[13px] leading-relaxed text-chat-ink outline-none transition-colors placeholder:text-chat-ink-muted focus:border-chat-accent-dark disabled:opacity-60";

const selectClass =
  "w-full rounded-lg border border-chat-divider bg-surface px-3 py-2 text-[13px] text-chat-ink outline-none transition-colors focus:border-chat-accent-dark disabled:opacity-60";

// ── Verdict display ──────────────────────────────────────────────────────────

function VerdictScores({ verdict }: { verdict: AcademyTicketVerdict }): JSX.Element {
  return (
    <dl className="space-y-2">
      {TICKET_REVIEW_DIMENSIONS.map((d) => {
        const entry = verdict.scores[d.key];
        if (!entry) return null;
        return (
          <div key={d.key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] font-medium text-chat-ink">{d.label}</dt>
              <dd className="shrink-0 text-[12px] font-semibold tabular-nums text-chat-ink">
                {entry.score}/5
              </dd>
            </div>
            {entry.justification ? (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-chat-ink-muted">
                {entry.justification}
              </p>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function TicketUpdateForm({
  sessionId,
  existing,
  defaultPriority,
  suggestedMinutes,
  onSubmitted,
}: {
  sessionId: string;
  existing: TrainingTicketUpdate | null;
  defaultPriority: AcademyTicketPriority;
  /** Measured session duration, pre-filled so the field starts honest. */
  suggestedMinutes: number | null;
  /**
   * Fires after ANY reviewed submission, passing the outcome — not just an
   * accepted one. A rejection is persisted server-side too (the row carries the
   * verdict and the bumped attempt count), so the parent has to refetch either
   * way or reopening the form would show a blank draft and a lost verdict.
   */
  onSubmitted?: (passed: boolean) => void;
}): JSX.Element {
  const accepted = existing?.passed === true;

  const [form, setForm] = useState<TicketUpdateInput>({
    resolution_summary: existing?.resolution_summary ?? "",
    internal_notes: existing?.internal_notes ?? "",
    public_reply: existing?.public_reply ?? "",
    status: existing?.status ?? "resolved",
    priority: existing?.priority ?? defaultPriority,
    tags: existing?.tags ?? [],
    time_spent_minutes: existing?.time_spent_minutes || (suggestedMinutes ?? 15),
  });

  const [verdict, setVerdict] = useState<AcademyTicketVerdict | null>(
    existing?.verdict ?? null,
  );
  const [showErrors, setShowErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  const errors = useMemo(() => validateTicketUpdate(form), [form]);
  const statusOk = isTerminalStatus(form.status);

  function set<K extends keyof TicketUpdateInput>(
    key: K,
    value: TicketUpdateInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTag(tag: AcademyTicketTag) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter((t) => t !== tag)
        : [...f.tags, tag],
    }));
  }

  function handleSubmit() {
    if (errors.length > 0 || !statusOk) {
      setShowErrors(true);
      return;
    }
    startTransition(async () => {
      const res = await submitTicketUpdate(sessionId, form);
      if (!res.success) {
        toast.error("Could not submit the ticket", { description: res.error });
        return;
      }
      const v = res.data!.verdict;
      setVerdict(v);
      // One submission per ticket, so this always hands the request in. The
      // reviewer's quality call still lands — it just reads as feedback on
      // completed work rather than a door to walk back through.
      if (v.meets_bar ?? v.passed) {
        toast.success("Ticket submitted — request handled.");
      } else {
        toast.success("Ticket submitted — request handled.", {
          description: `Documentation scored ${v.quality.toFixed(1)}/5 — see the reviewer's notes.`,
        });
      }
      onSubmitted?.(v.passed);
    });
  }

  // ── Accepted: locked record ────────────────────────────────────────────────
  if (accepted && verdict) {
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-chat-ink">
              Ticket submitted — request handled
            </p>
            <p className="text-[12px] text-chat-ink-muted">
              Documentation quality {verdict.quality.toFixed(1)}/5
              {existing.attempts > 1
                ? ` · ${existing.attempts} submissions`
                : " · one submission"}
            </p>
          </div>
        </div>

        {/* Coaching, not a gate. The request is in; these are the things to do
            differently next time, and they are the reason the score is what it
            is — so they stay visible rather than hidden behind a disclosure. */}
        {verdict.meets_bar === false && verdict.feedback.length > 0 ? (
          <div className="rounded-lg border border-warning/25 bg-warning-light px-3.5 py-3">
            <p className="text-[12.5px] font-semibold text-warning">
              What to tighten next time
            </p>
            <ul className="mt-2 space-y-1.5">
              {verdict.feedback.map((f, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[12.5px] leading-relaxed text-chat-ink"
                >
                  <span
                    className="mt-1.5 size-1 shrink-0 rounded-full bg-warning"
                    aria-hidden
                  />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-lg border border-chat-divider bg-surface p-3.5">
          <VerdictScores verdict={verdict} />
        </div>

        <details className="group">
          <summary className="cursor-pointer text-[12px] font-medium text-chat-accent-dark">
            View what you submitted
          </summary>
          <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-chat-ink">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-chat-ink-muted">
                Resolution summary
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{existing.resolution_summary}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-chat-ink-muted">
                Internal notes
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{existing.internal_notes}</p>
            </div>
            {/* Older tickets, filed before the field was removed, still carry
                one — show it rather than hide history. New ones have none. */}
            {existing.public_reply?.trim() ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-chat-ink-muted">
                  Public reply
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{existing.public_reply}</p>
              </div>
            ) : null}
          </div>
        </details>
      </div>
    );
  }

  // ── Editing / returned ─────────────────────────────────────────────────────
  const returned = verdict !== null && !verdict.passed;

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="flex items-start gap-2.5">
        <ClipboardCheck
          className="mt-0.5 size-4 shrink-0 text-chat-accent-dark"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-chat-ink">
            Update the Freshdesk ticket
          </p>
          <p className="text-[12px] leading-relaxed text-chat-ink-muted">
            The client is handled, but the request is not complete until the desk
            record is. A reviewer checks this before the ticket can close.
          </p>
        </div>
      </div>

      {/* Reviewer feedback — the point of the loop, so it leads. */}
      {returned && verdict ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-warning/25 bg-warning-light px-3.5 py-3"
        >
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-[12.5px] font-semibold text-warning">
              Not yet completed — quality {verdict.quality.toFixed(1)}/5
            </p>
          </div>
          <ul className="mt-2 space-y-1.5">
            {verdict.feedback.map((f, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-chat-ink">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-warning" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <details className="mt-2.5">
            <summary className="cursor-pointer text-[11.5px] font-medium text-warning">
              See the score breakdown
            </summary>
            <div className="mt-2.5">
              <VerdictScores verdict={verdict} />
            </div>
          </details>
        </motion.div>
      ) : null}

      <FieldShell
        id="ticket-resolution-summary"
        label="Resolution summary"
        hint={`${form.resolution_summary.trim().length}/${MIN_RESOLUTION_SUMMARY}`}
      >
        <textarea
          id="ticket-resolution-summary"
          aria-describedby="ticket-resolution-summary-hint"
          rows={4}
          value={form.resolution_summary}
          onChange={(e) => set("resolution_summary", e.target.value)}
          disabled={pending}
          placeholder={
            "What you actually did, in order. e.g.\n• Compared pricing across three vendors\n• Confirmed the warranty runs 24 months\n• Verified delivery lands before the 14th"
          }
          className={textareaClass}
        />
      </FieldShell>

      <FieldShell
        id="ticket-internal-notes"
        label="Internal notes"
        hint={`${form.internal_notes.trim().length}/${MIN_INTERNAL_NOTES} · not shown to the client`}
      >
        <textarea
          id="ticket-internal-notes"
          aria-describedby="ticket-internal-notes-hint"
          rows={3}
          value={form.internal_notes}
          onChange={(e) => set("internal_notes", e.target.value)}
          disabled={pending}
          placeholder="Context for whoever picks this up next. e.g. Member prefers the local retailer; awaiting payment confirmation; follow up in 24h."
          className={textareaClass}
        />
      </FieldShell>

      {/* The public reply was removed: the member already received the answer in
          the conversation, which the evaluator grades. Writing it a second time
          for the ticket was duplicate work, and the column stays in the schema
          (NOT NULL DEFAULT '') so nothing downstream needed changing. */}

      <div className="grid gap-4 sm:grid-cols-3">
        <FieldShell id="ticket-status" label="Status">
          <select
            id="ticket-status"
            value={form.status}
            onChange={(e) => set("status", e.target.value as AcademyTicketStatus)}
            disabled={pending}
            className={selectClass}
          >
            {ACADEMY_TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell id="ticket-priority" label="Priority">
          <select
            id="ticket-priority"
            value={form.priority}
            onChange={(e) =>
              set("priority", e.target.value as AcademyTicketPriority)
            }
            disabled={pending}
            className={selectClass}
          >
            {ACADEMY_TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TICKET_PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </FieldShell>

        {/* Measured, not declared. This is the elapsed time of the conversation
            and the trainee cannot edit it — time efficiency is 10% of their
            score, and a self-reported figure is a number they can set for
            themselves. Rendered read-only rather than hidden, because knowing
            how long a request actually took is useful to them. */}
        <FieldShell id="ticket-time-spent" label="Time spent" hint="measured">
          <output
            id="ticket-time-spent"
            aria-describedby="ticket-time-spent-hint"
            className={cn(
              selectClass,
              "flex items-center bg-chat-panel-active text-chat-ink-muted",
            )}
          >
            {form.time_spent_minutes} min
          </output>
        </FieldShell>
      </div>

      {/* Toggle buttons cannot be named by a <label>, so this is a labelled
          group rather than a FieldShell. */}
      <div role="group" aria-labelledby="ticket-tags-label">
        <p
          id="ticket-tags-label"
          className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-chat-ink"
        >
          Tags
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ACADEMY_TICKET_TAGS.map((tag) => {
            const on = form.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                disabled={pending}
                aria-pressed={on}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-60",
                  on
                    ? "bg-chat-accent-dark text-chat-header-ink"
                    : "bg-chat-panel-active text-chat-ink-muted hover:bg-chat-divider",
                )}
              >
                {TICKET_TAG_LABEL[tag]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Structural problems, only after a submit attempt — nagging while the
          intern is still typing the first sentence helps nobody.
          role="alert" so the list is announced when it appears; without it a
          screen-reader user presses Submit and gets silence. */}
      {showErrors && (errors.length > 0 || !statusOk) ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger-light px-3.5 py-3"
        >
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />
            <p className="text-[12.5px] font-semibold text-danger">
              Not ready to submit
            </p>
          </div>
          <ul className="mt-1.5 space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-[12px] text-danger/90">
                {e}
              </li>
            ))}
            {!statusOk ? (
              <li className="text-[12px] text-danger/90">
                Set the status to Resolved or Closed to close this request out.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-chat-accent-dark px-4 py-2.5 text-[13px] font-semibold text-chat-header-ink transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Reviewing your ticket…
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden />
            {returned ? "Resubmit ticket" : "Submit ticket update"}
          </>
        )}
      </button>
    </div>
  );
}
