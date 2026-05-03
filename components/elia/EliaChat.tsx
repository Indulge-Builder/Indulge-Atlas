"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { cn } from "@/lib/utils";
import { EliaChatMessage, type EliaMessage } from "@/components/elia/EliaChatMessage";

const WELCOME_ID = "elia-welcome";

const SUGGESTIONS = [
  "Which active Premium members are expiring in the next 3 months?",
  "Which Ananyshree members would love a yacht experience?",
  "Show me premium members form Delhi",
  "Which members like wine?",
] as const;

export function EliaChat({ clientCount }: { clientCount: number }) {
  const welcomeContent = React.useMemo(
    () =>
      `Hello. I'm Elia, your member intelligence assistant. I have access to ${clientCount.toLocaleString("en-IN")} member profiles. Ask me anything — who prefers window seats, which members love Japanese cuisine, who's expiring this month...`,
    [clientCount],
  );

  const [messages, setMessages] = React.useState<EliaMessage[]>(() => [
    {
      id: WELCOME_ID,
      role: "assistant",
      content: welcomeContent,
      timestamp: new Date(),
    },
  ]);

  React.useEffect(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === WELCOME_ID ? { ...m, content: welcomeContent } : m,
      ),
    );
  }, [welcomeContent]);

  const [inputValue, setInputValue] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingAssistantId, setLoadingAssistantId] = React.useState<
    string | null
  >(null);
  const [hasLoadedContext, setHasLoadedContext] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const showSuggestions =
    messages.filter((m) => m.role === "user").length === 0;

  const recentUserQuestions = React.useMemo(() => {
    const qs = messages
      .filter((m) => m.role === "user" && m.content.trim())
      .map((m) => m.content.trim());
    const seen = new Set<string>();
    const unique: string[] = [];
    for (let i = qs.length - 1; i >= 0 && unique.length < 5; i -= 1) {
      const q = qs[i]!;
      if (seen.has(q)) continue;
      seen.add(q);
      unique.push(q);
    }
    return unique;
  }, [messages]);

  const sendMessage = React.useCallback(
    async (rawText: string) => {
      const input = rawText.trim();
      if (!input || isLoading) return;

      const conversationHistory = messages
        .filter((m) => m.id !== WELCOME_ID)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const userMessage: EliaMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input,
        timestamp: new Date(),
      };

      const assistantMessageId = crypto.randomUUID();
      setLoadingAssistantId(assistantMessageId);

      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
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
          }),
        });

        if (!res.ok) {
          throw new Error("Request failed");
        }

        const data = (await res.json()) as { text?: string };

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: data.text ?? "" }
              : m,
          ),
        );

        setHasLoadedContext(true);
      } catch {
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== assistantMessageId)
            .concat({
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "I'm having trouble connecting right now. Please try again.",
              timestamp: new Date(),
            }),
        );
      } finally {
        setLoadingAssistantId(null);
        setIsLoading(false);
      }
    },
    [isLoading, messages],
  );

  const onSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void sendMessage(inputValue);
    },
    [inputValue, sendMessage],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage(inputValue);
      }
    },
    [inputValue, sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 w-full overflow-hidden">
      {/* Left panel — light rail aligned with dashboard “paper” surfaces */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-[#E5E4DF] bg-[#F2F2EE] sm:w-72">
        <div className="flex min-h-0 flex-1 flex-col gap-5 p-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-[#1A1814]",
                "border border-[#E5E4DF] bg-white shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]",
                "ring-2 ring-[#D4AF37]/25",
              )}
            >
              E
            </div>
            <div className="min-w-0 pt-0.5">
              <h1 className="font-serif text-lg font-semibold tracking-tight text-[#1A1814]">
                Elia
              </h1>
              <p className="mt-0.5 text-xs leading-snug text-[#6b6b6b]">
                Preview · {clientCount.toLocaleString("en-IN")} members indexed
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-olive">
              Recent questions
            </p>
            {recentUserQuestions.length === 0 ? (
              <p className="text-xs leading-relaxed text-[#6b6b6b]">
                Your questions will appear here.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {recentUserQuestions.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-transparent px-2 py-1.5 text-left text-xs leading-snug text-[#3d3d3d] transition hover:border-[#D4AF37]/35 hover:bg-white/90 hover:text-[#1A1814]"
                      onClick={() => void sendMessage(q)}
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p
            className="text-[10px] leading-snug text-muted-olive"
            data-elia-context={hasLoadedContext ? "warm" : "cold"}
          >
            Preview uses a context window. Full retrieval is planned for a
            later phase.
          </p>
        </div>
      </aside>

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#F9F9F6]">
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="mt-auto flex flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
            {messages.map((m) => (
              <EliaChatMessage
                key={m.id}
                message={m}
                showThinking={
                  isLoading &&
                  loadingAssistantId !== null &&
                  m.id === loadingAssistantId &&
                  m.role === "assistant" &&
                  m.content.length === 0
                }
              />
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-[#E5E4DF] bg-white/85 px-4 py-4 backdrop-blur-sm sm:px-6">
          {showSuggestions ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-full border border-[#E5E4DF] bg-[#F9F9F6] px-3 py-1.5 text-left text-xs leading-snug text-[#3d3d3d] transition hover:border-[#D4AF37]/55 hover:bg-white hover:text-[#1A1814]"
                  onClick={() => void sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="flex gap-2">
            <textarea
              rows={2}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isLoading}
              placeholder="Ask about your members..."
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-[#E5E4DF] bg-[#F9F9F6] px-3 py-2.5 text-sm text-[#1A1814] shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] outline-none ring-0 transition placeholder:text-[#8a8a8e] focus:border-[#D4AF37] focus:bg-white focus:ring-2 focus:ring-[#D4AF37]/25 disabled:opacity-60"
            />
            <IndulgeButton
              type="submit"
              variant="gold"
              className="self-end shrink-0 gap-2 px-4"
              loading={isLoading}
              disabled={isLoading || !inputValue.trim()}
              leftIcon={<Send className="h-4 w-4" aria-hidden />}
            >
              Send
            </IndulgeButton>
          </form>
        </div>
      </div>
    </div>
  );
}
