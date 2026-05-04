"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppChatModule } from "@/components/leads/dossier/WhatsAppChatModule";
import { getWhatsAppLeadHeader, getWhatsAppMessagesForLead } from "@/lib/actions/whatsapp";
import { updateLeadStatus } from "@/lib/actions/leads";
import type { LeadStatus, WhatsAppMessage } from "@/lib/types/database";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type LeadHeader = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone_number: string;
  status: LeadStatus;
};

export function ActiveChatPanel({
  selectedLeadId,
}: {
  selectedLeadId: string | null;
}) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [lead, setLead] = useState<LeadHeader | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  const leadName = useMemo(() => {
    if (!lead) return "";
    return `${lead.first_name} ${lead.last_name ?? ""}`.trim();
  }, [lead]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!selectedLeadId) {
        setLead(null);
        setMessages([]);
        return;
      }
      setIsLoading(true);
      try {
        const [msgs, header] = await Promise.all([
          getWhatsAppMessagesForLead(selectedLeadId),
          getWhatsAppLeadHeader(selectedLeadId),
        ]);
        if (cancelled) return;
        setMessages(msgs);
        setLead(header as LeadHeader | null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedLeadId]);

  if (!selectedLeadId) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
            <MessageSquare className="h-5 w-5 text-stone-400" />
          </div>
          <p className="mt-4 text-sm font-semibold text-[#1A1A1A]">
            Select a conversation
          </p>
          <p className="mt-1 text-sm text-stone-500">
            End-to-end integrated with Meta Cloud API.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white/80 p-4 backdrop-blur-md">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1A1A1A]">
            {leadName || "Lead"}
          </p>
          <p className="truncate text-xs text-stone-500">
            {lead?.phone_number ?? "—"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-stone-200 bg-white"
                disabled={isPending}
              >
                <span className="text-xs text-stone-700">
                  {lead?.status ?? "new"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["new", "attempted", "connected", "in_discussion"] as LeadStatus[]).map(
                (s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => {
                      if (!lead) return;
                      startTransition(async () => {
                        const res = await updateLeadStatus(lead.id, s);
                        if (res.success) setLead({ ...lead, status: s });
                      });
                    }}
                  >
                    {s}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            href={`/leads/${selectedLeadId}`}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-700 transition-colors hover:bg-stone-50",
            )}
            aria-label="Open dossier"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
          </div>
        ) : (
          <WhatsAppChatModule
            leadId={selectedLeadId}
            initialMessages={messages}
          />
        )}
      </div>
    </div>
  );
}

