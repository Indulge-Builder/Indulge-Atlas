"use client";

/**
 * ClientConversation — the right panel.
 *
 * Everything about one client, in one scroll: who they are, the mentor's short
 * framing, their request, the conversation itself, and the outcome once it is
 * scored. No cards to open, no navigation.
 *
 * Before the intern replies there is no session, so the member's opening line is
 * shown as a preview bubble. `AcademyChat` creates the session on the first
 * message and swaps in the real transcript.
 */

import { useState, type JSX } from "react";
import { ArrowLeft, ClipboardList, ChevronDown, GraduationCap, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { AcademyChat } from "@/components/academy/AcademyChat";
import { AcademyReport } from "@/components/academy/AcademyReport";
import { ProgressBar } from "@/components/academy/ProgressRing";
import { ACADEMY_TURN_CAP } from "@/lib/academy/models";
import { TIER_CLASS, TIER_LABEL, type AcademyTier } from "@/lib/academy/curriculum";
import type { AcademyClientThread } from "@/lib/academy/types";
import type { AcademyScenarioCard } from "@/lib/types/database";

const nf = new Intl.NumberFormat("en-IN");

/** Mentor framing + request detail, shown above the conversation. */
function Briefing({ thread }: { thread: AcademyClientThread }): JSX.Element {
  const [open, setOpen] = useState(false);
  const tier = thread.difficulty as AcademyTier;

  return (
    <div className="shrink-0 border-b border-chat-divider bg-chat-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-chat-panel-hover sm:px-4"
      >
        {thread.status === "completed" && thread.review ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-light px-2 py-0.5 text-[11px] font-semibold text-success">
            <Trophy className="size-3" aria-hidden />
            {thread.review.overall.toFixed(1)}/5
          </span>
        ) : (
          <GraduationCap className="size-4 shrink-0 text-chat-accent-dark" aria-hidden />
        )}

        <p className="min-w-0 flex-1 truncate text-[12.5px] text-chat-ink">
          {thread.mentorIntro}
        </p>

        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-chat-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-chat-divider px-3 pb-3 pt-2.5 sm:px-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-chat-ink-muted">
              The request
            </p>
            <p className="mt-1 text-[13px] font-medium text-chat-ink">{thread.requestTitle}</p>
            {thread.brief ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-chat-ink-muted">
                {thread.brief}
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium text-chat-ink">Academy progress</span>
              <span className="text-[11px] tabular-nums text-chat-ink-muted">
                {nf.format(thread.overview.completed)}/{nf.format(thread.overview.total)} clients ·{" "}
                {thread.overview.percent}%
              </span>
            </div>
            <ProgressBar percent={thread.overview.percent} tone="gold" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The scored review, folded away beneath a finished conversation. */
function ReviewPanel({ thread }: { thread: AcademyClientThread }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!thread.review) return null;

  return (
    <div className="shrink-0 border-t border-chat-divider bg-chat-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-chat-panel-hover"
      >
        <ClipboardList className="size-4 shrink-0 text-chat-accent-dark" aria-hidden />
        <span className="flex-1 text-[13px] font-medium text-chat-ink">
          {open ? "Hide your review" : "See your review"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-chat-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="max-h-[55vh] overflow-y-auto border-t border-chat-divider bg-surface px-4 py-5">
          <AcademyReport
            review={thread.review}
            display={displayFor(thread)}
            transcript={thread.turns}
          />
        </div>
      ) : null}
    </div>
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

export function ClientConversation({
  thread,
  onBack,
  onSessionStarted,
  onClosed,
  className,
}: {
  thread: AcademyClientThread;
  onBack?: () => void;
  onSessionStarted?: (sessionId: string) => void;
  onClosed?: () => void;
  className?: string;
}): JSX.Element {
  const tier = thread.difficulty as AcademyTier;
  const internTurns = thread.turns.filter((t) => t.role === "intern").length;

  // Not started yet — show the member's opening line as a preview so the request
  // reads as a message rather than a form. AcademyChat persists it on first reply.
  const previewTurns =
    thread.turns.length > 0
      ? thread.turns
      : [
          {
            id: `preview-${thread.seedId}`,
            session_id: "",
            role: "client" as const,
            body: thread.openingMessage,
            seq: 1,
            created_at: new Date().toISOString(),
            attachments: [],
          },
        ];

  return (
    <section className={cn("flex h-full min-h-0 flex-col bg-chat-canvas", className)}>
      {/* Client header */}
      <header className="z-10 flex shrink-0 items-center gap-3 bg-chat-header px-3 py-2.5 text-chat-header-ink sm:px-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to clients"
            className="-ml-1 rounded-full p-1 transition-colors hover:bg-chat-header-ink/10 md:hidden"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
        ) : null}

        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-chat-header-ink/15 text-[12px] font-semibold">
          {thread.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold leading-tight">{thread.name}</h2>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] ring-1",
                TIER_CLASS[tier] ?? TIER_CLASS.medium,
              )}
            >
              {TIER_LABEL[tier] ?? thread.difficulty}
            </span>
          </div>
          <p className="truncate text-[11.5px] text-chat-header-ink/75">
            {thread.status === "completed"
              ? "Completed"
              : thread.status === "in_progress"
                ? "In progress"
                : thread.vertical}
            {" · "}
            {thread.requestTitle}
          </p>
        </div>

        {/* Turn budget lives here now that the chat's own header is gone. */}
        {thread.status !== "completed" ? (
          <span className="shrink-0 text-right text-[11px] tabular-nums text-chat-header-ink/75">
            {internTurns}/{ACADEMY_TURN_CAP}
            <span className="ml-1 hidden sm:inline">turns</span>
          </span>
        ) : null}
      </header>

      <Briefing thread={thread} />

      {/* The conversation — the only scrolling region on the screen. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <AcademyChat
          sessionId={thread.sessionId}
          seedId={thread.seedId}
          display={displayFor(thread)}
          initialTurns={previewTurns}
          turnCap={ACADEMY_TURN_CAP}
          readOnly={thread.status === "completed" || thread.readOnly}
          onSessionStarted={onSessionStarted}
          onClosed={onClosed}
          chrome={false}
          constraintHint={thread.constraintCount}
        />
      </div>

      <ReviewPanel thread={thread} />
    </section>
  );
}
