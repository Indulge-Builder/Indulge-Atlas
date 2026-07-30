"use client";

/**
 * ReviewToggle — reveals the scored report beneath a closed conversation.
 *
 * The chat is what the intern came back to read, so the report starts folded
 * away rather than replacing it. One tap opens the full breakdown in place.
 */

import { useState, type JSX, type ReactNode } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReviewToggle({
  overall,
  children,
}: {
  overall: number;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-chat-divider bg-chat-panel">
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
        <span className="shrink-0 rounded-full bg-success-light px-2 py-0.5 text-[11px] font-semibold text-success">
          {overall.toFixed(1)}/5
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
        <div className="border-t border-chat-divider bg-surface px-4 py-5">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
