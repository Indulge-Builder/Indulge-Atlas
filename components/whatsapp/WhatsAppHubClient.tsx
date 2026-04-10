"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecentWhatsAppConversation } from "@/lib/actions/whatsapp";
import { ActiveChatPanel } from "@/components/whatsapp/ActiveChatPanel";

function initials(first: string, last: string | null): string {
  const a = (first ?? "").trim()[0] ?? "";
  const b = (last ?? "").trim()[0] ?? "";
  const s = `${a}${b}`.trim();
  return s ? s.toUpperCase() : "—";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WhatsAppHubClient({
  initialConversations,
}: {
  initialConversations: RecentWhatsAppConversation[];
}) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialConversations;
    return initialConversations.filter((c) => {
      const name = `${c.lead.first_name} ${c.lead.last_name ?? ""}`.trim().toLowerCase();
      return name.includes(q);
    });
  }, [initialConversations, query]);

  return (
    <div className="h-full min-h-0 px-8 py-6">
      <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]">
        <div className="grid h-full min-h-0 grid-cols-[400px_1fr]">
          {/* Left: conversation list */}
          <aside className="min-h-0 border-r border-stone-200 bg-stone-50/50">
            <div className="border-b border-stone-200 px-4 py-4">
              <p
                className="text-sm font-semibold text-[#1A1A1A]"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                Messages
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
                <Search className="h-4 w-4 text-stone-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full bg-transparent text-sm text-[#1A1A1A] placeholder:text-stone-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-sm text-stone-500">
                  No conversations match your search.
                </p>
              )}

              {filtered.map((c) => {
                const isActive = selectedLeadId === c.lead.id;
                const name = `${c.lead.first_name} ${c.lead.last_name ?? ""}`.trim();
                return (
                  <button
                    key={c.lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(c.lead.id)}
                    className={cn(
                      "relative flex w-full items-center gap-3 border-b border-stone-100 p-4 text-left transition-colors hover:bg-stone-100",
                      isActive && "bg-white shadow-sm ring-1 ring-stone-200 z-10",
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
                      {initials(c.lead.first_name, c.lead.last_name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                          {name || "Unknown Lead"}
                        </p>
                        <p className="shrink-0 text-xs text-stone-400 tabular-nums">
                          {formatTime(c.latestMessage.created_at)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-sm text-stone-500">
                        {c.latestMessage.content}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: active chat */}
          <section className="min-h-0 bg-[#FAFAF9]">
            <ActiveChatPanel selectedLeadId={selectedLeadId} />
          </section>
        </div>
      </div>
    </div>
  );
}

