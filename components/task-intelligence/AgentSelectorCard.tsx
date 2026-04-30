"use client";

import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CompletionRing } from "./CompletionRing";
import type { TaskIntelligenceAgentSummary } from "@/lib/types/database";

interface AgentSelectorCardProps {
  agent: TaskIntelligenceAgentSummary;
  selected: boolean;
  onSelect: () => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function AgentSelectorCard({
  agent,
  selected,
  onSelect,
  tabIndex = 0,
  onKeyDown,
}: AgentSelectorCardProps) {
  const first = agent.full_name.trim().split(/\s+/)[0] ?? agent.full_name;

  return (
    <button
      type="button"
      data-agent-card
      onClick={onSelect}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      className={cn(
        "flex flex-col items-center gap-1.5 min-w-[76px] px-2 py-2 rounded-xl border border-transparent transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/45",
        selected && "shadow-[0_0_0_2px_#D4AF37] bg-[#FDF9EE]/80",
        !selected && "hover:bg-[#FAFAF8]",
        agent.is_on_leave && "opacity-60 grayscale",
      )}
    >
      <Avatar className="h-10 w-10 ring-1 ring-[#E5E4DF]">
        <AvatarImage src={undefined} alt="" />
        <AvatarFallback className="bg-[#D4AF37]/15 text-[#A88B25] text-xs font-semibold">
          {getInitials(agent.full_name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-[11px] font-medium text-[#1A1A1A] truncate max-w-[72px]">{first}</span>
      {agent.is_on_leave ? (
        <span className="text-[9px] uppercase tracking-wide text-[#8A8A6E] bg-[#F2F2EE] px-1.5 py-0.5 rounded-full">
          On Leave
        </span>
      ) : (
        <CompletionRing
          percentage={agent.todaySopCompletionPct}
          size={36}
          strokeWidth={2.5}
          label={`${agent.todaySopCompletionPct}%`}
        />
      )}
    </button>
  );
}
