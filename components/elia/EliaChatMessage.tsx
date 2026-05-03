"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type EliaMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

/** Alias for product spec / external references */
export type Message = EliaMessage;

function renderBoldSegments(line: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      return (
        <strong key={i} className="font-semibold text-inherit">
          {m[1]}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderFormattedAssistantText(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    const ulMatch = /^[-•]\s+(.+)$/.exec(trimmed);
    const olMatch = /^\d+\.\s+(.+)$/.exec(trimmed);

    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const L = (lines[i] ?? "").trim();
        const um = /^[-•]\s+(.+)$/.exec(L);
        const om = /^\d+\.\s+(.+)$/.exec(L);
        const hit = ordered ? om : um;
        if (!hit) break;
        items.push(hit[1]!);
        i++;
      }
      blockKey += 1;
      if (ordered) {
        blocks.push(
          <ol
            key={`ol-${blockKey}`}
            className="my-2 list-decimal space-y-1 pl-5 text-[0.9375rem] leading-relaxed"
          >
            {items.map((item, j) => (
              <li key={j}>{renderBoldSegments(item)}</li>
            ))}
          </ol>,
        );
      } else {
        blocks.push(
          <ul
            key={`ul-${blockKey}`}
            className="my-2 list-disc space-y-1 pl-5 text-[0.9375rem] leading-relaxed"
          >
            {items.map((item, j) => (
              <li key={j}>{renderBoldSegments(item)}</li>
            ))}
          </ul>,
        );
      }
      continue;
    }

    if (trimmed === "") {
      blocks.push(<div key={`br-${i}`} className="h-2" />);
      i += 1;
      continue;
    }

    blocks.push(
      <p
        key={`p-${i}`}
        className="mb-1 text-[0.9375rem] leading-relaxed last:mb-0"
      >
        {renderBoldSegments(line)}
      </p>,
    );
    i += 1;
  }

  return <div className="space-y-0.5">{blocks}</div>;
}

function EliaAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1A1814] text-sm font-semibold text-[#D4AF37] ring-2 ring-[#D4AF37]/35",
        className,
      )}
      aria-hidden
    >
      E
    </div>
  );
}

export function EliaChatMessage({
  message,
  showThinking,
}: {
  message: EliaMessage;
  /** Shown when the assistant reply is still loading (non-streaming). */
  showThinking?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-tr-sm border border-[#E5E4DF] bg-white px-4 py-3 text-[#1A1814] shadow-[0_1px_4px_0_rgb(0_0_0/0.05)]">
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[min(100%,42rem)] gap-3">
      <EliaAvatar className="mt-0.5" />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[#E5E4DF] border-l-[3px] border-l-[#D4AF37] bg-white px-4 py-3 text-[#1A1814] shadow-[0_1px_4px_0_rgb(0_0_0/0.05)]">
        {message.content ? (
          <div className="text-[#2a2824]">
            {renderFormattedAssistantText(message.content)}
          </div>
        ) : showThinking ? (
          <p
            className="animate-pulse text-[0.9375rem] italic text-[#6b6b6b]"
            aria-live="polite"
          >
            Elia is thinking...
          </p>
        ) : null}
      </div>
    </div>
  );
}
