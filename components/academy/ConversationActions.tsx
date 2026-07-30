"use client";

/**
 * ConversationActions — the WhatsApp-style header controls.
 *
 * Replaces three full-width accordions that used to sit above and below the
 * transcript (ticket strip, Freshdesk form, review). They are now icons in the
 * chat header, each opening a Sheet.
 *
 * WHY A SHEET AND NOT AN INLINE PANEL
 * The accordions were siblings of the transcript in the same flex column, so
 * opening one reflowed the conversation and moved the scroll position under the
 * reader — and, when the panel outgrew its box, clipped its own submit button.
 * A Sheet renders through a portal to document.body, so the chat subtree is
 * never touched: no reflow, no scroll jump, by construction rather than by
 * careful CSS.
 */

import { useState, type JSX, type ReactNode } from "react";
import { ClipboardList, LifeBuoy, Ticket as TicketIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AcademyReport } from "@/components/academy/AcademyReport";
import { TicketDetails } from "@/components/academy/TicketPanel";
import { TicketUpdateForm } from "@/components/academy/TicketUpdateForm";
import { elapsedMinutes } from "@/lib/academy/ticket";
import type { AcademyClientThread } from "@/lib/academy/types";
import type { AcademyScenarioCard } from "@/lib/types/database";

type PanelKey = "ticket" | "freshdesk" | "review";

/**
 * One header control. The dot is `aria-hidden` and the pending state is carried
 * in the accessible label instead — a colour alone is not an announcement.
 */
function ActionIcon({
  label,
  icon,
  pending,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  pending?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={pending ? `${label} — action required` : label}
          className={cn(
            "relative rounded-full p-2 text-chat-header-ink/75 transition-colors",
            "hover:bg-chat-header-ink/10 hover:text-chat-header-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-header-ink/40",
          )}
        >
          {icon}
          {pending ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 size-2 rounded-full bg-warning ring-2 ring-chat-header"
            />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {pending ? " · action required" : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function displayFor(thread: AcademyClientThread): AcademyScenarioCard {
  return {
    id: thread.seedId,
    title: thread.requestTitle,
    archetype: thread.name,
    vertical: thread.vertical as AcademyScenarioCard["vertical"],
    difficulty: thread.difficulty as AcademyScenarioCard["difficulty"],
  };
}

export function ConversationActions({
  thread,
  onCompleted,
}: {
  thread: AcademyClientThread;
  onCompleted?: () => void;
}): JSX.Element {
  const [panel, setPanel] = useState<PanelKey | null>(null);

  const ticketOutstanding = thread.status === "awaiting_ticket";
  // The write-up only exists once the conversation is closed and scored.
  const canWriteTicket =
    !!thread.sessionId &&
    (thread.status === "awaiting_ticket" || thread.status === "completed");

  const first = thread.turns[0]?.created_at ?? null;
  const last = thread.turns[thread.turns.length - 1]?.created_at ?? null;

  const close = () => setPanel(null);

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <div className="flex shrink-0 items-center gap-0.5">
          <ActionIcon
            label={`Open ticket ${thread.ticket.ticket.ref}`}
            icon={<TicketIcon className="size-[18px]" aria-hidden />}
            onClick={() => setPanel("ticket")}
          />

          {canWriteTicket ? (
            <ActionIcon
              label="Open Freshdesk ticket"
              icon={<LifeBuoy className="size-[18px]" aria-hidden />}
              pending={ticketOutstanding}
              onClick={() => setPanel("freshdesk")}
            />
          ) : null}

          {thread.review ? (
            <ActionIcon
              label="See review"
              icon={<ClipboardList className="size-[18px]" aria-hidden />}
              onClick={() => setPanel("review")}
            />
          ) : null}
        </div>
      </TooltipProvider>

      {/* ── Ticket record ──────────────────────────────────────────────────── */}
      {/* No aria-describedby={undefined} on any of these: that prop is the
          escape hatch for a dialog with NO description, and Radix spreads
          caller props AFTER its own, so passing it strips the association to
          the SheetDescription each of these actually renders. */}
      <Sheet open={panel === "ticket"} onOpenChange={(o) => !o && close()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Support ticket</SheetTitle>
            <SheetDescription>
              How this request reached the desk, and everything logged against it
              since.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <TicketDetails
              ticket={thread.ticket.ticket}
              update={thread.ticket.update}
              requestStatus={thread.status}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* ── Freshdesk write-up ─────────────────────────────────────────────── */}
      <Sheet open={panel === "freshdesk"} onOpenChange={(o) => !o && close()}>
        <SheetContent
          className="sm:max-w-xl"
          /*
           * Radix unmounts Sheet content on close, taking TicketUpdateForm's
           * local state with it. A stray backdrop click would therefore delete
           * a half-written ticket with no warning, so outside-interaction
           * dismissal is disabled here. Escape and the X still close it —
           * those are deliberate acts, not slips.
           */
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Freshdesk ticket</SheetTitle>
            <SheetDescription>
              {thread.status === "completed"
                ? "The write-up that closed this request."
                : "The client is handled — the request is not complete until the desk record is."}
            </SheetDescription>
          </SheetHeader>
          {/* SheetBody already scrolls; the form supplies its own padding. */}
          <SheetBody className="px-0 py-0">
            {thread.sessionId ? (
              <TicketUpdateForm
                sessionId={thread.sessionId}
                existing={thread.ticket.update}
                defaultPriority={thread.ticket.ticket.priority}
                suggestedMinutes={elapsedMinutes(first, last)}
                onSubmitted={(passed) => {
                  // Refetch either way — a rejection is persisted too, and the
                  // verdict must survive closing and reopening the sheet.
                  if (passed) close();
                  onCompleted?.();
                }}
              />
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* ── Scored review ──────────────────────────────────────────────────── */}
      <Sheet open={panel === "review"} onOpenChange={(o) => !o && close()}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Your review</SheetTitle>
            <SheetDescription>
              How this conversation scored against the rubric.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {thread.review ? (
              <AcademyReport
                review={thread.review}
                display={displayFor(thread)}
                transcript={thread.turns}
              />
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
