"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { DOMAIN_CONFIG } from "@/lib/constants/departments";
import { DomainFilterTabs } from "@/components/admin/shared/DomainFilterTabs";
import { ShiftEditModal } from "@/components/admin/shifts/ShiftEditModal";
import { clearAgentShift } from "@/lib/actions/agentAssignment";
import type { AgentWithRoutingStatus } from "@/lib/types/agentAssignment";
import type { IndulgeDomain } from "@/lib/types/database";

interface Props {
  initialAgents: AgentWithRoutingStatus[];
}

function formatShift(start: string | null, end: string | null): string {
  if (!start || !end) return "Always on";
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

export function ShiftsClient({ initialAgents }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [domain, setDomain] = useState<IndulgeDomain | "all">("all");
  const [editing, setEditing] = useState<AgentWithRoutingStatus | null>(null);

  const visible = domain === "all"
    ? initialAgents
    : initialAgents.filter((a) => a.domain === domain);

  function handleClearShift(agent: AgentWithRoutingStatus) {
    setPendingId(agent.id);
    startTransition(async () => {
      const res = await clearAgentShift(agent.id, agent.domain);
      if (res.success) {
        toast.success("Shift cleared");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to clear shift");
      }
      setPendingId(null);
    });
  }

  return (
    <div>
      <DomainFilterTabs value={domain} onChange={setDomain} />

      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "overflow-hidden")}>
        {visible.length === 0 ? (
          <p className="text-center py-16 text-[#B5A99A] text-sm">
            No agents found for this domain.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EEEDE9] bg-[#FAFAF8]">
                {["Agent", "Domain", "Shift window (IST)", "Daily cap", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-[#B5A99A] uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEDE9]">
              {visible.map((agent) => {
                const domainCfg = DOMAIN_CONFIG[agent.domain];
                const loading = isPending && pendingId === agent.id;
                const hasShift = !!agent.shift_start;

                return (
                  <tr key={agent.id} className="hover:bg-[#FAFAF8] transition-colors">
                    {/* Agent */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#EDE8E1] flex items-center justify-center text-xs font-semibold text-[#5f5348] shrink-0">
                          {getInitials(agent.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1A1814]">{agent.full_name}</p>
                          <p className="text-xs text-[#B5A99A]">{agent.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Domain */}
                    <td className="px-6 py-4">
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{ background: domainCfg.pillBg, color: domainCfg.pillColor }}
                      >
                        {domainCfg.label.replace("Indulge ", "")}
                      </span>
                    </td>

                    {/* Shift */}
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-sm",
                        hasShift ? "text-[#1A1814] font-medium" : "text-[#B5A99A]",
                      )}>
                        {formatShift(agent.shift_start, agent.shift_end)}
                      </span>
                    </td>

                    {/* Daily cap */}
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-sm",
                        agent.daily_cap !== null ? "text-[#1A1814] font-medium" : "text-[#B5A99A]",
                      )}>
                        {agent.daily_cap !== null ? `${agent.daily_cap} leads/day` : "No cap"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditing(agent)}
                          className="p-1.5 rounded text-[#B5A99A] hover:text-[#5f5348] hover:bg-[#F2F0EB] transition-colors"
                          title="Edit shift"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {hasShift && (
                          <button
                            disabled={loading}
                            onClick={() => handleClearShift(agent)}
                            className="p-1.5 rounded text-[#B5A99A] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Clear shift"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs text-[#B5A99A]">
        Agents without a shift window are eligible to receive leads at any hour. Shift times are interpreted in IST (Asia/Kolkata).
      </p>

      {editing && (
        <ShiftEditModal
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
