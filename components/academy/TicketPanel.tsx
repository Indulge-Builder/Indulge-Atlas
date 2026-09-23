"use client";

/**
 * Ticket presentation — badges plus the desk record.
 *
 * Content only: no accordion, no toggle. These render inside a Sheet opened
 * from the conversation header (`ConversationActions`), so the conversation
 * itself never reflows when the ticket is inspected.
 */

import type { JSX } from "react";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/utils/time";
import {
  TICKET_PRIORITY_CLASS,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_CLASS,
  TICKET_STATUS_LABEL,
  TICKET_TAG_LABEL,
  formatMinutes,
  type AcademyTicket,
} from "@/lib/academy/ticket";
import type { AcademyRequestStatus } from "@/lib/academy/types";
import type { AcademyTicketTag, TrainingTicketUpdate } from "@/lib/types/database";

function when(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatIST(iso, "d MMM, h:mm a");
  } catch {
    return "—";
  }
}

export function StatusBadge({
  status,
  className,
}: {
  status: AcademyTicket["status"];
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1",
        TICKET_STATUS_CLASS[status],
        className,
      )}
    >
      {TICKET_STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: AcademyTicket["priority"];
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1",
        TICKET_PRIORITY_CLASS[priority],
        className,
      )}
    >
      {TICKET_PRIORITY_LABEL[priority]}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[12.5px] text-black/80">{value}</dd>
    </div>
  );
}

interface TimelineEvent {
  at: string | null;
  label: string;
  detail?: string;
}

function buildTimeline(
  ticket: AcademyTicket,
  update: TrainingTicketUpdate | null,
  requestStatus: AcademyRequestStatus,
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      at: ticket.createdAt,
      label: "Ticket created",
      detail: `Assigned to ${ticket.assignedTo}`,
    },
  ];

  if (requestStatus !== "not_started") {
    events.push({ at: null, label: "Agent picked up the conversation" });
  }
  if (requestStatus === "awaiting_ticket" || requestStatus === "completed") {
    events.push({ at: null, label: "Conversation closed and scored" });
  }
  if (update?.submitted_at) {
    events.push({
      at: update.submitted_at,
      label:
        update.attempts > 1
          ? `Ticket submitted for review (attempt ${update.attempts})`
          : "Ticket submitted for review",
    });
  }
  if (update?.passed) {
    events.push({
      at: update.submitted_at,
      label: "Ticket submitted — request handled",
      detail: update.verdict
        ? `Quality ${update.verdict.quality.toFixed(1)}/5`
        : undefined,
    });
  } else if (update?.verdict && !update.passed) {
    // Only reachable for tickets written before submission became the finish
    // line. Revision is no longer a workflow, so this reads as "still owed"
    // rather than "sent back".
    events.push({
      at: update.submitted_at,
      label: "Submitted — not yet completed",
      detail: `Quality ${update.verdict.quality.toFixed(1)}/5 · submit again to close it out`,
    });
  }

  return events;
}

/** The full desk record — rendered inside the ticket Sheet. */
export function TicketDetails({
  ticket,
  update,
  requestStatus,
}: {
  ticket: AcademyTicket;
  update: TrainingTicketUpdate | null;
  requestStatus: AcademyRequestStatus;
}): JSX.Element {
  const timeline = buildTimeline(ticket, update, requestStatus);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-semibold text-black/80">
          {ticket.ref}
        </span>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45">
          Subject
        </p>
        <p className="mt-0.5 text-[13.5px] font-medium text-black/80">
          {ticket.subject}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Client" value={ticket.clientName} />
        <Field label="Category" value={ticket.category} />
        <Field label="Assigned to" value={ticket.assignedTo} />
        <Field label="Created" value={when(ticket.createdAt)} />
        <Field label="Due" value={when(ticket.dueAt)} />
        {update && update.time_spent_minutes > 0 ? (
          <Field
            label="Time spent"
            value={formatMinutes(update.time_spent_minutes)}
          />
        ) : null}
      </dl>

      {update && update.tags.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45">
            Tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {update.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10.5px] font-medium text-black/60"
              >
                {TICKET_TAG_LABEL[t as AcademyTicketTag] ?? t}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45">
          Activity
        </p>
        <ol className="space-y-2.5">
          {timeline.map((e, i) => (
            <li key={`${e.label}-${i}`} className="flex gap-2.5">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-chat-accent-dark"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-black/80">{e.label}</p>
                <p className="text-[11px] text-black/45">
                  {[e.detail, e.at ? when(e.at) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
