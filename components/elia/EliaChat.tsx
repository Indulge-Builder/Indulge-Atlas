"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowUp,
  BarChart2,
  Filter,
  Search,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import {
  EliaChatMessage,
  countDistinctMemberMentionsInText,
  type EliaMessage,
} from "@/components/elia/EliaChatMessage";

const WELCOME_CHIPS = [
  {
    q: "Which Premium members are expiring soon?",
    cat: "Renewal Intelligence",
  },
  { q: "Who are our sunrise people?", cat: "Preference Search" },
  {
    q: "Which members would love a yacht experience?",
    cat: "Segment Analysis",
  },
  { q: "Who hasn't been profiled yet?", cat: "Member Lookup" },
] as const;

const CAPABILITY_PILLS = [
  { icon: Search, label: "Member Lookup" },
  { icon: Filter, label: "Preference Search" },
  { icon: BarChart2, label: "Segment Analysis" },
  { icon: Zap, label: "Renewal Intelligence" },
] as const;

function BreathingGlow({
  className,
  diameter = 200,
}: {
  className?: string;
  diameter?: number;
}) {
  return (
    <span
      className={cn("pointer-events-none absolute rounded-full", className)}
      style={{
        width: diameter,
        height: diameter,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        background:
          "radial-gradient(circle, rgb(95 83 72 / 0.14) 0%, transparent 68%)",
        animation: "eliaBreathe 3s ease-in-out infinite",
        animationDelay: "0.6s",
      }}
    />
  );
}

function GlyphAvatar({
  size,
  glowDiameter,
}: {
  size: "sm" | "lg";
  glowDiameter?: number;
}) {
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full",
        sm ? "h-7 w-7" : "h-16 w-16",
      )}
    >
      <BreathingGlow
        diameter={glowDiameter ?? (sm ? 200 : 240)}
        className={cn(!sm && "opacity-100")}
      />
      <div
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full",
          sm ? "h-7 w-7" : "h-16 w-16",
          sm
            ? "border border-brand-gold/35 bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]"
            : "border border-white/10 bg-[#1A1814] shadow-[0_1px_4px_0_rgb(0_0_0/0.08)]",
        )}
      >
        <span
          className={cn(
            "font-serif font-bold leading-none text-brand-gold",
            sm ? "text-[15px]" : "text-[28px]",
          )}
        >
          E
        </span>
      </div>
    </div>
  );
}

export function EliaChat({ clientCount }: { clientCount: number }) {
  const [messages, setMessages] = React.useState<EliaMessage[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingAssistantId, setLoadingAssistantId] = React.useState<
    string | null
  >(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const hasUserMessages = messages.some((m) => m.role === "user");

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

  const userQuestionCount = React.useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages],
  );

  const membersDiscussedCount = React.useMemo(() => {
    const acc = new Set<string>();
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      countDistinctMemberMentionsInText(m.content).forEach((n) =>
        acc.add(n),
      );
    }
    return acc.size;
  }, [messages]);

  const adjustTextareaHeight = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  const sendMessage = React.useCallback(
    async (rawText: string) => {
      const input = rawText.trim();
      if (!input || isLoading) return;

      const conversationHistory = messages
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

  const memberLabel = `${clientCount.toLocaleString("en-IN")} profiles`;
  const canSend = inputValue.trim().length > 0 && !isLoading;

  return (
    <div
      className={cn(
        "atlas-masthead-texture relative flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-[#1A1814]",
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes eliaBreathe {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.85; }
}
@keyframes eliaDotPulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}
.elia-dot-pulse {
  animation: eliaDotPulse 1.2s ease-in-out infinite;
}
`,
        }}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <motion.header
          className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[#E5E4DF] bg-white/90 px-5 backdrop-blur-md"
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex min-w-0 items-center justify-start">
            <GlyphAvatar size="sm" glowDiameter={200} />
          </div>
          <span className="pointer-events-none font-serif text-base font-medium tracking-tight text-[#1A1814]">
            Elia
          </span>
          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
            <span
              className="inline-flex items-center gap-2"
              title="Connection status"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                style={{
                  boxShadow: "0 0 6px rgb(74 124 89 / 0.45)",
                }}
              />
              <span className="text-[11px] font-normal text-success">
                Online
              </span>
            </span>
          </div>
        </motion.header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <motion.aside
            className="hidden w-[280px] shrink-0 flex-col border-r border-[#E5E4DF] bg-[#F2F2EE] md:flex"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{
              delay: 0.2,
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-6 px-5 py-6">
              <div>
                <p className="mb-3 text-[9px] font-normal tracking-[0.2em] text-[#6b6b6b]">
                  CAPABILITIES
                </p>
                <div className="flex flex-col gap-2">
                  {CAPABILITY_PILLS.map(({ icon: Icon, label }) => (
                    <div
                      key={label}
                      className={cn(
                        "flex cursor-default items-center gap-2 rounded-full border border-[#E5E4DF] bg-white px-3 py-1.5 text-xs text-[#6b6b6b] shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] transition-all duration-200",
                        "hover:border-brand-gold/35 hover:bg-brand-gold/8 hover:text-[#1A1814]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-brand-gold" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-px shrink-0 bg-[#E5E4DF]" />

              <div className="min-h-0 flex-1">
                <p className="mb-2 text-[9px] font-normal tracking-[0.2em] text-[#6b6b6b]">
                  RECENT
                </p>
                {recentUserQuestions.length === 0 ? (
                  <p className="text-xs font-normal leading-relaxed text-[#6b6b6b]">
                    Your questions will appear here.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {recentUserQuestions.map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          className="group flex w-full cursor-pointer items-start gap-1 py-1.5 text-left text-xs font-normal text-[#6b6b6b] transition-colors duration-200 hover:text-[#1A1814]"
                          onClick={() => void sendMessage(q)}
                        >
                          <span className="shrink-0 text-brand-gold/40 transition-colors group-hover:text-brand-gold">
                            ›
                          </span>
                          <span className="min-w-0 pl-0.5">{q}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-auto border-t border-[#E5E4DF] pt-4">
                <p className="text-[10px] font-normal text-[#6b6b6b]">Preview Mode</p>
                <p className="text-[10px] font-normal text-[#6b6b6b]">
                  Full RAG · Phase 3
                </p>
              </div>
            </div>
          </motion.aside>

          <div className="flex min-w-0 flex-1 flex-col bg-[#F9F9F6]">
            <div
              ref={scrollRef}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            >
              {!hasUserMessages ? (
                <motion.div
                  className="flex flex-1 flex-col items-center justify-center px-8 py-10"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.4,
                    duration: 0.6,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <span
                    className="select-none text-7xl leading-none opacity-[0.42] drop-shadow-[0_2px_12px_rgb(95_83_72/0.12)]"
                    aria-hidden
                  >
                    ✨
                  </span>
                  <p className="mt-4 text-center font-serif text-2xl font-normal italic text-[#1A1814]">
                    How can I help you today?
                  </p>
                  <p className="mt-2 max-w-md text-center text-[13px] font-normal text-[#6b6b6b]">
                    I know your members deeply. Ask me anything.
                  </p>
                  <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                    {WELCOME_CHIPS.map(({ q, cat }) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void sendMessage(q)}
                        className={cn(
                          surfaceCardVariants({
                            tone: "luxury",
                            elevation: "sm",
                            overflow: "visible",
                          }),
                          "group cursor-pointer px-4 py-3 text-left transition-all duration-200",
                          "hover:border-brand-gold/40 hover:shadow-[0_0_16px_-3px_rgb(95_83_72/0.12)]",
                        )}
                      >
                        <span className="block text-[13px] font-medium text-[#6b6b6b] transition-colors duration-200 group-hover:text-[#1A1814]">
                          {q}
                        </span>
                        <span className="mt-1 block text-[11px] font-normal text-[#6b6b6b] transition-colors duration-200 group-hover:text-brand-gold-dark">
                          {cat}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="flex min-h-full flex-col justify-end gap-6 px-8 py-6">
                  {messages.map((m, idx) => {
                    const prev = messages[idx - 1];
                    const isFirstInAssistantSequence =
                      m.role === "assistant" &&
                      (idx === 0 || prev?.role !== "assistant");
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      >
                        <EliaChatMessage
                          message={m}
                          isFirstInAssistantSequence={isFirstInAssistantSequence}
                          showThinking={
                            isLoading &&
                            loadingAssistantId !== null &&
                            m.id === loadingAssistantId &&
                            m.role === "assistant" &&
                            m.content.length === 0
                          }
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[#E5E4DF] bg-white/90 px-8 pb-5 pt-4 backdrop-blur-sm">
              <form onSubmit={onSubmit}>
                <div
                  className={cn(
                    "flex items-center rounded-[14px] border border-[#E5E4DF] bg-white py-1 pl-4 pr-1 transition-[border-color,box-shadow] duration-200",
                    "focus-within:border-brand-gold focus-within:shadow-[0_0_0_3px_rgb(95_83_72/0.08)] focus-within:ring-2 focus-within:ring-brand-gold/20",
                  )}
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      requestAnimationFrame(adjustTextareaHeight);
                    }}
                    onInput={adjustTextareaHeight}
                    onKeyDown={onKeyDown}
                    disabled={isLoading}
                    placeholder="Ask Elia anything about your members..."
                    className="max-h-[120px] min-h-0 flex-1 resize-none border-0 bg-transparent py-3 font-sans text-sm font-normal text-[#1A1814] outline-none placeholder:text-[#6b6b6b]"
                  />
                  <button
                    type="submit"
                    disabled={!canSend}
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-150",
                      "active:scale-95",
                      canSend
                        ? "bg-brand-gold text-surface hover:bg-brand-gold-dark"
                        : "cursor-not-allowed bg-[#F2F2EE] text-[#6b6b6b]",
                    )}
                    aria-label="Send message"
                  >
                    <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </button>
                </div>
              </form>
              <p className="mt-3 text-center font-sans text-[10px] font-normal tracking-widest text-[#6b6b6b]">
                Elia · Indulge Member Intelligence · Preview
              </p>
            </div>
          </div>

          <motion.aside
            className="hidden w-[260px] shrink-0 flex-col border-l border-[#E5E4DF] bg-[#F2F2EE] md:flex"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{
              delay: 0.2,
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div className="flex flex-col gap-6 px-5 py-6">
              <div>
                <p className="mb-3 text-[9px] font-normal tracking-[0.2em] text-[#6b6b6b]">
                  INTELLIGENCE
                </p>
                <div
                  className={cn(
                    surfaceCardVariants({
                      tone: "luxury",
                      elevation: "xs",
                      overflow: "visible",
                    }),
                    "flex flex-col px-3 py-1",
                  )}
                >
                  {(
                    [
                      ["Members loaded", memberLabel],
                      [
                        "Active accounts",
                        `${clientCount.toLocaleString("en-IN")} active`,
                      ],
                      ["With preferences", "121 profiled"],
                      ["Context window", "~31k tokens"],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between border-b border-[#E5E4DF] py-2 last:border-b-0"
                    >
                      <span className="text-xs font-normal text-[#6b6b6b]">
                        {label}
                      </span>
                      <span className="font-mono text-[13px] font-medium text-[#1A1814]">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-px bg-[#E5E4DF]" />

              <div>
                <p className="mb-3 text-[9px] font-normal tracking-[0.2em] text-[#6b6b6b]">
                  THIS SESSION
                </p>
                <div
                  className={cn(
                    surfaceCardVariants({
                      tone: "luxury",
                      elevation: "xs",
                      overflow: "visible",
                    }),
                    "flex flex-col px-3 py-1",
                  )}
                >
                  <div className="flex items-center justify-between border-b border-[#E5E4DF] py-2">
                    <span className="text-xs font-normal text-[#6b6b6b]">
                      Questions asked
                    </span>
                    <span className="font-mono text-[13px] font-medium text-[#1A1814]">
                      {userQuestionCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs font-normal text-[#6b6b6b]">
                      Members discussed
                    </span>
                    <span className="font-mono text-[13px] font-medium text-[#1A1814]">
                      {membersDiscussedCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-[#E5E4DF]" />

              <div>
                <p className="text-xs font-normal italic leading-[1.6] text-[#6b6b6b]">
                  Elia reads your entire member database on every query,
                  surfacing preferences, patterns, and opportunities your team
                  would take hours to find manually.
                </p>
                <p className="mt-2 text-[11px] font-normal leading-relaxed text-[#6b6b6b]">
                  Phase 3 will add voice, RAG, and real-time enrichment.
                </p>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
