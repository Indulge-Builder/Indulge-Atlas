"use client";

import * as React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export type EliaMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

/** Alias for product spec / external references */
export type Message = EliaMessage;

/** First names used for light highlighting + session stats (approximate). */
export const ELIA_KNOWN_FIRST_NAMES: readonly string[] = [
  "Aarav",
  "Aditya",
  "Ananya",
  "Ananyshree",
  "Arjun",
  "Diya",
  "Ishaan",
  "Kabir",
  "Kiara",
  "Neha",
  "Priya",
  "Rahul",
  "Rohan",
  "Saanvi",
  "Samaira",
  "Vikram",
  "James",
  "Sarah",
  "Michael",
  "Emma",
  "David",
  "Sophia",
  "Alex",
  "Olivia",
  "Ryan",
  "Nina",
  "Marcus",
  "Elena",
  "Victoria",
  "William",
  "Charlotte",
  "Daniel",
  "Amelia",
  "Raj",
  "Meera",
  "Sanjay",
  "Kavita",
  "Ravi",
  "Sunita",
  "Vivek",
  "Anjali",
  "Pooja",
  "Siddharth",
  "Tara",
  "Zara",
  "Noah",
  "Ethan",
  "Maya",
  "Leo",
  "Grace",
] as const;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderBoldSegments(line: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      return (
        <strong key={i} className="font-semibold text-[#1A1814]">
          {m[1]}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function highlightMemberNamesInLine(line: string): React.ReactNode {
  const sorted = [...ELIA_KNOWN_FIRST_NAMES].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) {
    return <>{renderBoldSegments(line)}</>;
  }
  const pattern = new RegExp(
    `\\b(${sorted.map(escapeRegExp).join("|")})\\b`,
    "gi",
  );
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags);
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      parts.push(
        <React.Fragment key={`t-${key++}`}>
          {renderBoldSegments(line.slice(last, m.index))}
        </React.Fragment>,
      );
    }
    parts.push(
      <span key={`n-${key++}`} className="font-medium text-[#1A1814]">
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) {
    parts.push(
      <React.Fragment key={`t-${key++}`}>
        {renderBoldSegments(line.slice(last))}
      </React.Fragment>,
    );
  }
  return parts.length > 0 ? <>{parts}</> : <>{renderBoldSegments(line)}</>;
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
          <ol key={`ol-${blockKey}`} className="my-2 list-none space-y-1 pl-0">
            {items.map((item, j) => {
              const num = j + 1;
              return (
                <li
                  key={j}
                  className="flex gap-2 font-sans text-sm leading-[1.7] text-[#1A1814]"
                >
                  <span className="shrink-0 font-mono tabular-nums text-brand-gold">
                    {num}.
                  </span>
                  <span className="min-w-0 font-sans">
                    {highlightMemberNamesInLine(item)}
                  </span>
                </li>
              );
            })}
          </ol>,
        );
      } else {
        blocks.push(
          <ul key={`ul-${blockKey}`} className="my-2 list-none space-y-1 pl-0">
            {items.map((item, j) => (
              <li
                key={j}
                className="flex gap-2 font-sans text-sm leading-[1.7] text-[#1A1814]"
              >
                <span className="shrink-0 text-brand-gold" aria-hidden>
                  ·
                </span>
                <span className="min-w-0">{highlightMemberNamesInLine(item)}</span>
              </li>
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
        className="mb-1 font-sans text-sm leading-[1.7] text-[#1A1814] last:mb-0"
      >
        {highlightMemberNamesInLine(line)}
      </p>,
    );
    i += 1;
  }

  return <div className="space-y-0.5">{blocks}</div>;
}

function ThinkingRow() {
  return (
    <div className="flex min-w-0 items-center py-0.5" aria-live="polite">
      <div className="flex items-center gap-1 py-0.5" aria-hidden>
        <span className="elia-dot-pulse h-[5px] w-[5px] rounded-full bg-brand-gold" />
        <span
          className="elia-dot-pulse h-[5px] w-[5px] rounded-full bg-brand-gold"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="elia-dot-pulse h-[5px] w-[5px] rounded-full bg-brand-gold"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="ml-2 font-sans text-xs font-normal text-[#6b6b6b]">
        Elia is thinking
      </span>
    </div>
  );
}

export function EliaChatMessage({
  message,
  showThinking,
  isFirstInAssistantSequence,
}: {
  message: EliaMessage;
  /** Shown when the assistant reply is still loading (non-streaming). */
  showThinking?: boolean;
  isFirstInAssistantSequence: boolean;
}) {
  const ts = format(message.timestamp, "h:mm a");

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[65%]">
          <div
            className={cn(
              "rounded-[16px] rounded-br-[4px] border border-[#E5E4DF] bg-white px-4 py-3",
              "shadow-[0_1px_4px_0_rgb(0_0_0/0.05)]",
            )}
          >
            <p className="whitespace-pre-wrap font-sans text-sm font-normal leading-relaxed text-[#1A1814]">
              {message.content}
            </p>
          </div>
          <p className="mt-1 text-right font-mono text-[10px] font-normal text-[#6b6b6b]">
            {ts}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[75%] flex-col items-start">
      {isFirstInAssistantSequence ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 font-sans text-[11px]">
          <span className="font-serif text-[11px] font-semibold text-brand-gold">
            E
          </span>
          <span className="font-medium text-brand-gold-dark">Elia</span>
          <span className="font-mono text-[10px] text-[#6b6b6b]">{ts}</span>
        </div>
      ) : null}
      <div className="w-full border-l-2 border-brand-gold py-3 pl-4 pr-4 font-sans">
        {message.content ? (
          <div>{renderFormattedAssistantText(message.content)}</div>
        ) : showThinking ? (
          <ThinkingRow />
        ) : null}
      </div>
    </div>
  );
}

export function countDistinctMemberMentionsInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const name of ELIA_KNOWN_FIRST_NAMES) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
    if (re.test(text)) {
      found.add(name);
    }
  }
  return found;
}
