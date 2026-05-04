"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { getTicketAISummary } from "@/lib/actions/freshdesk";
import type { FreshdeskTicket } from "@/lib/freshdesk/types";
import { cn } from "@/lib/utils";

function renderSummaryText(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = paragraph.join(" ").trim();
    if (p) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-sm leading-relaxed text-stone-700">
          {p}
        </p>,
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems?.length) return;
    blocks.push(
      <ul
        key={`ul-${blocks.length}`}
        className="list-disc space-y-1 pl-5 text-sm text-stone-700"
      >
        {listItems.map((item, i) => (
          <li key={i}>{item.trim()}</li>
        ))}
      </ul>,
    );
    listItems = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    const numbered = /^(\d+)\.\s+(.+)$/.exec(line);
    if (numbered) {
      flushList();
      flushParagraph();
      blocks.push(
        <h3
          key={`h-${blocks.length}`}
          className="mt-4 border-b border-[#D4AF37]/50 pb-1 font-[family-name:var(--font-playfair)] text-xs font-semibold uppercase tracking-[0.18em] text-stone-800 first:mt-0"
        >
          {numbered[2].trim()}
        </h3>,
      );
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(line.slice(2));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushList();
  flushParagraph();

  return <div className="space-y-2">{blocks}</div>;
}

interface TicketSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  tickets: FreshdeskTicket[];
}

export function TicketSummaryModal({
  open,
  onOpenChange,
  clientId,
  clientName,
  tickets,
}: TicketSummaryModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const n = Math.min(tickets.length, 10);
  const ticketsKey = useMemo(
    () => tickets.map((t) => t.id).join(","),
    [tickets],
  );

  async function runSummary(payload: FreshdeskTicket[]) {
    setIsLoading(true);
    setError(null);
    setSummary(null);
    const res = await getTicketAISummary(clientId, clientName, payload);
    setIsLoading(false);
    if (res.success && res.data) {
      setSummary(res.data);
    } else {
      setError(res.error ?? "Something went wrong");
    }
  }

  useEffect(() => {
    if (!open) return;
    void runSummary(tickets);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ticketsKey captures ticket set; avoids unstable array ref loops
  }, [open, clientId, clientName, ticketsKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[85vh] max-w-2xl overflow-y-auto z-[100]",
          "border border-[#E5E4DF] bg-[#F9F9F6]",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-[family-name:var(--font-playfair)] text-xl text-stone-900">
            <Sparkles className="h-5 w-5 text-[#D4AF37]" aria-hidden />
            Service Intelligence
          </DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D4AF37] text-sm font-semibold text-[#1A1814] shadow-sm"
              aria-hidden
            >
              E
            </div>
            <p className="text-xs text-stone-500">Powered by Elia</p>
          </div>
        </DialogHeader>

        <div className="min-h-[160px] py-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D4AF37] text-lg font-semibold text-[#1A1814] animate-pulse"
                aria-hidden
              >
                E
              </div>
              <p className="text-sm text-stone-600">
                Elia is analysing {n} ticket{n === 1 ? "" : "s"}…
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-4 text-center">
              <p className="text-sm text-stone-800">
                Elia couldn&apos;t analyse these tickets right now.
              </p>
              <p className="mt-1 text-xs text-stone-600">{error}</p>
              <IndulgeButton
                type="button"
                variant="gold"
                className="mt-4"
                onClick={() => void runSummary(tickets)}
              >
                Retry
              </IndulgeButton>
            </div>
          ) : summary ? (
            renderSummaryText(summary)
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <IndulgeButton
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </IndulgeButton>
          <IndulgeButton
            type="button"
            variant="outline"
            loading={isLoading}
            disabled={isLoading || !tickets.length}
            onClick={() => void runSummary(tickets)}
          >
            Refresh
          </IndulgeButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
