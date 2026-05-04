"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import type {
  ClientDetail,
  ClientLifestyleJson,
  ClientTravelJson,
} from "@/lib/actions/clients";
import { cn } from "@/lib/utils";

export interface ClientEliaChatProps {
  clientId: string;
  detail: ClientDetail;
  isActive: boolean;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const MAX_VISIBLE_MESSAGES = 12;

function hasLifestyleData(l: ClientLifestyleJson | null): boolean {
  if (!l || typeof l !== "object") return false;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0;
  const arr = (v: unknown) =>
    Array.isArray(v) && v.some((x) => String(x).trim().length > 0);
  return (
    str(l.dietary_preference) ||
    str(l.favourite_food) ||
    str(l.favourite_drink) ||
    arr(l.favourite_cuisine) ||
    arr(l.go_to_restaurant) ||
    arr(l.favourite_brands)
  );
}

function hasTravelData(t: ClientTravelJson | null): boolean {
  if (!t || typeof t !== "object") return false;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0;
  const arr = (v: unknown) =>
    Array.isArray(v) && v.some((x) => String(x).trim().length > 0);
  return (
    str(t.seat_preference) ||
    str(t.go_to_country) ||
    str(t.needs_assistance_with) ||
    arr(t.stay_preferences)
  );
}

function buildSuggestions(detail: ClientDetail): string[] {
  const first = detail.first_name?.trim() || "them";
  const out: string[] = [];
  if (hasLifestyleData(detail.lifestyle)) {
    out.push(`What dining experiences would ${first} love?`);
  }
  if (hasTravelData(detail.travel)) {
    out.push(`Plan a trip for ${first} based on their preferences`);
  }
  out.push(`Summarize ${first}'s service history`);
  out.push(`What's the best way to re-engage ${first}?`);
  return out;
}

export function ClientEliaChat({
  clientId,
  detail,
  isActive,
}: ClientEliaChatProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const firstName = detail.first_name?.trim() || "this member";
  const suggestions = React.useMemo(() => buildSuggestions(detail), [detail]);

  React.useEffect(() => {
    if (!isActive) {
      setMessages([]);
      setInputValue("");
      setIsLoading(false);
    }
  }, [isActive]);

  React.useEffect(() => {
    setMessages([]);
    setInputValue("");
    setIsLoading(false);
  }, [clientId]);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const visibleMessages = React.useMemo(() => {
    const slice = messages.slice(-MAX_VISIBLE_MESSAGES);
    const n = slice.length;
    return slice.map((m, i) => {
      const fade =
        n <= 1 ? 1 : 0.45 + (i / Math.max(1, n - 1)) * 0.55;
      return { message: m, fade };
    });
  }, [messages]);

  const showSuggestions = messages.length === 0 && !isLoading;

  const thinking =
    isLoading &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "assistant" &&
    messages[messages.length - 1]?.content.trim() === "";

  const sendMessage = React.useCallback(
    async (rawText: string) => {
      const input = rawText.trim();
      if (!input || isLoading) return;

      const historySource = messages.filter(
        (m) => !(m.role === "assistant" && !m.content.trim()),
      );
      const conversationHistory = historySource.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input,
      };
      const assistantId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setInputValue("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/elia/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input,
            conversationHistory,
            clientId,
          }),
        });

        if (!res.ok) {
          const errText =
            res.status === 404
              ? "I couldn’t load this member’s profile. Try again."
              : "I’m having trouble connecting. Please try again.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: errText } : m,
            ),
          );
          return;
        }

        const data = (await res.json()) as { text?: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: data.text?.trim() || "No response received." }
              : m,
          ),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "I’m having trouble connecting right now. Please try again.",
                }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [clientId, isLoading, messages],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#E5E4DF] bg-white">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        <div className="flex min-h-full flex-col justify-end gap-2">
          {showSuggestions && (
            <div className="mb-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void sendMessage(s)}
                  className="rounded-full border border-stone-200 bg-[#F9F9F6] px-3 py-1.5 text-left text-xs text-stone-700 transition-colors hover:border-[#D4AF37]/50 hover:bg-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {visibleMessages.map(({ message: m, fade }) => (
            <div
              key={m.id}
              className={cn(
                "flex w-full gap-2",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
              style={{ opacity: fade }}
            >
              {m.role === "assistant" && (
                <span
                  className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#D4AF37]/35 bg-white font-[family-name:var(--font-playfair)] text-[10px] font-semibold text-[#9A7B2E] shadow-sm"
                  aria-hidden
                >
                  E
                </span>
              )}
              <div
                className={cn(
                  "max-w-[85%] px-3 py-2 text-sm leading-snug",
                  m.role === "user"
                    ? "rounded-2xl rounded-tr-sm bg-stone-100 text-stone-900"
                    : "rounded-2xl rounded-tl-sm border border-[#E5E4DF] bg-[#F9F9F6] text-stone-800 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]",
                )}
              >
                {m.content.trim() ? (
                  m.content
                ) : m.role === "assistant" && thinking ? (
                  <span className="animate-pulse text-stone-500">
                    Elia is thinking…
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#E5E4DF] px-3 pb-3 pt-2">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400">
          Ask Elia about {firstName}
        </p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(inputValue);
          }}
        >
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question…"
            disabled={isLoading}
            className="h-10 flex-1 rounded-full border-stone-200 text-sm focus-visible:border-[#D4AF37] focus-visible:ring-1 focus-visible:ring-[#D4AF37]"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-white transition-colors hover:bg-[#C9A227] disabled:pointer-events-none disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
