"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendWhatsAppMessage } from "@/lib/actions/whatsapp";
import type { WhatsAppMessage } from "@/lib/types/database";

function isOptimisticId(id: string): boolean {
  return id.startsWith("optimistic-");
}

export function WhatsAppChatModule({
  leadId,
  initialMessages,
}: {
  leadId: string;
  initialMessages: WhatsAppMessage[];
}) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    setError(null);
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimistic: WhatsAppMessage = {
      id: optimisticId,
      lead_id: leadId,
      direction: "outbound",
      message_type: "text",
      content: trimmed,
      status: "sent",
      wa_message_id: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setText("");

    startTransition(async () => {
      const result = await sendWhatsAppMessage(leadId, trimmed);
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimisticId);
        if (result.success) {
          return [...without, result.message];
        }
        return without;
      });
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "subtle", elevation: "xs", overflow: "hidden" }),
        "flex h-[500px] flex-col",
      )}
    >
      <div className="border-b border-stone-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]">
          WhatsApp
        </p>
        <p className="text-xs text-stone-500">Cloud · outbound from this dossier</p>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        <div className="flex flex-col gap-3 pr-2">
          {messages.length === 0 && (
            <p className="text-center text-sm text-stone-400 py-8">
              No messages yet. Say hello below.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[85%] flex-col gap-1 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]",
                m.direction === "outbound"
                  ? "ml-auto bg-emerald-50 text-emerald-900"
                  : "mr-auto border border-stone-100 bg-white text-[#1A1A1A]",
                isOptimisticId(m.id) && "opacity-80",
              )}
            >
              <p className="whitespace-pre-wrap wrap-break-word">{m.content}</p>
              <span className="text-[10px] text-stone-400">
                {new Date(m.created_at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {isOptimisticId(m.id) ? " · sending…" : ""}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {error && (
        <p className="shrink-0 border-t border-red-100 bg-red-50/90 px-4 py-2 text-xs text-red-800">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-stone-100 p-4"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          className="h-10 flex-1 border-stone-200 bg-white text-sm placeholder:text-stone-400 focus-visible:ring-stone-300"
          disabled={isPending}
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          className="h-10 w-10 shrink-0 border-stone-200 text-emerald-800 hover:bg-emerald-50"
          disabled={isPending || !text.trim()}
          aria-label="Send WhatsApp message"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
